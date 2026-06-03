import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  loadExpoLocation,
  readDeviceLocation,
  LOCATION_UNAVAILABLE_MESSAGE,
} from "@/lib/expoLocation";
import {
  createZone,
  deleteZone,
  generateZoneReference,
  getZoneCapabilities,
  getZones,
  previewDynamicZone,
  validateZoneReference,
  type CreateZonePayload,
  type DynamicZonePreviewResult,
  type GovernmentAddressMode,
  type SavedZone,
  type ZoneCapabilities,
  type ZoneReferenceValidateResult,
  type ZoneType,
} from "@/api/zones";
import { AUTH_MAP_DEFAULT_CENTER, type LatLng } from "@/lib/h3";
import { setStoredMapCenter } from "@/lib/storage";
import {
  circleToGeoJsonPolygon,
  colorForZoneType,
  isClosedPolygon,
  latLngRingToGeoJsonPolygon,
  ringsFromGeoJsonPolygon,
  zoneRecordToLayer,
  type MapZoneLayer,
  type ZoneCircle,
} from "@/lib/zoneGeometry";

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

export function useZoneBuilder(ownerZoneId: string | undefined) {
  const [layers, setLayers] = useState<MapZoneLayer[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ZoneCapabilities | null>(
    null,
  );

  const [zoneType, setZoneType] = useState<ZoneType>("geofence");
  const [zoneName, setZoneName] = useState("My zone");
  const [zoneDescription, setZoneDescription] = useState("");
  const [mapCenter, setMapCenter] = useState<LatLng>(AUTH_MAP_DEFAULT_CENTER);

  // geofence / grid drawing state
  const [draftRing, setDraftRing] = useState<LatLng[]>([]);
  const [draftCircle, setDraftCircle] = useState<ZoneCircle | null>(null);
  const [selectedH3Cells, setSelectedH3Cells] = useState<string[]>([]);
  const [h3Resolution, setH3Resolution] = useState(9);
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
  const [communalCode, setCommunalCode] = useState("");
  const [communalValidation, setCommunalValidation] =
    useState<ZoneReferenceValidateResult | null>(null);
  const [communalValidating, setCommunalValidating] = useState(false);

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
    const [zonesRes, capsRes] = await Promise.all([
      getZones(),
      getZoneCapabilities(),
    ]);
    if (zonesRes.error) {
      setListError(zonesRes.error);
      setLayers([]);
    } else {
      const rows = zonesRes.data ?? [];
      const mapped = rows
        .map((row, i) => zoneRecordToLayer(row as SavedZone, i))
        .filter((z): z is MapZoneLayer => z !== null);
      setLayers(mapped);
    }
    if (!capsRes.error && capsRes.data) {
      setCapabilities(capsRes.data);
    }
    setLoadingList(false);
  }, []);

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
    setDraftCircle(null);
    setSelectedH3Cells([]);
    setProximityCenter(null);
    setObjectCenter(null);
    setObjectQuery("");
    setObjectReferenceId("");
    setCommunalValidation(null);
    setGovernmentValidation(null);
    setDynamicPreview(null);
    setDynamicPreviewError(null);
    setStatus(null);
    setError(null);
  }, []);

  const changeZoneType = useCallback(
    (next: ZoneType) => {
      setZoneType(next);
      resetDrafts();
    },
    [resetDrafts],
  );

  const toggleH3Cell = useCallback((cell: string) => {
    setSelectedH3Cells((cells) =>
      cells.includes(cell) ? cells.filter((c) => c !== cell) : [...cells, cell],
    );
  }, []);

  const clearLocationTimeout = useCallback(() => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
  }, []);

  const applyDeviceLocation = useCallback(
    (lat: number, lng: number, accuracy?: number) => {
      clearLocationTimeout();
      const here: LatLng = [lat, lng];
      setProximityCenter(here);
      setProximitySource("current_location");
      setMapCenter(here);
      setFitDraftToken((t) => t + 1);
      setProximityLocating(false);
      const acc =
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? ` · ±${Math.round(accuracy)} m`
          : "";
      setStatus(`Locked onto your location${acc}`);
      setError(null);
      void setStoredMapCenter({ latitude: lat, longitude: lng });
    },
    [clearLocationTimeout],
  );

  const handleDeviceLocationError = useCallback(
    (message: string) => {
      clearLocationTimeout();
      setProximityLocating(false);
      setError(message || LOCATION_UNAVAILABLE_MESSAGE);
      setStatus(null);
    },
    [clearLocationTimeout],
  );

  const requestMapWebViewLocation = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Use your location",
            message:
              "Zone Weaver needs your device location to anchor the proximity zone.",
            buttonPositive: "Allow",
            buttonNegative: "Cancel",
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setProximityLocating(false);
          setError(
            "Location permission denied. Enable it in app settings or tap the map instead.",
          );
          setStatus(null);
          return;
        }
      } catch {
        // fall through and try the WebView prompt anyway
      }
    }
    clearLocationTimeout();
    locationTimeoutRef.current = setTimeout(() => {
      setProximityLocating(false);
      setError(LOCATION_UNAVAILABLE_MESSAGE);
      setStatus(null);
    }, 22000);
    setLocationRequestNonce((n) => n + 1);
  }, [clearLocationTimeout]);

  const requestCurrentLocation = useCallback(async () => {
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
        setError(
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
  }, [applyDeviceLocation, requestMapWebViewLocation]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
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
    if (zoneType === "communal_id" && communalValidation?.valid) {
      const rings = ringsFromValidation(communalValidation);
      return rings[0] ?? [];
    }
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      const rings = ringsFromValidation(governmentValidation);
      return rings[0] ?? [];
    }
    return [];
  }, [
    communalValidation,
    draftRing,
    geofenceTool,
    governmentValidation,
    zoneType,
  ]);

  /** H3 cells from validation preview (communal / government) plus grid selection. */
  const selectedH3CellsForMap = useMemo(() => {
    if (zoneType === "grid") return selectedH3Cells;
    if (zoneType === "communal_id" && communalValidation?.valid) {
      return communalValidation.h3_cells ?? [];
    }
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      return governmentValidation.h3_cells ?? [];
    }
    return [];
  }, [
    communalValidation,
    governmentValidation,
    selectedH3Cells,
    zoneType,
  ]);

  const previewRingsForMap = useMemo<LatLng[][]>(() => {
    if (zoneType === "communal_id" && communalValidation?.valid) {
      return ringsFromValidation(communalValidation);
    }
    if (zoneType === "government_local_code" && governmentValidation?.valid) {
      return ringsFromValidation(governmentValidation);
    }
    return [];
  }, [communalValidation, governmentValidation, zoneType]);

  const validateCommunal = useCallback(async () => {
    const code = communalCode.trim();
    if (!code) {
      setError("Enter a communal ID first.");
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
      setError(result.error ?? "Could not validate communal ID.");
      setStatus(null);
      return;
    }
    if (!result.data.valid) {
      setCommunalValidation(null);
      setError(result.data.message ?? "Communal ID could not be resolved.");
      setStatus(null);
      return;
    }
    setCommunalValidation(result.data);
    setStatus(
      `Communal ID validated — ${result.data.display_name ?? result.data.reference_id}`,
    );
    const rings = ringsFromValidation(result.data);
    if (rings[0] && rings[0][0]) setMapCenter(rings[0][0]);
  }, [communalCode]);

  const generateCommunal = useCallback(async () => {
    setCommunalValidating(true);
    setError(null);
    setStatus("Generating communal ID…");
    const result = await generateZoneReference("communal_id");
    setCommunalValidating(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not generate communal ID.");
      setStatus(null);
      return;
    }
    if (!result.data.valid) {
      setError(result.data.message ?? "Server could not generate a communal ID.");
      setStatus(null);
      return;
    }
    setCommunalCode(result.data.reference_id);
    setCommunalValidation(result.data);
    setStatus(`Generated ${result.data.reference_id}`);
    const rings = ringsFromValidation(result.data);
    if (rings[0] && rings[0][0]) setMapCenter(rings[0][0]);
  }, []);

  const validateGovernment = useCallback(async () => {
    const f = governmentFields;
    if (!f.postal && !f.city) {
      setError("Enter at least a postal code or city.");
      return;
    }
    if (!f.country.trim()) {
      setError("Enter a country (e.g. Canada).");
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
      setError(result.error ?? "Could not validate address.");
      setStatus(null);
      return;
    }
    if (!result.data.valid) {
      setGovernmentValidation(null);
      setError(result.data.message ?? "Address could not be resolved.");
      setStatus(null);
      return;
    }
    setGovernmentValidation(result.data);
    setStatus(
      `Address validated — ${result.data.display_name ?? result.data.reference_id}`,
    );
    const rings = ringsFromValidation(result.data);
    if (rings[0] && rings[0][0]) setMapCenter(rings[0][0]);
  }, [governmentFields, governmentMode]);

  const canSave = useMemo(() => {
    const trimmed = zoneName.trim();
    if (!trimmed || trimmed.length > MAX_ZONE_NAME_LENGTH) return false;
    if (capabilities && capabilities.can_create_zone === false) return false;
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
    if (zoneType === "communal_id") return Boolean(communalValidation?.valid);
    if (zoneType === "government_local_code")
      return Boolean(governmentValidation?.valid);
    if (zoneType === "object") {
      return Boolean(
        objectCenter && objectRadius > 0 && objectReferenceId.trim(),
      );
    }
    return false;
  }, [
    communalValidation,
    draftCircle,
    draftRing,
    dynamicPreview,
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
      setError("Complete the zone details first.");
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
        config: { h3_cells: [] },
      };
    } else if (zoneType === "grid") {
      payload = {
        name: zoneName.trim(),
        type: "grid",
        zone_type: "grid",
        ...ownerStamp,
        geometry: {},
        config: { h3_cells: selectedH3Cells },
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
        },
      };
    } else if (zoneType === "communal_id" && communalValidation?.valid) {
      const refFence = communalValidation.geometry?.geo_fence_polygon;
      payload = {
        name: zoneName.trim(),
        type: "communal_id",
        zone_type: "communal_id",
        ...ownerStamp,
        geometry: communalValidation.geometry,
        geo_fence_polygon:
          refFence && typeof refFence === "object"
            ? (refFence as Record<string, unknown>)
            : undefined,
        config: {
          ...(communalValidation.config ?? {}),
          communal_id: communalCode.trim().toUpperCase(),
        },
        h3_cells: communalValidation.h3_cells,
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
        config: governmentValidation.config,
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
        },
      };
    }

    if (!payload) {
      setError("Unknown zone type.");
      return false;
    }

    setSaving(true);
    setStatus("Saving zone…");
    const finalPayload: CreateZonePayload = description
      ? { ...payload, description }
      : payload;
    const result = await createZone(finalPayload);
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Zone save failed.");
      setStatus(null);
      return false;
    }
    setStatus(`Zone "${zoneName}" saved.`);
    resetDrafts();
    await refresh();
    return true;
  }, [
    canSave,
    communalCode,
    communalValidation,
    draftCircle,
    draftRing,
    dynamicMax,
    dynamicMin,
    dynamicPreview,
    dynamicTarget,
    geofenceTool,
    governmentValidation,
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
    selectedH3Cells,
    zoneDescription,
    zoneName,
    zoneType,
  ]);

  const remove = useCallback(
    async (id: string) => {
      setStatus("Deleting zone…");
      const result = await deleteZone(id);
      if (result.error) {
        setError(result.error);
        setStatus(null);
        return;
      }
      setStatus("Zone deleted.");
      await refresh();
    },
    [refresh],
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
    loadingList,
    listError,
    refresh,
    remove,
    capabilities,

    // form
    zoneType,
    changeZoneType,
    zoneName,
    setZoneName,
    zoneDescription,
    setZoneDescription,

    mapCenter,
    setMapCenter,

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
      setDraftCircle(null);
    },
    undoGeofencePoint: () =>
      setDraftRing((cur) => (cur.length ? cur.slice(0, -1) : cur)),
    finishGeofencePolygon: () => {
      setDraftRing((cur) => {
        if (cur.length < 3) return cur;
        if (isClosedPolygon(cur)) return cur;
        return [...cur, cur[0]];
      });
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
    communalCode,
    setCommunalCode,
    communalValidation,
    communalValidating,
    validateCommunal,
    generateCommunal,

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
    clearH3: () => setSelectedH3Cells([]),

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
