import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  LocateFixed,
  MapPin,
  Trash2,
  Undo2,
  X,
} from "lucide-react-native";
import { VerticalCompactSlider } from "@/components/dashboard/Slider";
import { DashboardMap } from "@/components/dashboard/DashboardMap";
import { ZoneTypePanel } from "@/components/dashboard/ZoneTypePanel";
import { CommunalIdsAttachField } from "@/components/dashboard/CommunalIdsAttachField";
import {
  MapIconButton,
  ZONE_DRAW_TOOLS,
  ZoneToolsDock,
  type ZoneDrawToolId,
} from "@/components/dashboard/ZoneToolsRail";
import { ZonesPageHeader } from "@/components/dashboard/ZonesPageHeader";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  FLOATING_FAB_SIZE,
  useFloatingFabBottom,
} from "@/components/navigation/FloatingTabBar";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  MAX_ZONE_NAME_LENGTH,
  useZoneBuilder,
  zoneHasCommunalId,
} from "@/hooks/useZoneBuilder";
import { listZonesForCommunalId, type CommunalIdRow } from "@/api/zones";
import { normalizeAccountType } from "@/lib/accountLimits";
import {
  isClosedPolygon,
  layerFocusPoint,
  savedZoneRecordId,
  shapeFocusPoint,
  summarizeZone,
  zoneOwnerLabel,
  zoneRecordToLayer,
  type MapZoneLayer,
  type ZoneShapeItem,
} from "@/lib/zoneGeometry";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const H3_RES_MIN = 5;
const H3_RES_MAX = 13;
const PROXIMITY_RADIUS_MIN = 10;
const PROXIMITY_RADIUS_MAX = 5000;
/** Compact Zones header row (card + save), excluding safe-area inset. */
const ZONES_HEADER_BODY_HEIGHT = 70;
/** Space reserved on the chrome row for Leaflet +/- and the Zones list button. */
const CHROME_SIDE_WIDTH = 78;

export default function DashboardScreen() {
  const { ownerZoneId, user } = useAuth();
  const isAdmin = useIsAdmin();
  const accountType = useMemo(
    () => normalizeAccountType(user?.accountType, user?.account_type),
    [user?.accountType, user?.account_type],
  );
  /** Individual accounts are user-role only and never create primary zones. */
  const canChoosePrimaryTier =
    isAdmin && accountType !== "EXCLUSIVE";
  const insets = useSafeAreaInsets();
  const builder = useZoneBuilder(ownerZoneId || undefined, {
    currentUserId: user?.id != null ? String(user.id) : undefined,
    currentUserName: user?.name?.trim() || undefined,
    isAccountAdministrator: canChoosePrimaryTier,
    canUseCommunalTools: canChoosePrimaryTier,
  });

  const dockTools = useMemo(
    () =>
      canChoosePrimaryTier
        ? ZONE_DRAW_TOOLS
        : ZONE_DRAW_TOOLS.filter((tool) => tool.id !== "communal_id"),
    [canChoosePrimaryTier],
  );

  const fabBottom = useFloatingFabBottom();

  /** Keep map chrome below the floating Zones header (iOS needs more offset). */
  const zonesHeaderBottom =
    insets.top + 10 + ZONES_HEADER_BODY_HEIGHT;
  const mapChromeTop =
    Platform.OS === "ios" ? zonesHeaderBottom + 12 : zonesHeaderBottom + 8;
  const chromeRowTop = mapChromeTop;

  /** Zone-type dock collapsed by default (arrow-down only). */
  const [toolsExpanded, setToolsExpanded] = useState(false);
  /** Null until the user picks a draw tool — then map drawing is enabled. */
  const [activeTool, setActiveTool] = useState<ZoneDrawToolId | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailScrollEnabled, setDetailScrollEnabled] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [focusLayerId, setFocusLayerId] = useState<string | null>(null);
  const [focusLayerToken, setFocusLayerToken] = useState(0);
  const [focusShape, setFocusShape] = useState<{
    kind: ZoneShapeItem["kind"];
    index: number;
  } | null>(null);
  const [communalZonesPicker, setCommunalZonesPicker] = useState<{
    referenceId: string;
    layers: MapZoneLayer[];
  } | null>(null);
  const [communalZonesLoading, setCommunalZonesLoading] = useState(false);

  const handlePublicZonesMenuOpenChange = useCallback((open: boolean) => {
    setDetailScrollEnabled(!open);
  }, []);

  /** Own zones (list) + communal-shared zones (map only, not in list). */
  const mapLayers = useMemo(() => {
    const editId = builder.editingZoneId;
    const base = !editId
      ? builder.layers
      : builder.layers.filter(
          (layer) => savedZoneRecordId(layer.raw) !== editId,
        );
    if (builder.communalMapLayers.length === 0) return base;
    const byId = new Map(base.map((layer) => [layer.id, layer]));
    for (const layer of builder.communalMapLayers) {
      byId.set(layer.id, layer);
    }
    return Array.from(byId.values());
  }, [builder.editingZoneId, builder.layers, builder.communalMapLayers]);

  const focusZoneOnMap = useCallback((zoneId: string) => {
    setDetailOpen(false);
    setFocusShape(null);
    setFocusLayerId(zoneId);
    setFocusLayerToken((token) => token + 1);
  }, []);

  const handleSelectLayer = useCallback(
    (layer: MapZoneLayer) => {
      const target = layerFocusPoint(layer);
      builder.markMapUserAdjusted();
      if (target) {
        builder.setMapCenter(target);
      }
      setFocusShape(null);
      setFocusLayerId(layer.id);
      setFocusLayerToken((n) => n + 1);
    },
    [builder],
  );

  const handleSelectCommunalId = useCallback(
    async (row: CommunalIdRow) => {
      if (Number(row.zone_count ?? 0) <= 0) return;
      setListOpen(false);
      setCommunalZonesLoading(true);
      try {
        let matched = builder.communalMapLayers.filter((layer) =>
          zoneHasCommunalId(layer.raw, row.reference_id),
        );
        if (matched.length === 0) {
          const res = await listZonesForCommunalId(row.reference_id);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          matched = (res.data ?? [])
            .map((zone, index) =>
              zoneRecordToLayer(
                { ...zone, shared_via_communal: true },
                index,
              ),
            )
            .filter((layer): layer is MapZoneLayer => layer != null);
        }
        if (matched.length === 0) {
          toast.info("No drawable zones found for this Communal ID yet.");
          return;
        }
        if (matched.length === 1) {
          handleSelectLayer(matched[0]);
          return;
        }
        setCommunalZonesPicker({
          referenceId: row.reference_id,
          layers: matched,
        });
      } finally {
        setCommunalZonesLoading(false);
      }
    },
    [builder.communalMapLayers, handleSelectLayer],
  );

  const handleSelectShape = useCallback(
    (layer: MapZoneLayer, shape: ZoneShapeItem) => {
      const target = shapeFocusPoint(layer, shape);
      builder.markMapUserAdjusted();
      if (target) {
        builder.setMapCenter(target);
      }
      setFocusShape({ kind: shape.kind, index: shape.index });
      setFocusLayerId(layer.id);
      setFocusLayerToken((n) => n + 1);
    },
    [builder],
  );

  const handleEditLayer = useCallback(
    (layer: MapZoneLayer) => {
      const tool = builder.beginEdit(layer);
      if (!tool) return;
      setListOpen(false);
      setActiveTool(tool);
      setToolsExpanded(false);
      setDetailOpen(true);
      setFocusShape(null);
      setFocusLayerId(null);
      setFocusLayerToken((n) => n + 1);
    },
    [builder],
  );

  const refreshZones = builder.refresh;
  const isEditing = builder.isEditing;
  /** Skip the first focus callback — useZoneBuilder already loads on mount. */
  const skipNextFocusRefresh = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefresh.current) {
        skipNextFocusRefresh.current = false;
        return;
      }
      // Don't clobber an in-progress reshape with a mid-edit refetch.
      if (isEditing) return;
      void refreshZones();
    }, [isEditing, refreshZones]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (isEditing) return;
      void refreshZones();
    });
    return () => sub.remove();
  }, [isEditing, refreshZones]);

  const { zoneType, changeZoneType, setGeofenceTool } = builder;

  const sectionTitle = useMemo(() => {
    switch (builder.zoneType) {
      case "geofence":
        return builder.geofenceTool === "circle"
          ? "Geofence · Circle"
          : "Geofence · Polygon";
      case "grid":
        return "Grid zoning";
      case "proximity":
        return "Proximity-to-source";
      case "dynamic":
        return "Dynamic-size";
      case "communal_id":
        return "Communal ID";
      case "government_local_code":
        return "Government local code";
      case "object":
        return "Object zoning";
    }
  }, [builder.zoneType, builder.geofenceTool]);

  const selectTool = useCallback(
    (toolId: ZoneDrawToolId) => {
      if (activeTool === toolId) {
        setActiveTool(null);
        return;
      }

      const tool = ZONE_DRAW_TOOLS.find((t) => t.id === toolId);
      if (!tool) return;

      setActiveTool(toolId);

      if (tool.zoneType === "geofence") {
        if (zoneType !== "geofence") {
          changeZoneType("geofence");
        }
        if (tool.geofenceTool) {
          setGeofenceTool(tool.geofenceTool);
        }
      } else if (zoneType !== tool.zoneType) {
        changeZoneType(tool.zoneType);
      }
    },
    [activeTool, zoneType, changeZoneType, setGeofenceTool],
  );

  const drawingActive = activeTool != null;

  const canUndo =
    drawingActive &&
    builder.zoneType === "geofence" &&
    builder.geofenceTool === "polygon" &&
    builder.draftRing.length > 0;

  const canUndoGrid =
    drawingActive &&
    builder.zoneType === "grid" &&
    builder.canUndoH3;

  const canClear =
    drawingActive &&
    ((builder.zoneType === "geofence" &&
      (builder.draftRing.length > 0 || builder.draftCircle != null)) ||
      (builder.zoneType === "grid" &&
        (builder.selectedH3Cells.length > 0 || builder.canUndoH3)));

  const isPolygonDrawing =
    drawingActive &&
    activeTool === "polygon" &&
    builder.zoneType === "geofence" &&
    builder.geofenceTool === "polygon";

  const isGridDrawing =
    drawingActive &&
    activeTool === "grid" &&
    builder.zoneType === "grid";

  const isProximityDrawing =
    drawingActive &&
    activeTool === "proximity" &&
    builder.zoneType === "proximity";

  const showPolygonEditBar =
    isPolygonDrawing &&
    (builder.draftRing.length > 0 || builder.canRedoGeofencePoint);

  const showGridEditBar =
    isGridDrawing &&
    (builder.selectedH3Cells.length > 0 || builder.canUndoH3);

  const handleClear = useCallback(() => {
    if (builder.zoneType === "grid") {
      builder.clearH3();
    } else {
      builder.clearGeofence();
    }
  }, [builder]);

  const bumpH3Resolution = useCallback(
    (delta: number) => {
      const next = Math.min(
        H3_RES_MAX,
        Math.max(H3_RES_MIN, builder.h3Resolution + delta),
      );
      if (next !== builder.h3Resolution) {
        builder.setH3Resolution(next);
      }
    },
    [builder],
  );

  const drawHint = useMemo(() => {
    if (!drawingActive) return null;
    if (builder.zoneType === "geofence") {
      if (builder.geofenceTool === "polygon") {
        const n = builder.draftRing.length;
        if (isClosedPolygon(builder.draftRing)) {
          return builder.isEditing
            ? "Closed — Undo to reshape, or Update to save."
            : "Polygon closed — open Details to name & save.";
        }
        if (n === 0) return "Tap the map to drop vertices.";
        if (builder.isEditing) {
          return n < 3
            ? `Editing · add ${3 - n} more point${n === 2 ? "" : "s"}, or Undo.`
            : "Editing · tap map to add · Undo to remove · Update to save.";
        }
        if (n < 3) return `Add ${3 - n} more point${n === 2 ? "" : "s"}.`;
        return "Close near the first point to finish.";
      }
      return "Tap center, then tap again for radius.";
    }
    if (builder.zoneType === "grid") {
      return `Tap hex cells · ${builder.selectedH3Cells.length} selected · res ${builder.h3Resolution}`;
    }
    if (builder.zoneType === "proximity") {
      return builder.proximityCenter
        ? `Radius ${builder.proximityRadius} m · adjust slider on the right.`
        : "Pin on map or use My location to place the source.";
    }
    if (builder.zoneType === "communal_id") {
      return "Open Details to validate or generate a Communal ID.";
    }
    return "Open Details to configure this zone.";
  }, [builder, drawingActive]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DashboardMap
        center={builder.mapCenter}
        drawMode={drawingActive ? builder.drawMode : "none"}
        draftRing={builder.draftRing}
        previewRings={builder.previewRings}
        draftCircle={builder.draftCircle}
        draftMarker={builder.draftMarker}
        selectedH3Cells={builder.selectedH3Cells}
        h3Resolution={builder.h3Resolution}
        savedLayers={mapLayers}
        draftColor={builder.draftColor}
        draftCircleSolid={builder.draftCircleSolid}
        fitDraftToken={builder.fitDraftToken}
        focusLayerToken={focusLayerToken}
        focusLayerId={focusLayerId}
        focusShape={focusShape}
        locationRequestNonce={builder.locationRequestNonce}
        zoomControlTop={mapChromeTop}
        onMapClick={builder.handleMapClick}
        onH3Toggle={builder.toggleH3Cell}
        onDeviceLocation={builder.applyDeviceLocation}
        onDeviceLocationError={builder.handleDeviceLocationError}
        onUserMovedMap={builder.markMapUserAdjusted}
        style={{ flex: 1 }}
      />

      {/* Top row: Header + Save */}
      <SafeAreaView
        edges={["top"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        pointerEvents="box-none"
      >
        <View style={{ marginTop: 10 }} pointerEvents="box-none">
          <ZonesPageHeader
            subtitle={sectionTitle}
            layers={builder.layers}
            networkCommunalIds={builder.networkCommunalIds}
            loadingList={builder.loadingList}
            listError={builder.listError}
            currentUserId={
              user?.id != null ? String(user.id) : undefined
            }
            listOpen={listOpen}
            onListOpenChange={setListOpen}
            canDeleteLayer={builder.canDeleteLayer}
            canEditLayer={builder.canEditLayer}
            editingZoneId={builder.editingZoneId}
            onSelectLayer={handleSelectLayer}
            onSelectShape={handleSelectShape}
            onSelectCommunalId={(row) => {
              void handleSelectCommunalId(row);
            }}
            onEditLayer={handleEditLayer}
            onDeleteLayer={builder.remove}
            onSave={() => {
              void (async () => {
                const ok = await builder.save();
                if (ok) {
                  setActiveTool(null);
                  setDetailOpen(false);
                }
              })();
            }}
            saving={builder.saving}
            canSave={builder.canSave}
            saveLabel={
              builder.zoneType === "communal_id"
                ? "Save"
                : builder.isEditing
                  ? "Update"
                  : "Save"
            }
            showSave
          />
        </View>
      </SafeAreaView>

      {communalZonesLoading ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15,44,92,0.2)",
          }}
        >
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}

      <Modal
        visible={communalZonesPicker != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCommunalZonesPicker(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 20,
            backgroundColor: "rgba(15,44,92,0.45)",
          }}
        >
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={() => setCommunalZonesPicker(null)}
          />
          <View
            style={{
              borderRadius: 16,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: colors.border,
              maxHeight: "70%",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <Text
                  style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}
                  numberOfLines={1}
                >
                  {communalZonesPicker?.referenceId ?? "Communal ID"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {communalZonesPicker?.layers.length ?? 0} zone
                  {(communalZonesPicker?.layers.length ?? 0) === 1 ? "" : "s"} — tap
                  one to focus the map
                </Text>
              </View>
              <Pressable
                onPress={() => setCommunalZonesPicker(null)}
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <X size={18} color={colors.textMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {(communalZonesPicker?.layers ?? []).map((layer, index, all) => {
                const summary =
                  summarizeZone(layer.raw) ||
                  layer.zoneType.replace(/_/g, " ");
                const owner = zoneOwnerLabel(layer.raw);
                const isLast = index === all.length - 1;
                return (
                  <Pressable
                    key={layer.id}
                    onPress={() => {
                      setCommunalZonesPicker(null);
                      handleSelectLayer(layer);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                      backgroundColor: "transparent",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          marginRight: 10,
                          backgroundColor: layer.color,
                        }}
                      />
                      <View
                        style={{
                          flexShrink: 1,
                          maxWidth: "52%",
                          marginRight: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 13,
                            fontWeight: "700",
                          }}
                          numberOfLines={1}
                        >
                          {layer.name}
                        </Text>
                        <Text
                          style={{
                            color: colors.textDim,
                            fontSize: 11,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {summary}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          minWidth: 0,
                          alignItems: "flex-end",
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 12,
                            fontWeight: "600",
                            textAlign: "right",
                          }}
                          numberOfLines={1}
                        >
                          {owner || "—"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Chrome row: +/- (Leaflet) · centered draw hint */}
      {drawHint ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: chromeRowTop,
            left: CHROME_SIDE_WIDTH + 12,
            right: CHROME_SIDE_WIDTH + 12,
            alignItems: "center",
            justifyContent: "center",
            minHeight: 44,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.94)",
              borderWidth: 1,
              borderColor: colors.border,
              maxWidth: "100%",
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                lineHeight: 15,
                textAlign: "center",
              }}
            >
              {drawHint}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom-left: expandable zone types + polygon edit + details */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 16,
          bottom: fabBottom,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 10,
          zIndex: 30,
          elevation: 30,
        }}
      >
        <ZoneToolsDock
          expanded={toolsExpanded}
          onToggle={() => setToolsExpanded((v) => !v)}
          activeTool={activeTool}
          onSelect={selectTool}
          tools={dockTools}
        />

        {showPolygonEditBar ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 1,
            }}
          >
            <MapIconButton
              label="Undo"
              onPress={builder.undoGeofencePoint}
              disabled={!canUndo}
            >
              <Undo2
                size={18}
                color={canUndo ? colors.textMuted : colors.borderStrong}
                strokeWidth={2.2}
              />
            </MapIconButton>
            <MapIconButton
              label="Clear"
              onPress={handleClear}
              disabled={!canClear}
            >
              <Trash2
                size={18}
                color={canClear ? colors.danger : colors.borderStrong}
                strokeWidth={2.2}
              />
            </MapIconButton>
          </View>
        ) : null}

        {showGridEditBar ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 1,
            }}
          >
            <MapIconButton
              label="Undo"
              onPress={builder.undoH3Cell}
              disabled={!canUndoGrid}
            >
              <Undo2
                size={18}
                color={canUndoGrid ? colors.textMuted : colors.borderStrong}
                strokeWidth={2.2}
              />
            </MapIconButton>
            <MapIconButton
              label="Clear"
              onPress={handleClear}
              disabled={!canClear}
            >
              <Trash2
                size={18}
                color={canClear ? colors.danger : colors.borderStrong}
                strokeWidth={2.2}
              />
            </MapIconButton>
          </View>
        ) : null}

        {isProximityDrawing ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 1,
            }}
          >
            <MapIconButton
              label="Pin on map"
              onPress={() => builder.setProximitySource("map_pin")}
              accent={builder.proximitySource === "map_pin"}
            >
              <MapPin
                size={18}
                color={
                  builder.proximitySource === "map_pin"
                    ? "#fff"
                    : colors.textMuted
                }
                strokeWidth={2.2}
              />
            </MapIconButton>
            <MapIconButton
              label={
                builder.proximityLocating ? "Locating…" : "My location"
              }
              onPress={() => void builder.requestCurrentLocation()}
              accent={builder.proximitySource === "current_location"}
              disabled={builder.proximityLocating}
            >
              <LocateFixed
                size={18}
                color={
                  builder.proximitySource === "current_location"
                    ? "#fff"
                    : colors.textMuted
                }
                strokeWidth={2.2}
              />
            </MapIconButton>
          </View>
        ) : null}

        {drawingActive ? (
          <View style={{ marginBottom: 1 }}>
            <MapIconButton
              label={
                builder.zoneType === "communal_id"
                  ? "Communal ID"
                  : "Zone details"
              }
              onPress={() => setDetailOpen(true)}
            >
              <Edit size={18} color={colors.accent} strokeWidth={2.2} />
            </MapIconButton>
          </View>
        ) : null}
      </View>

      {/* H3 resolution column — above the compose + FAB */}
      {isGridDrawing ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            right: 16,
            bottom: fabBottom + FLOATING_FAB_SIZE + 14,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 6,
              paddingHorizontal: 4,
              alignItems: "center",
              gap: 2,
              shadowColor: "#0F2C5C",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 5,
              elevation: 4,
            }}
          >
            <Pressable
              onPress={() => bumpH3Resolution(1)}
              disabled={builder.h3Resolution >= H3_RES_MAX}
              accessibilityRole="button"
              accessibilityLabel="Increase H3 resolution"
              style={{
                width: 40,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: builder.h3Resolution >= H3_RES_MAX ? 0.35 : 1,
              }}
            >
              <ChevronUp size={20} color={colors.textMuted} strokeWidth={2.4} />
            </Pressable>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.accentGlow,
                borderWidth: 1.5,
                borderColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 14,
                  fontWeight: "800",
                }}
              >
                {builder.h3Resolution}
              </Text>
            </View>
            <Pressable
              onPress={() => bumpH3Resolution(-1)}
              disabled={builder.h3Resolution <= H3_RES_MIN}
              accessibilityRole="button"
              accessibilityLabel="Decrease H3 resolution"
              style={{
                width: 40,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: builder.h3Resolution <= H3_RES_MIN ? 0.35 : 1,
              }}
            >
              <ChevronDown
                size={20}
                color={colors.textMuted}
                strokeWidth={2.4}
              />
            </Pressable>
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 9,
              fontWeight: "800",
              letterSpacing: 0.6,
              color: colors.textDim,
              textTransform: "uppercase",
            }}
          >
            H3 res
          </Text>
        </View>
      ) : null}

      {/* Proximity radius slider — above the compose + FAB */}
      {isProximityDrawing ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            right: 16,
            bottom: fabBottom + FLOATING_FAB_SIZE + 14,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: "center",
              shadowColor: "#0F2C5C",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 5,
              elevation: 4,
            }}
          >
            <VerticalCompactSlider
              value={builder.proximityRadius}
              min={PROXIMITY_RADIUS_MIN}
              max={PROXIMITY_RADIUS_MAX}
              step={10}
              onChange={builder.setProximityRadius}
              formatValue={(v) => `${v} m`}
              height={320}
            />
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 9,
              fontWeight: "800",
              letterSpacing: 0.6,
              color: colors.textDim,
              textTransform: "uppercase",
            }}
          >
            Radius
          </Text>
        </View>
      ) : null}

      {builder.status ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: fabBottom + FLOATING_FAB_SIZE + 12,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 12,
              fontWeight: "600",
              textAlign: "center",
              backgroundColor: "rgba(255,255,255,0.92)",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {builder.status}
          </Text>
        </View>
      ) : null}

      <BottomSheet
        visible={detailOpen}
        onClose={() => {
          setDetailScrollEnabled(true);
          setDetailOpen(false);
        }}
        maxHeight="72%"
      >
        <View
          style={{ paddingTop: 10, paddingBottom: 8, alignItems: "center" }}
        >
          <View
            style={{
              width: 48,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.borderStrong,
            }}
          />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEnabled={detailScrollEnabled}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            {builder.zoneType === "communal_id"
              ? "Communal ID"
              : builder.isEditing
                ? "Edit zone"
                : "Zone details"}
          </Text>

          {builder.zoneType !== "communal_id" && builder.isEditing ? (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: "rgba(47,128,237,0.08)",
                borderWidth: 1,
                borderColor: colors.accentSoft,
                gap: 10,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                Editing{" "}
                <Text style={{ color: colors.accent, fontWeight: "700" }}>
                  {builder.editingZoneName ?? "zone"}
                </Text>
                . Adjust the shape on the map, then tap Update.
              </Text>
              <Pressable
                onPress={() => {
                  builder.cancelEdit();
                  setActiveTool(null);
                  setDetailOpen(false);
                }}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgCard,
                }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  Cancel edit
                </Text>
              </Pressable>
            </View>
          ) : null}

          {builder.zoneType !== "communal_id" ? (
            <>
              <View>
                <Input
                  label="Zone name"
                  placeholder="e.g. Building perimeter"
                  value={builder.zoneName}
                  onChangeText={(v) =>
                    builder.setZoneName(v.slice(0, MAX_ZONE_NAME_LENGTH))
                  }
                  maxLength={MAX_ZONE_NAME_LENGTH}
                />
                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    color: colors.textDim,
                    letterSpacing: 0.4,
                    textAlign: "right",
                  }}
                >
                  {builder.zoneName.length}/{MAX_ZONE_NAME_LENGTH}
                </Text>
              </View>

              <Input
                label="Description (optional)"
                placeholder="Notes about this zone"
                value={builder.zoneDescription}
                onChangeText={builder.setZoneDescription}
                multiline
              />

              {!builder.isEditing &&
              builder.capabilities?.can_create_zone === false ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "rgba(255,82,82,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,82,82,0.4)",
                  }}
                >
                  <Text
                    style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}
                  >
                    {builder.capabilities.reason ??
                      "You've reached the zone create limit."}
                  </Text>
                </View>
              ) : null}

              {!builder.isEditing &&
              canChoosePrimaryTier &&
              builder.capabilities?.can_create_zone !== false ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    Zone tier
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => builder.setCreateAsPrimary(true)}
                      disabled={builder.capabilities?.can_create_primary === false}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor:
                          builder.createAsPrimary &&
                          builder.capabilities?.can_create_primary !== false
                            ? colors.accent
                            : colors.border,
                        backgroundColor:
                          builder.createAsPrimary &&
                          builder.capabilities?.can_create_primary !== false
                            ? colors.accentGlow
                            : colors.bgCard,
                        opacity:
                          builder.capabilities?.can_create_primary === false
                            ? 0.4
                            : 1,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: builder.createAsPrimary
                            ? colors.accent
                            : colors.textMuted,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Primary
                      </Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 10,
                          marginTop: 2,
                        }}
                      >
                        Visible to all members
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => builder.setCreateAsPrimary(false)}
                      disabled={
                        builder.capabilities?.can_create_secondary === false
                      }
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor:
                          !builder.createAsPrimary &&
                          builder.capabilities?.can_create_secondary !== false
                            ? colors.accent
                            : colors.border,
                        backgroundColor:
                          !builder.createAsPrimary &&
                          builder.capabilities?.can_create_secondary !== false
                            ? colors.accentGlow
                            : colors.bgCard,
                        opacity:
                          builder.capabilities?.can_create_secondary === false
                            ? 0.4
                            : 1,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: !builder.createAsPrimary
                            ? colors.accent
                            : colors.textMuted,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Secondary
                      </Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 10,
                          marginTop: 2,
                        }}
                      >
                        Creator only
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    Up to {builder.capabilities?.max_primary ?? 2} primary ·{" "}
                    {builder.capabilities?.admin_primary_count ?? 0} primary used ·{" "}
                    {builder.capabilities?.remaining_total ?? "—"} slot
                    {(builder.capabilities?.remaining_total ?? 0) === 1 ? "" : "s"}{" "}
                    left
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {builder.zoneType !== "communal_id" ? (
            <CommunalIdsAttachField
              builder={builder}
              onPickerOpenChange={handlePublicZonesMenuOpenChange}
            />
          ) : null}

          {/* Name/description only for polygon, circle, grid, proximity —
              other types still need their config panel here. */}
          {builder.zoneType !== "geofence" &&
          builder.zoneType !== "grid" &&
          builder.zoneType !== "proximity" ? (
            <ZoneTypePanel
              builder={builder}
              onShowOnMap={() => setDetailOpen(false)}
              onPublicZonesMenuOpenChange={handlePublicZonesMenuOpenChange}
              onFocusZone={focusZoneOnMap}
            />
          ) : null}

          {builder.status ? (
            <Text style={{ color: colors.accent, fontSize: 12 }}>
              {builder.status}
            </Text>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
