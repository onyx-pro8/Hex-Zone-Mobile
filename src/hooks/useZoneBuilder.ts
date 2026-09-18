import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { toast } from "@/lib/toast";
import {
  loadExpoLocation,
  readDeviceLocation,
  LOCATION_UNAVAILABLE_MESSAGE,
} from "@/lib/expoLocation";
import { getMembers } from "@/api/members";
import {
  createZone,
  deleteZone,
  generateZoneReference,
  getZoneCapabilities,
  getZones,
  listCommunalIds,
  listPublicZones,
  listZonesForCommunalId,
  previewDynamicZone,
  updateZone,
  validateZoneReference,
  type CommunalIdRow,
  type CommunalZoneSummary,
  type CreateZonePayload,
  type DynamicZonePreviewResult,
  type GovernmentAddressMode,
  type SavedZone,
  type UpdateZonePayload,
  type ZoneCapabilities,
  type ZoneReferenceValidateResult,
  type ZoneType,
} from "@/api/zones";
import { AUTH_MAP_DEFAULT_CENTER, type LatLng } from "@/lib/h3";
import { getStoredMapCenter, setStoredMapCenter } from "@/lib/storage";
import {
  circleToGeoJsonPolygon,
  colorForZoneType,
  canDeleteSavedZone,
  canEditSavedZone,
  isClosedPolygon,
  layerFocusPoint,
  latLngRingToGeoJsonPolygon,
  normalizeZoneType,
  readZoneCenter,
  readZoneCircles,
  readZoneRings,
  ringsFromGeoJsonPolygon,
  savedZoneRecordId,
  zoneRecordToLayer,
  type MapZoneLayer,
  type ZoneCircle,
} from "@/lib/zoneGeometry";

/** Draw-tool id returned when loading a saved zone for edit. */
export type ZoneEditToolId =
  | "polygon"
  | "circle"
  | "grid"
  | "proximity"
  | "dynamic"
  | "communal_id"
  | "government_local_code"
  | "object";

export type GovernmentFields = {
  postal: string;
  city: string;
  country: string;
  street: string;
  streetNumber: string;
};

export const DEFAULT_GOVERNMENT_FIELDS: GovernmentFields = {
  postal: "",
  city: "",
  country: "",
  street: "",
  streetNumber: "",
};

export type ProximitySourceMode = "current_location" | "map_pin";

export type ZoneBuilderState = ReturnType<typeof useZoneBuilder>;

export const MAX_ZONE_NAME_LENGTH = 120;

export type ZoneBuilderScope = {
  currentUserId?: string;
  currentUserName?: string;
  isAccountAdministrator?: boolean;
  /** @deprecated Individuals no longer receive Communal IDs. */
  assignedCommunalId?: string | null;
  /** @deprecated Members/Individuals no longer use Communal tools. */
  communalIdLocked?: boolean;
  /** Network admins may validate/generate Communal IDs and attach them to primaries. */
  canUseCommunalTools?: boolean;
};

function resolveZoneOwnerName(
  zone: SavedZone,
  nameById: Map<string, string>,
): SavedZone {
  const existing =
    typeof zone.owner_name === "string" ? zone.owner_name.trim() : "";
  if (existing && !/^Owner #\d+$/i.test(existing)) {
    return zone;
  }
  const oid =
    zone.creator_id != null
      ? String(zone.creator_id)
      : zone.owner_id != null
        ? String(zone.owner_id)
        : "";
  const resolved = oid ? nameById.get(oid) : undefined;
  return resolved ? { ...zone, owner_name: resolved } : zone;
}

/** True when a zone config lists this Communal ID. */
export function zoneHasCommunalId(
  zone: SavedZone,
  referenceId: string,
): boolean {
  const wanted = referenceId.trim().toUpperCase();
  if (!wanted) return false;
  const cfg = (zone.config ?? {}) as Record<string, unknown>;
  const raw = cfg.communal_ids ?? cfg.communalIds;
  const ids: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        ids.push(item.trim().toUpperCase());
      }
    }
  }
  const legacy = cfg.communal_id ?? cfg.communalId;
  if (typeof legacy === "string" && legacy.trim()) {
    ids.push(legacy.trim().toUpperCase());
  }
  return ids.includes(wanted);
}

export function useZoneBuilder(
  ownerZoneId: string | undefined,
  scope?: ZoneBuilderScope,
) {
  const canUseCommunalTools = Boolean(
    scope?.canUseCommunalTools ?? scope?.isAccountAdministrator,
  );
  const communalIdLocked = false;
  const assignedCommunalId = "";

  const [layers, setLayers] = useState<MapZoneLayer[]>([]);
  /**
   * Zones tagged with this network's Communal IDs (often other networks).
   * Drawn on the map, but not listed under Zones — open via Communal ID tap.
   */
  const [communalMapLayers, setCommunalMapLayers] = useState<MapZoneLayer[]>(
    [],
  );
  /** All public Communal IDs (any network) — used by the attach picker. */
  const [publicCommunalIds, setPublicCommunalIds] = useState<CommunalIdRow[]>(
    [],
  );
  /** Communal IDs minted on this network — zones list sidebar only. */
  const networkCommunalIds = useMemo(() => {
    const mine = String(ownerZoneId ?? "").trim();
    if (!mine) return [];
    return publicCommunalIds.filter(
      (row) => String(row.network_id ?? "").trim() === mine,
    );
  }, [ownerZoneId, publicCommunalIds]);

  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setErrorState] = useState<string | null>(null);
  /** Inline/status error only — never auto-toasts (avoids duplicate toasts). */
  const setError = useCallback((message: string | null) => {
    setErrorState(message);
  }, []);
  /** Set inline error and show a single error toast. */
  const notifyError = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setErrorState(trimmed);
    toast.error(trimmed);
  }, []);
  const [capabilities, setCapabilities] = useState<ZoneCapabilities | null>(
    null,
  );
  /** Admin create tier: true = primary, false = secondary. Always secondary for non-admins. */
  const [createAsPrimary, setCreateAsPrimary] = useState(false);

  /** DB record id of the zone currently loaded for edit (`null` = create mode). */
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZoneName, setEditingZoneName] = useState<string | null>(null);

  const [zoneType, setZoneType] = useState<ZoneType>("geofence");
  const [zoneName, setZoneName] = useState("My zone");
  const [zoneDescription, setZoneDescription] = useState("");
  const [mapCenter, setMapCenter] = useState<LatLng>(AUTH_MAP_DEFAULT_CENTER);

  // geofence / grid drawing state
  const [draftRing, setDraftRing] = useState<LatLng[]>([]);
  /** Points removed by undo — restored by redo (cleared on new vertex). */
  const [polygonRedoStack, setPolygonRedoStack] = useState<LatLng[]>([]);
  const [draftCircle, setDraftCircle] = useState<ZoneCircle | null>(null);
  const [selectedH3Cells, setSelectedH3Cells] = useState<string[]>([]);
  /** Last H3 toggle actions — used to undo cell add/remove. */
  const [h3UndoStack, setH3UndoStack] = useState<
    { op: "add" | "remove"; cell: string }[]
  >([]);
  const [h3Resolution, setH3ResolutionState] = useState(9);
  const [geofenceTool, setGeofenceTool] = useState<"polygon" | "circle">(
    "polygon",
  );

  // proximity
  const [proximityCenter, setProximityCenter] = useState<LatLng | null>(null);
  const [proximityRadius, setProximityRadius] = useState(150);
  const [proximitySource, setProximitySource] =
    useState<ProximitySourceMode>("map_pin");
  const [proximityLocating, setProximityLocating] = useState(false);
  const [locationRequestNonce, setLocationRequestNonce] = useState(0);
  const locationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fitDraftToken, setFitDraftToken] = useState(0);
  /** "map" = pan only (initial GPS). "proximity" = lock proximity source. */
  const locationIntentRef = useRef<"map" | "proximity">("map");
  /** When false, a late GPS fix will not steal the camera from the user. */
  const allowInitialGpsRef = useRef(true);

  // dynamic
  const [dynamicTarget, setDynamicTarget] = useState(5);
  const [dynamicMin, setDynamicMin] = useState(200);
  const [dynamicMax, setDynamicMax] = useState(1000);
  const [dynamicPreview, setDynamicPreview] =
    useState<DynamicZonePreviewResult | null>(null);
  const [dynamicPreviewError, setDynamicPreviewError] = useState<string | null>(
    null,
  );
  const [dynamicPreviewLoading, setDynamicPreviewLoading] = useState(false);

  // communal
  const [communalCode, setCommunalCodeState] = useState("");
  const [communalValidation, setCommunalValidation] =
    useState<ZoneReferenceValidateResult | null>(null);
  const [communalValidating, setCommunalValidating] = useState(false);
  const [communalExists, setCommunalExists] = useState<boolean | null>(null);
  const [publicZones, setPublicZones] = useState<SavedZone[]>([]);
  const [publicZonesLoading, setPublicZonesLoading] = useState(false);
  const [selectedPublicZoneIds, setSelectedPublicZoneIds] = useState<number[]>(
    [],
  );
  const [matchedCommunalZones, setMatchedCommunalZones] = useState<
    CommunalZoneSummary[]
  >([]);
  const [definingCommunalIds, setDefiningCommunalIds] = useState<string[]>([]);

  const setCommunalCode = useCallback((value: string) => {
    setCommunalCodeState(value);
  }, []);

  const removeDefiningCommunalId = useCallback((id: string) => {
    const normalized = id.trim().toUpperCase();
    setDefiningCommunalIds((prev) =>
      prev.filter((item) => item !== normalized),
    );
  }, []);

  const addDefiningCommunalId = useCallback((id: string) => {
    const normalized = id.trim().toUpperCase();
    if (!normalized) return;
    setDefiningCommunalIds((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
  }, []);

  // government
  const [governmentMode, setGovernmentMode] =
    useState<GovernmentAddressMode>("postal");
  const [governmentFields, setGovernmentFields] = useState<GovernmentFields>(
    DEFAULT_GOVERNMENT_FIELDS,
  );
  const [governmentValidation, setGovernmentValidation] =
    useState<ZoneReferenceValidateResult | null>(null);
  const [governmentValidating, setGovernmentValidating] = useState(false);

  // object
  const [objectCenter, setObjectCenter] = useState<LatLng | null>(null);
  const [objectQuery, setObjectQuery] = useState("");
  const [objectReferenceId, setObjectReferenceId] = useState("");
  const [objectRadius, setObjectRadius] = useState(80);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const [zonesRes, capsRes, membersRes, communalRes] = await Promise.all([
      getZones(),
      getZoneCapabilities(),
      getMembers(),
      listCommunalIds(),
    ]);
    if (zonesRes.error) {
      setListError(zonesRes.error);
      if (zonesRes.error) toast.error(zonesRes.error);
    } else {
      setListError(null);
    }

    const communalRows =
      !communalRes.error && communalRes.data ? communalRes.data : [];
    setPublicCommunalIds(communalRows);

    const mine = String(ownerZoneId ?? "").trim();
    const myCommunalWithZones = communalRows.filter(
      (row) =>
        String(row.network_id ?? "").trim() === mine &&
        Number(row.zone_count ?? 0) > 0,
    );
    const sharedBatches = await Promise.all(
      myCommunalWithZones.map((row) =>
        listZonesForCommunalId(row.reference_id),
      ),
    );

    {
      const nameById = new Map<string, string>();
      for (const member of membersRes.data ?? []) {
        const label = member.name?.trim();
        if (member.id && label) nameById.set(String(member.id), label);
      }
      const selfId = scope?.currentUserId?.trim();
      const selfName = scope?.currentUserName?.trim();
      if (selfId && selfName) nameById.set(selfId, selfName);

      const ownById = new Map<string, SavedZone>();
      const communalById = new Map<string, SavedZone>();

      if (!zonesRes.error) {
        for (const row of zonesRes.data ?? []) {
          const resolved = resolveZoneOwnerName(row as SavedZone, nameById);
          if (row.shared_via_communal) {
            communalById.set(String(resolved.id), {
              ...resolved,
              shared_via_communal: true,
            });
          } else {
            ownById.set(String(resolved.id), resolved);
          }
        }
      }

      for (const batch of sharedBatches) {
        if (batch.error || !batch.data) continue;
        for (const row of batch.data) {
          const key = String(row.id);
          if (ownById.has(key)) continue;
          const resolved = resolveZoneOwnerName(
            { ...row, shared_via_communal: true },
            nameById,
          );
          communalById.set(key, resolved);
        }
      }

      setLayers(
        Array.from(ownById.values())
          .map((row, i) => zoneRecordToLayer(row, i))
          .filter((z): z is MapZoneLayer => z !== null),
      );
      setCommunalMapLayers(
        Array.from(communalById.values())
          .map((row, i) => zoneRecordToLayer(row, i))
          .filter((z): z is MapZoneLayer => z !== null),
      );
    }
    if (!capsRes.error && capsRes.data) {
      setCapabilities(capsRes.data);
      const caps = capsRes.data;
      const canPrimary =
        Boolean(scope?.isAccountAdministrator) &&
        String(caps.role ?? "").toLowerCase() === "administrator" &&
        (caps.can_create_primary ?? Boolean(caps.next_zone_is_primary)) === true &&
        (caps.max_primary ?? 0) > 0;
      if (canPrimary) {
        setCreateAsPrimary((prev) => {
          const canSecondary = caps.can_create_secondary ?? true;
          if (prev && canPrimary) return true;
          if (!prev && canSecondary) return false;
          return true;
        });
      } else {
        setCreateAsPrimary(false);
      }
    }
    setLoadingList(false);
  }, [
    ownerZoneId,
    scope?.currentUserId,
    scope?.currentUserName,
    scope?.isAccountAdministrator,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Live dynamic preview, debounced. */
  const dynamicDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (zoneType !== "dynamic") return;
    if (dynamicDebounce.current) clearTimeout(dynamicDebounce.current);
    if (dynamicTarget < 1 || dynamicMin <= 0 || dynamicMax < dynamicMin) {
      setDynamicPreview(null);
      setDynamicPreviewError(null);
      return;
    }
    setDynamicPreviewLoading(true);
    dynamicDebounce.current = setTimeout(async () => {
      setDynamicPreviewError(null);
      const result = await previewDynamicZone({
        target_user_count: Math.trunc(dynamicTarget),
        min_radius_meters: dynamicMin,
        max_radius_meters: dynamicMax,
      });
      setDynamicPreviewLoading(false);
      if (result.error) {
        setDynamicPreview(null);
        setDynamicPreviewError(result.error);
        return;
      }
      setDynamicPreview(result.data);
      if (
        result.data &&
        !result.data.infeasible &&
        result.data.center &&
        result.data.resolved_radius_meters
      ) {
        const next: LatLng = [
          result.data.center.latitude,
          result.data.center.longitude,
        ];
        allowInitialGpsRef.current = false;
        setMapCenter(next);
        setFitDraftToken((t) => t + 1);
        setStatus(
          `Cluster ready · ${result.data.matched_user_count} users · ${Math.round(
            result.data.resolved_radius_meters,
          )} m`,
        );
      }
    }, 450);
    return () => {
      if (dynamicDebounce.current) clearTimeout(dynamicDebounce.current);
    };
  }, [zoneType, dynamicTarget, dynamicMin, dynamicMax]);

  const resetDrafts = useCallback(() => {
    setDraftRing([]);
    setPolygonRedoStack([]);
    setDraftCircle(null);
    setSelectedH3Cells([]);
    setH3UndoStack([]);
    setProximityCenter(null);
    setObjectCenter(null);
    setObjectQuery("");
    setObjectReferenceId("");
    setCommunalValidation(null);
    setCommunalExists(null);
    setMatchedCommunalZones([]);
    setSelectedPublicZoneIds([]);
    setDefiningCommunalIds([]);
    setGovernmentValidation(null);
    setDynamicPreview(null);
    setDynamicPreviewError(null);
    setStatus(null);
    setError(null);
  }, []);

  const clearEditing = useCallback(() => {
    setEditingZoneId(null);
    setEditingZoneName(null);
  }, []);

  const cancelEdit = useCallback(() => {
    clearEditing();
    resetDrafts();
    setZoneName("My zone");
    setZoneDescription("");
    setZoneType("geofence");
    setGeofenceTool("polygon");
    setStatus(null);
  }, [clearEditing, resetDrafts]);

  const changeZoneType = useCallback(
    (next: ZoneType) => {
      setZoneType(next);
      resetDrafts();
    },
    [resetDrafts],
  );

  const beginEdit = useCallback(
    (layer: MapZoneLayer): ZoneEditToolId | null => {
      const zone = layer.raw;
      if (
        !canEditSavedZone(zone, {
          currentUserId: scope?.currentUserId,
          isAccountAdministrator: scope?.isAccountAdministrator,
        })
      ) {
        toast.warning(
          "You can edit only primary zones as administrator, or secondary zones you created.",
        );
        return null;
      }
      if (capabilities?.can_edit_active_zone === false) {
        toast.warning(
          capabilities.reason ?? "Editing is not available for your account right now.",
        );
        return null;
      }

      const recordId = savedZoneRecordId(zone);
      const type = normalizeZoneType(zone.type ?? zone.zone_type);
      const cfg =
        zone.config && typeof zone.config === "object"
          ? (zone.config as Record<string, unknown>)
          : {};

      resetDrafts();
      setEditingZoneId(recordId);
      setEditingZoneName(layer.name);
      setCreateAsPrimary(
        Boolean(
          zone.is_primary ??
            (zone as { isPrimary?: boolean }).isPrimary,
        ),
      );
      setZoneType(type);
      setZoneName(
        typeof zone.name === "string" && zone.name.trim()
          ? zone.name.trim()
          : layer.name,
      );
      setZoneDescription("");
      allowInitialGpsRef.current = false;

      let tool: ZoneEditToolId = "polygon";

      if (type === "geofence") {
        const rings = readZoneRings(zone);
        const circles = readZoneCircles(zone);
        if (rings[0] && rings[0].length >= 3) {
          setGeofenceTool("polygon");
          // Keep the ring open while editing so Undo / map taps can reshape it.
          // Save closes the polygon before sending.
          const ring = [...rings[0]];
          if (isClosedPolygon(ring)) {
            ring.pop();
          }
          setDraftRing(ring);
          tool = "polygon";
        } else if (circles[0]) {
          setGeofenceTool("circle");
          setDraftCircle(circles[0]);
          tool = "circle";
        } else {
          setGeofenceTool("polygon");
          tool = "polygon";
        }
      } else if (type === "grid") {
        const fromRow = Array.isArray(zone.h3_cells)
          ? zone.h3_cells.filter((c): c is string => typeof c === "string")
          : [];
        const fromCfg = Array.isArray(cfg.h3_cells)
          ? cfg.h3_cells.filter((c): c is string => typeof c === "string")
          : [];
        setSelectedH3Cells(fromRow.length > 0 ? fromRow : fromCfg);
        tool = "grid";
      } else if (type === "proximity") {
        const circles = readZoneCircles(zone);
        const center =
          readZoneCenter(zone) ?? circles[0]?.center ?? null;
        const radius =
          circles[0]?.radiusMeters ??
          Number(cfg.radius_meters) ??
          150;
        setProximityCenter(center);
        setProximityRadius(
          Number.isFinite(radius) && radius > 0 ? radius : 150,
        );
        const sourceRaw = String(cfg.source_type ?? "").toLowerCase();
        setProximitySource(
          sourceRaw === "current_location" ? "current_location" : "map_pin",
        );
        tool = "proximity";
      } else if (type === "dynamic") {
        const target = Number(cfg.target_user_count);
        const minR = Number(cfg.min_radius_meters);
        const maxR = Number(cfg.max_radius_meters);
        if (Number.isFinite(target) && target > 0) setDynamicTarget(Math.trunc(target));
        if (Number.isFinite(minR) && minR > 0) setDynamicMin(minR);
        if (Number.isFinite(maxR) && maxR > 0) setDynamicMax(maxR);
        const center = readZoneCenter(zone);
        const resolved = Number(cfg.resolved_radius_meters);
        if (
          center &&
          Number.isFinite(resolved) &&
          resolved > 0
        ) {
          setDynamicPreview({
            infeasible: false,
            reason: null,
            center: { latitude: center[0], longitude: center[1] },
            resolved_radius_meters: resolved,
            tight_radius_meters: resolved,
            matched_user_count: Number(cfg.matched_user_count) || 0,
            matched_owner_ids: [],
            population_size: 0,
            target_user_count: Number.isFinite(target) ? Math.trunc(target) : 5,
            min_radius_meters: Number.isFinite(minR) ? minR : 200,
            max_radius_meters: Number.isFinite(maxR) ? maxR : 1000,
          });
        }
        tool = "dynamic";
      } else if (type === "government_local_code") {
        const modeRaw = String(cfg.address_mode ?? "").toLowerCase();
        setGovernmentMode(modeRaw === "street" ? "street" : "postal");
        setGovernmentFields({
          postal: typeof cfg.postal_code === "string" ? cfg.postal_code : "",
          city: typeof cfg.city === "string" ? cfg.city : "",
          country: typeof cfg.country === "string" ? cfg.country : "",
          street: typeof cfg.street === "string" ? cfg.street : "",
          streetNumber:
            typeof cfg.street_number === "string" ? cfg.street_number : "",
        });
        const refId =
          typeof cfg.reference_id === "string"
            ? cfg.reference_id
            : typeof cfg.postal_code === "string"
              ? cfg.postal_code
              : typeof cfg.local_code === "string"
                ? cfg.local_code
                : "";
        const geo =
          zone.geometry && typeof zone.geometry === "object"
            ? { ...(zone.geometry as Record<string, unknown>) }
            : {};
        if (zone.geo_fence_polygon != null && geo.geo_fence_polygon == null) {
          geo.geo_fence_polygon = zone.geo_fence_polygon as Record<
            string,
            unknown
          >;
        }
        if (refId && (geo.geo_fence_polygon || readZoneRings(zone).length > 0)) {
          setGovernmentValidation({
            valid: true,
            zone_type: "government_local_code",
            reference_id: refId,
            display_name: zone.name ?? null,
            geometry: geo,
            config: cfg,
            h3_cells: Array.isArray(zone.h3_cells)
              ? [...zone.h3_cells]
              : Array.isArray(cfg.h3_cells)
                ? (cfg.h3_cells as string[])
                : [],
            source: "existing_zone",
            message: "Loaded from saved zone.",
          });
        }
        tool = "government_local_code";
      } else if (type === "object") {
        const center = readZoneCenter(zone) ?? readZoneCircles(zone)[0]?.center;
        const radius =
          Number(cfg.radius_meters) ||
          readZoneCircles(zone)[0]?.radiusMeters ||
          80;
        setObjectCenter(center ?? null);
        setObjectRadius(Number.isFinite(radius) && radius > 0 ? radius : 80);
        setObjectReferenceId(
          typeof cfg.object_id === "string" ? cfg.object_id : "",
        );
        setObjectQuery(
          typeof cfg.object_name === "string" && cfg.object_name.trim()
            ? cfg.object_name
            : typeof cfg.object_id === "string"
              ? cfg.object_id
              : "",
        );
        tool = "object";
      } else if (type === "communal_id") {
        const code =
          typeof cfg.communal_id === "string" ? cfg.communal_id : "";
        if (code && !communalIdLocked) {
          setCommunalCodeState(code);
          setCommunalExists(true);
        }
        tool = "communal_id";
      }

      const focus = layerFocusPoint(layer);
      if (focus) {
        setMapCenter(focus);
        setFitDraftToken((t) => t + 1);
      }

      const fromMulti = Array.isArray(cfg.communal_ids)
        ? cfg.communal_ids.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
        : [];
      const legacy =
        typeof cfg.communal_id === "string" && type !== "communal_id"
          ? [cfg.communal_id]
          : [];
      const mergedIds = [
        ...new Set(
          [...fromMulti, ...legacy].map((item) => item.trim().toUpperCase()),
        ),
      ];
      if (mergedIds.length > 0) {
        setDefiningCommunalIds(mergedIds);
      }

      setStatus(
        `Editing "${layer.name}" — Undo removes vertices, tap map to add, then Update.`,
      );
      return tool;
    },
    [
      capabilities?.can_edit_active_zone,
      capabilities?.reason,
      resetDrafts,
      scope?.currentUserId,
      scope?.isAccountAdministrator,
    ],
  );

  const toggleH3Cell = useCallback((cell: string) => {
    setSelectedH3Cells((cells) => {
      const exists = cells.includes(cell);
      setH3UndoStack((stack) => [
        ...stack,
        { op: exists ? "remove" : "add", cell },
      ]);
      return exists ? cells.filter((c) => c !== cell) : [...cells, cell];
    });
  }, []);

  const undoH3Cell = useCallback(() => {
    setH3UndoStack((stack) => {
      if (!stack.length) return stack;
      const last = stack[stack.length - 1];
      setSelectedH3Cells((cells) => {
        if (last.op === "add") {
          return cells.filter((c) => c !== last.cell);
        }
        return cells.includes(last.cell) ? cells : [...cells, last.cell];
      });
      return stack.slice(0, -1);
    });
  }, []);

  const clearH3 = useCallback(() => {
    setSelectedH3Cells([]);
    setH3UndoStack([]);
  }, []);

  const setH3Resolution = useCallback((next: number) => {
    setH3ResolutionState(next);
  }, []);

  const clearLocationTimeout = useCallback(() => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
  }, []);

  const markMapUserAdjusted = useCallback(() => {
    allowInitialGpsRef.current = false;
  }, []);

  const applyDeviceLocation = useCallback(
    (lat: number, lng: number, accuracy?: number) => {
      clearLocationTimeout();
      const here: LatLng = [lat, lng];
      const lockProximity = locationIntentRef.current === "proximity";
      if (!lockProximity && !allowInitialGpsRef.current) {
        setProximityLocating(false);
        return;
      }
      allowInitialGpsRef.current = false;
      setMapCenter(here);
      void setStoredMapCenter({ latitude: lat, longitude: lng });
      if (!lockProximity) {
        setProximityLocating(false);
        return;
      }
      setProximityCenter(here);
      setProximitySource("current_location");
      setFitDraftToken((t) => t + 1);
      setProximityLocating(false);
      const acc =
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? ` · ±${Math.round(accuracy)} m`
          : "";
      setStatus(`Locked onto your location${acc}`);
      setError(null);
    },
    [clearLocationTimeout],
  );

  const handleDeviceLocationError = useCallback(
    (message: string) => {
      clearLocationTimeout();
      setProximityLocating(false);
      if (locationIntentRef.current !== "proximity") return;
      notifyError(message || LOCATION_UNAVAILABLE_MESSAGE);
      setStatus(null);
    },
    [clearLocationTimeout, notifyError],
  );

  const requestMapWebViewLocation = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (Platform.OS === "android") {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            silent
              ? undefined
              : {
                  title: "Use your location",
                  message:
                    "Safe Zone Patrol needs your device location to center the map on you.",
                  buttonPositive: "Allow",
                  buttonNegative: "Cancel",
                },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (!silent) {
              setProximityLocating(false);
              notifyError(
                "Location permission denied. Enable it in app settings or tap the map instead.",
              );
              setStatus(null);
            }
            return;
          }
        } catch {
          // fall through and try the WebView prompt anyway
        }
      }
      if (!silent) {
        clearLocationTimeout();
        locationTimeoutRef.current = setTimeout(() => {
          setProximityLocating(false);
          notifyError(LOCATION_UNAVAILABLE_MESSAGE);
          setStatus(null);
        }, 22000);
      }
      setLocationRequestNonce((n) => n + 1);
    },
    [clearLocationTimeout, notifyError],
  );

  const requestCurrentLocation = useCallback(async () => {
    locationIntentRef.current = "proximity";
    allowInitialGpsRef.current = false;
    setProximityLocating(true);
    setError(null);
    setStatus("Requesting GPS…");
    const Location = await loadExpoLocation();
    if (!Location) {
      await requestMapWebViewLocation();
      return;
    }
    try {
      const { status: permStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (permStatus !== "granted") {
        setProximityLocating(false);
        notifyError(
          "Location permission denied. Enable it in Settings or tap the map instead.",
        );
        setStatus(null);
        return;
      }
      // Bounded fresh fix with an automatic last-known-position fallback so
      // we never hang and we avoid the raw "Current location is unavailable"
      // native error when a fresh fix simply isn't ready yet.
      const result = await readDeviceLocation({
        timeoutMs: 12000,
        requestPermission: false,
      });
      if (result) {
        applyDeviceLocation(
          result.coords.latitude,
          result.coords.longitude,
          result.coords.accuracy,
        );
        if (result.source === "lastKnown") {
          setStatus("Using last known location — tap the map to fine-tune.");
        }
        return;
      }
      // No native fix at all → try the in-map WebView geolocation as a last
      // resort (works on dev clients without the ExpoLocation native module).
      await requestMapWebViewLocation();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not get location.";
      if (/Cannot find native module|ExpoLocation/i.test(msg)) {
        await requestMapWebViewLocation();
      } else {
        await requestMapWebViewLocation();
      }
    }
  }, [applyDeviceLocation, notifyError, requestMapWebViewLocation, setError]);

  /** Open the Zones map on the device GPS instead of the New York fallback. */
  useEffect(() => {
    let cancelled = false;

    const locate = async () => {
      const stored = await getStoredMapCenter();
      if (!cancelled && stored && allowInitialGpsRef.current) {
        setMapCenter([stored.latitude, stored.longitude]);
      }

      const result = await readDeviceLocation({ timeoutMs: 12000 });
      if (cancelled || !allowInitialGpsRef.current) return;
      if (result) {
        applyDeviceLocation(
          result.coords.latitude,
          result.coords.longitude,
          result.coords.accuracy,
        );
        return;
      }
      await requestMapWebViewLocation({ silent: true });
    };

    void locate();
    return () => {
      cancelled = true;
    };
  }, [applyDeviceLocation, requestMapWebViewLocation]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      allowInitialGpsRef.current = false;
      const pt: LatLng = [lat, lng];
      if (zoneType === "geofence") {
        if (geofenceTool === "polygon") {
          setDraftRing((cur) => {
            if (cur.length === 0) return [pt];
            if (isClosedPolygon(cur)) return cur;
            const [firstLat, firstLng] = cur[0];
            const lat2 = pt[0];
            const lng2 = pt[1];
            const earthR = 6371000;
            const toRad = (v: number) => (v * Math.PI) / 180;
            const dLat = toRad(lat2 - firstLat);
            const dLng = toRad(lng2 - firstLng);
            const h =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(firstLat)) *
                Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) ** 2;
            const dist = 2 * earthR * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
            if (cur.length >= 3 && dist < 35) {
              return [...cur, cur[0]];
            }
            return [...cur, pt];
          });
          setPolygonRedoStack([]);
          return;
        }
        // circle: first click sets center, second sets radius
        setDraftCircle((cur) => {
          if (!cur) return { center: pt, radiusMeters: 0 };
          if (cur.radiusMeters === 0) {
            const earthR = 6371000;
            const toRad = (v: number) => (v * Math.PI) / 180;
            const dLat = toRad(pt[0] - cur.center[0]);
            const dLng = toRad(pt[1] - cur.center[1]);
            const h =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(cur.center[0])) *
                Math.cos(toRad(pt[0])) *
                Math.sin(dLng / 2) ** 2;
            const r = 2 * earthR * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
            return { center: cur.center, radiusMeters: Math.round(r) };
          }
          return { center: pt, radiusMeters: 0 };
        });
        return;
      }
      if (zoneType === "proximity") {
        setProximityCenter(pt);
        setProximitySource("map_pin");
        return;
      }
      if (zoneType === "object") {
        setObjectCenter(pt);
        return;
      }
    },
    [geofenceTool, zoneType],
  );

  const drawMode = useMemo<
    "polygon" | "circle" | "h3" | "marker" | "none"
  >(() => {
    if (zoneType === "geofence") {
      return geofenceTool === "polygon" ? "polygon" : "circle";
    }
    if (zoneType === "grid") return "h3";
    if (zoneType === "proximity" || zoneType === "object") return "marker";
    return "none";
  }, [geofenceTool, zoneType]);

  const draftMarker = useMemo<LatLng | null>(() => {
    if (zoneType === "proximity") return proximityCenter;
    if (zoneType === "object") return objectCenter;
    return null;
  }, [objectCenter, proximityCenter, zoneType]);

  /** Single live "draft" circle for proximity / object / dynamic preview. */
  const draftCircleForMap = useMemo<ZoneCircle | null>(() => {
    if (zoneType === "geofence" && geofenceTool === "circle") {
      return draftCircle;
    }
    if (zoneType === "proximity" && proximityCenter) {
      return { center: proximityCenter, radiusMeters: proximityRadius };
    }
    if (zoneType === "object" && objectCenter) {
      return { center: objectCenter, radiusMeters: objectRadius };
    }
    if (zoneType === "dynamic" && dynamicPreview?.center &&
        dynamicPreview.resolved_radius_meters) {
      return {
        center: [
          dynamicPreview.center.latitude,
          dynamicPreview.center.longitude,
        ],
        radiusMeters: dynamicPreview.resolved_radius_meters,
      };
    }
    return null;
  }, [
    draftCircle,
    dynamicPreview,
    geofenceTool,
    objectCenter,
    objectRadius,
    proximityCenter,
    proximityRadius,
    zoneType,
  ]);

  const draftRingForMap = useMemo<LatLng[]>(() => {
    if (zoneType === "geofence" && geofenceTool === "polygon") {
      return draftRing;
    }
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      const rings = ringsFromValidation(governmentValidation);
      return rings[0] ?? [];
    }
    return [];
  }, [draftRing, geofenceTool, governmentValidation, zoneType]);

  /** H3 cells from validation preview (government) plus grid selection. */
  const selectedH3CellsForMap = useMemo(() => {
    if (zoneType === "grid") return selectedH3Cells;
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      return governmentValidation.h3_cells ?? [];
    }
    return [];
  }, [governmentValidation, selectedH3Cells, zoneType]);

  const previewRingsForMap = useMemo<LatLng[][]>(() => {
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      return ringsFromValidation(governmentValidation);
    }
    return [];
  }, [governmentValidation, zoneType]);

  const refreshPublicZones = useCallback(async () => {
    setPublicZonesLoading(true);
    const result = await listPublicZones({ limit: 200 });
    setPublicZonesLoading(false);
    if (result.error || !result.data) {
      setPublicZones([]);
      return;
    }
    setPublicZones(result.data);
  }, []);

  useEffect(() => {
    if (zoneType !== "communal_id") return;
    void refreshPublicZones();
  }, [zoneType, refreshPublicZones]);

  const togglePublicZoneSelection = useCallback((zoneId: number) => {
    setSelectedPublicZoneIds((prev) =>
      prev.includes(zoneId)
        ? prev.filter((id) => id !== zoneId)
        : [...prev, zoneId],
    );
  }, []);

  const validateCommunal = useCallback(async () => {
    if (!canUseCommunalTools) {
      toast.warning("Only network administrators can manage Communal IDs.");
      return;
    }
    const code = communalCode.trim();
    if (!code) {
      toast.warning("Enter a communal ID first.");
      return;
    }
    setCommunalValidating(true);
    setError(null);
    setStatus("Validating communal ID…");
    const result = await validateZoneReference({
      zone_type: "communal_id",
      reference_id: code,
    });
    setCommunalValidating(false);
    if (result.error || !result.data) {
      setCommunalValidation(null);
      setCommunalExists(null);
      setMatchedCommunalZones([]);
      notifyError(result.error ?? "Could not validate communal ID.");
      setStatus(null);
      return;
    }
    const data = result.data;
    const exists = data.exists === true || data.valid === true;
    setCommunalExists(exists);
    setCommunalCodeState((data.reference_id || code).toUpperCase());
    const matched = Array.isArray(data.zones) ? data.zones : [];
    setMatchedCommunalZones(matched);
    setCommunalValidation(data);
    setError(null);
    const msg = exists
      ? data.message ?? `Communal ID found on ${matched.length} zone(s).`
      : data.message ?? "Communal ID not found. You can generate a new one.";
    setStatus(msg);
    if (exists) toast.info(msg);
    else toast.success(msg);
  }, [canUseCommunalTools, communalCode, notifyError, setError]);

  const generateCommunal = useCallback(async () => {
    if (!canUseCommunalTools) {
      toast.warning("Only network administrators can generate Communal IDs.");
      return;
    }
    setCommunalValidating(true);
    setError(null);
    setStatus("Generating communal ID…");
    const result = await generateZoneReference("communal_id", {
      persist: false,
    });
    setCommunalValidating(false);
    if (result.error || !result.data) {
      notifyError(result.error ?? "Could not generate communal ID.");
      setStatus(null);
      return;
    }
    setCommunalCodeState(result.data.reference_id);
    setCommunalValidation(result.data);
    setCommunalExists(false);
    setMatchedCommunalZones([]);
    const msg =
      result.data.message ??
      `Candidate ${result.data.reference_id}. Tap Save to register it.`;
    setStatus(msg);
    toast.success(msg);
  }, [canUseCommunalTools, notifyError, setError]);

  const validateGovernment = useCallback(async () => {
    const f = governmentFields;
    if (!f.postal && !f.city) {
      notifyError("Enter at least a postal code or city.");
      return;
    }
    if (!f.country.trim()) {
      notifyError("Enter a country (e.g. Canada).");
      return;
    }
    setGovernmentValidating(true);
    setError(null);
    setStatus("Validating address…");
    const result = await validateZoneReference({
      zone_type: "government_local_code",
      address_mode: governmentMode,
      postal_code: f.postal || undefined,
      city: f.city || undefined,
      country: f.country || undefined,
      street: governmentMode === "street" ? f.street || undefined : undefined,
      street_number:
        governmentMode === "street" ? f.streetNumber || undefined : undefined,
    });
    setGovernmentValidating(false);
    if (result.error || !result.data) {
      setGovernmentValidation(null);
      notifyError(result.error ?? "Could not validate address.");
      setStatus(null);
      return;
    }
    if (!result.data.valid) {
      setGovernmentValidation(null);
      notifyError(result.data.message ?? "Address could not be resolved.");
      setStatus(null);
      return;
    }
    setGovernmentValidation(result.data);
    setError(null);
    const msg = `Address validated — ${result.data.display_name ?? result.data.reference_id}`;
    setStatus(msg);
    toast.success(msg);
    const rings = ringsFromValidation(result.data);
    if (rings[0] && rings[0][0]) {
      allowInitialGpsRef.current = false;
      setMapCenter(rings[0][0]);
    }
  }, [governmentFields, governmentMode, notifyError, setError]);

  const canSave = useMemo(() => {
    const isEditing = editingZoneId != null;
    if (isEditing && capabilities?.can_edit_active_zone === false) {
      return false;
    }
    if (zoneType === "communal_id") {
      return (
        canUseCommunalTools &&
        communalCode.trim().length >= 3 &&
        communalExists !== true
      );
    }
    if (capabilities && capabilities.can_create_zone === false && !isEditing) {
      return false;
    }
    const trimmed = zoneName.trim();
    if (!trimmed || trimmed.length > MAX_ZONE_NAME_LENGTH) return false;
    if (zoneType === "geofence") {
      if (geofenceTool === "polygon") {
        // Allow either a closed polygon or any 3+ vertex sketch — save will
        // close it automatically before sending. Hitting the closing-tap
        // tolerance on a phone is too easy to miss to gate Save on it.
        return draftRing.length >= 3;
      }
      return draftCircle != null && draftCircle.radiusMeters > 0;
    }
    if (zoneType === "grid") return selectedH3Cells.length > 0;
    if (zoneType === "proximity") {
      return proximityCenter != null && proximityRadius > 0;
    }
    if (zoneType === "dynamic") {
      return Boolean(
        dynamicPreview &&
          !dynamicPreview.infeasible &&
          dynamicPreview.center &&
          dynamicPreview.resolved_radius_meters,
      );
    }
    if (zoneType === "government_local_code")
      return Boolean(governmentValidation?.valid);
    if (zoneType === "object") {
      return Boolean(
        objectCenter && objectRadius > 0 && objectReferenceId.trim(),
      );
    }
    return false;
  }, [
    canUseCommunalTools,
    communalCode,
    communalExists,
    draftCircle,
    draftRing,
    dynamicPreview,
    editingZoneId,
    geofenceTool,
    governmentValidation,
    objectCenter,
    objectRadius,
    objectReferenceId,
    proximityCenter,
    proximityRadius,
    selectedH3Cells,
    zoneName,
    zoneType,
    capabilities,
  ]);

  const save = useCallback(async () => {
    setError(null);
    if (!canSave) {
      notifyError("Complete the zone details first.");
      return false;
    }

    const description = zoneDescription.trim();
    let payload: CreateZonePayload | null = null;

    // Stamp every new zone with the owner's account-level zone id (the value
    // saved in the `owners.zone_id` column at signup, e.g. "ZONE-1234"). The
    // server's contract route reads this from `id`; the canonical route reads
    // it from `zone_id`. We send both so whichever handler answers stores the
    // shared account zone id (the server also falls back to `owners.zone_id`
    // when neither is supplied).
    const ownerStamp = ownerZoneId
      ? { id: ownerZoneId, zone_id: ownerZoneId }
      : {};

    if (zoneType === "communal_id") {
      if (!canUseCommunalTools) {
        notifyError("Only network administrators can save Communal IDs.");
        return false;
      }
      const code = communalCode.trim().toUpperCase();
      if (code.length < 3) {
        notifyError("Enter or generate a Communal ID first.");
        return false;
      }
      if (communalExists === true) {
        toast.info(`Communal ID ${code} is already saved.`);
        return true;
      }
      setSaving(true);
      setStatus("Saving Communal ID…");
      const result = await generateZoneReference("communal_id", {
        reference_id: code,
        persist: true,
      });
      setSaving(false);
      if (result.error || !result.data) {
        notifyError(result.error ?? "Could not save Communal ID.");
        setStatus(null);
        return false;
      }
      const saved = (result.data.reference_id || code).toUpperCase();
      setCommunalCodeState(saved);
      setCommunalExists(true);
      setCommunalValidation(result.data);
      const msg = result.data.message ?? `Saved Communal ID ${saved}.`;
      setStatus(msg);
      toast.success(msg);
      await refresh();
      return true;
    }

    const communalConfigExtra =
      canUseCommunalTools && createAsPrimary
        ? {
            communal_ids: definingCommunalIds,
            ...(definingCommunalIds[0]
              ? { communal_id: definingCommunalIds[0] }
              : {}),
            is_public: true,
          }
        : { is_public: true };

    if (zoneType === "geofence") {
      const polygon =
        geofenceTool === "polygon"
          ? latLngRingToGeoJsonPolygon(draftRing)
          : circleToGeoJsonPolygon(draftCircle as ZoneCircle);
      payload = {
        name: zoneName.trim(),
        type: "geofence",
        zone_type: "geofence",
        ...ownerStamp,
        geometry: { geo_fence_polygon: polygon },
        geo_fence_polygon: polygon,
        config: { h3_cells: [], ...communalConfigExtra },
      };
    } else if (zoneType === "grid") {
      payload = {
        name: zoneName.trim(),
        type: "grid",
        zone_type: "grid",
        ...ownerStamp,
        geometry: {},
        config: { h3_cells: selectedH3Cells, ...communalConfigExtra },
        h3_cells: selectedH3Cells,
      };
    } else if (zoneType === "proximity") {
      const center = proximityCenter as LatLng;
      const centerPayload = { latitude: center[0], longitude: center[1] };
      payload = {
        name: zoneName.trim(),
        type: "proximity",
        zone_type: "proximity",
        ...ownerStamp,
        geometry: {
          center: centerPayload,
          centers: [centerPayload],
          circles: [{ center: centerPayload, radius_meters: proximityRadius }],
        },
        config: {
          radius_meters: proximityRadius,
          radii_meters: [proximityRadius],
          source_type: proximitySource,
          ...communalConfigExtra,
        },
      };
    } else if (zoneType === "dynamic" && dynamicPreview?.center) {
      const center = {
        latitude: dynamicPreview.center.latitude,
        longitude: dynamicPreview.center.longitude,
      };
      payload = {
        name: zoneName.trim(),
        type: "dynamic",
        zone_type: "dynamic",
        ...ownerStamp,
        geometry: { center },
        config: {
          target_user_count: Math.trunc(dynamicTarget),
          min_radius_meters: dynamicMin,
          max_radius_meters: dynamicMax,
          ...(dynamicPreview.resolved_radius_meters
            ? { resolved_radius_meters: dynamicPreview.resolved_radius_meters }
            : {}),
          ...communalConfigExtra,
        },
      };
    } else if (
      zoneType === "government_local_code" &&
      governmentValidation?.valid
    ) {
      const refFence = governmentValidation.geometry?.geo_fence_polygon;
      payload = {
        name: zoneName.trim(),
        type: "government_local_code",
        zone_type: "government_local_code",
        ...ownerStamp,
        geometry: governmentValidation.geometry,
        geo_fence_polygon:
          refFence && typeof refFence === "object"
            ? (refFence as Record<string, unknown>)
            : undefined,
        config: {
          ...(governmentValidation.config ?? {}),
          ...communalConfigExtra,
        },
        h3_cells: governmentValidation.h3_cells,
      };
    } else if (zoneType === "object" && objectCenter) {
      payload = {
        name: zoneName.trim(),
        type: "object",
        zone_type: "object",
        ...ownerStamp,
        geometry: {
          center: {
            latitude: objectCenter[0],
            longitude: objectCenter[1],
          },
        },
        config: {
          object_id: objectReferenceId.trim(),
          object_name: objectQuery.trim() || undefined,
          object_source: "place",
          radius_meters: objectRadius,
          ...communalConfigExtra,
        },
      };
    }

    if (!payload) {
      notifyError("Unknown zone type.");
      return false;
    }

    const isEditing = editingZoneId != null;

    setSaving(true);
    setStatus(isEditing ? "Updating zone…" : "Saving zone…");

    if (isEditing) {
      const updatePayload: UpdateZonePayload = {
        name: payload.name,
        type: payload.type,
        zone_type: payload.zone_type,
        geometry: payload.geometry,
        config: payload.config,
        h3_cells: payload.h3_cells,
        geo_fence_polygon: payload.geo_fence_polygon,
      };
      const result = await updateZone(editingZoneId, updatePayload);
      setSaving(false);
      if (result.error || !result.data) {
        notifyError(result.error ?? "Zone update failed.");
        setStatus(null);
        return false;
      }
      setStatus(`Zone "${payload.name}" updated.`);
      toast.success(`Zone "${payload.name}" updated.`);
      clearEditing();
      resetDrafts();
      await refresh();
      return true;
    }

    const tierStamp =
      scope?.isAccountAdministrator === true && createAsPrimary
        ? { is_primary: true }
        : { is_primary: false };
    const finalPayload: CreateZonePayload = description
      ? { ...payload, description, ...tierStamp }
      : { ...payload, ...tierStamp };
    const result = await createZone(finalPayload);
    setSaving(false);
    if (result.error || !result.data) {
      notifyError(result.error ?? "Zone save failed.");
      setStatus(null);
      return false;
    }
    const evicted = result.data.evicted_zones ?? [];
    if (evicted.length > 0) {
      const names = evicted.map((z) => `"${z.name}"`).join(", ");
      toast.warning(
        `${evicted.length} member secondary zone(s) removed automatically: ${names}.`,
        { title: "Zone quota adjusted", duration: 5200 },
      );
    }
    const tier = result.data.is_primary ? "primary" : "secondary";
    setStatus(`Zone "${zoneName}" saved (${tier}).`);
    toast.success(`Zone "${zoneName}" saved.`);
    resetDrafts();
    await refresh();
    return true;
  }, [
    canSave,
    canUseCommunalTools,
    clearEditing,
    communalCode,
    communalExists,
    createAsPrimary,
    definingCommunalIds,
    draftCircle,
    draftRing,
    dynamicMax,
    dynamicMin,
    dynamicPreview,
    dynamicTarget,
    editingZoneId,
    geofenceTool,
    governmentValidation,
    notifyError,
    objectCenter,
    objectQuery,
    objectRadius,
    objectReferenceId,
    ownerZoneId,
    proximityCenter,
    proximityRadius,
    proximitySource,
    refresh,
    resetDrafts,
    scope?.isAccountAdministrator,
    selectedH3Cells,
    zoneDescription,
    zoneName,
    zoneType,
    setError,
  ]);

  const remove = useCallback(
    (layer: MapZoneLayer) => {
      if (
        !canDeleteSavedZone(layer.raw, {
          currentUserId: scope?.currentUserId,
          isAccountAdministrator: scope?.isAccountAdministrator,
        })
      ) {
        toast.warning(
          "You can delete only primary zones as administrator, or secondary zones you created.",
        );
        return;
      }

      const recordId = savedZoneRecordId(layer.raw);
      Alert.alert(
        "Delete zone",
        `Remove "${layer.name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setError(null);
                setStatus("Deleting zone…");
                const result = await deleteZone(recordId);
                if (result.error) {
                  notifyError(result.error);
                  setStatus(null);
                  return;
                }
                if (editingZoneId === recordId) {
                  clearEditing();
                  resetDrafts();
                }
                setStatus("Zone deleted.");
                await refresh();
              })();
            },
          },
        ],
      );
    },
    [
      clearEditing,
      editingZoneId,
      notifyError,
      refresh,
      resetDrafts,
      scope?.currentUserId,
      scope?.isAccountAdministrator,
      setError,
    ],
  );

  const canDeleteLayer = useCallback(
    (layer: MapZoneLayer) =>
      canDeleteSavedZone(layer.raw, {
        currentUserId: scope?.currentUserId,
        isAccountAdministrator: scope?.isAccountAdministrator,
      }),
    [scope?.currentUserId, scope?.isAccountAdministrator],
  );

  const canEditLayer = useCallback(
    (layer: MapZoneLayer) =>
      canEditSavedZone(layer.raw, {
        currentUserId: scope?.currentUserId,
        isAccountAdministrator: scope?.isAccountAdministrator,
      }) && capabilities?.can_edit_active_zone !== false,
    [
      capabilities?.can_edit_active_zone,
      scope?.currentUserId,
      scope?.isAccountAdministrator,
    ],
  );

  const draftColor = useMemo(() => colorForZoneType(zoneType), [zoneType]);

  const draftCircleSolid = useMemo(() => {
    if (zoneType === "dynamic") {
      return Boolean(
        dynamicPreview &&
          !dynamicPreview.infeasible &&
          dynamicPreview.center &&
          dynamicPreview.resolved_radius_meters,
      );
    }
    if (zoneType === "proximity") return proximityCenter != null;
    if (zoneType === "object") return objectCenter != null;
    return false;
  }, [dynamicPreview, objectCenter, proximityCenter, zoneType]);

  const recenterDraft = useCallback(() => {
    allowInitialGpsRef.current = false;
    if (
      zoneType === "dynamic" &&
      dynamicPreview?.center &&
      dynamicPreview.resolved_radius_meters
    ) {
      const next: LatLng = [
        dynamicPreview.center.latitude,
        dynamicPreview.center.longitude,
      ];
      setMapCenter(next);
      setFitDraftToken((t) => t + 1);
      return;
    }
    if (zoneType === "proximity" && proximityCenter) {
      setMapCenter(proximityCenter);
      setFitDraftToken((t) => t + 1);
      return;
    }
    if (zoneType === "object" && objectCenter) {
      setMapCenter(objectCenter);
      setFitDraftToken((t) => t + 1);
    }
  }, [dynamicPreview, objectCenter, proximityCenter, zoneType]);

  return {
    // list state
    layers,
    communalMapLayers,
    networkCommunalIds,
    publicCommunalIds,
    loadingList,
    listError,
    refresh,
    remove,
    canDeleteLayer,
    canEditLayer,
    beginEdit,
    cancelEdit,
    editingZoneId,
    editingZoneName,
    isEditing: editingZoneId != null,
    capabilities,
    createAsPrimary,
    setCreateAsPrimary,

    // form
    zoneType,
    changeZoneType,
    zoneName,
    setZoneName,
    zoneDescription,
    setZoneDescription,

    mapCenter,
    setMapCenter: (next: LatLng) => {
      allowInitialGpsRef.current = false;
      setMapCenter(next);
    },

    // shared draft
    draftMarker,
    draftCircle: draftCircleForMap,
    draftRing: draftRingForMap,
    previewRings: previewRingsForMap,
    selectedH3Cells: selectedH3CellsForMap,
    h3Resolution,
    setH3Resolution,
    drawMode,
    draftColor,
    draftCircleSolid,
    fitDraftToken,
    recenterDraft,
    handleMapClick,
    toggleH3Cell,

    // geofence specifics
    geofenceTool,
    setGeofenceTool,
    clearGeofence: () => {
      setDraftRing([]);
      setPolygonRedoStack([]);
      setDraftCircle(null);
    },
    undoGeofencePoint: () => {
      setDraftRing((cur) => {
        if (!cur.length) return cur;
        const removed = cur[cur.length - 1];
        setPolygonRedoStack((stack) => [...stack, removed]);
        return cur.slice(0, -1);
      });
    },
    redoGeofencePoint: () => {
      setPolygonRedoStack((stack) => {
        if (!stack.length) return stack;
        const next = stack[stack.length - 1];
        setDraftRing((cur) => [...cur, next]);
        return stack.slice(0, -1);
      });
    },
    canRedoGeofencePoint: polygonRedoStack.length > 0,
    finishGeofencePolygon: () => {
      setDraftRing((cur) => {
        if (cur.length < 3) return cur;
        if (isClosedPolygon(cur)) return cur;
        return [...cur, cur[0]];
      });
      setPolygonRedoStack([]);
    },

    // proximity
    proximityCenter,
    setProximityCenter,
    proximityRadius,
    setProximityRadius,
    proximitySource,
    setProximitySource,
    proximityLocating,
    locationRequestNonce,
    requestCurrentLocation,
    applyDeviceLocation,
    handleDeviceLocationError,
    markMapUserAdjusted,

    // dynamic
    dynamicTarget,
    setDynamicTarget,
    dynamicMin,
    setDynamicMin,
    dynamicMax,
    setDynamicMax,
    dynamicPreview,
    dynamicPreviewLoading,
    dynamicPreviewError,

    // communal
    canUseCommunalTools,
    communalCode,
    setCommunalCode,
    communalValidation,
    communalValidating,
    communalExists,
    communalIdLocked,
    assignedCommunalId,
    publicZones,
    publicZonesLoading,
    selectedPublicZoneIds,
    togglePublicZoneSelection,
    matchedCommunalZones,
    validateCommunal,
    generateCommunal,
    definingCommunalIds,
    addDefiningCommunalId,
    removeDefiningCommunalId,

    // government
    governmentMode,
    setGovernmentMode,
    governmentFields,
    setGovernmentFields,
    governmentValidation,
    governmentValidating,
    validateGovernment,

    // object
    objectCenter,
    setObjectCenter,
    objectQuery,
    setObjectQuery,
    objectReferenceId,
    setObjectReferenceId,
    objectRadius,
    setObjectRadius,

    // grid
    clearH3,
    undoH3Cell,
    canUndoH3: h3UndoStack.length > 0,

    // save status
    saving,
    status,
    setStatus,
    error,
    setError,
    canSave,
    save,
  };
}

function ringsFromValidation(v: ZoneReferenceValidateResult): LatLng[][] {
  const polygon = (v.geometry?.geo_fence_polygon ?? v.geometry) as unknown;
  return ringsFromGeoJsonPolygon(polygon);
}
