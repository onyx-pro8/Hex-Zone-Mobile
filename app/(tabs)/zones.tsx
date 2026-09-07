import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  LocateFixed,
  MapPin,
  Trash2,
  Undo2,
} from "lucide-react-native";
import { VerticalCompactSlider } from "@/components/dashboard/Slider";
import { DashboardMap } from "@/components/dashboard/DashboardMap";
import { ZoneTypePanel } from "@/components/dashboard/ZoneTypePanel";
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
import { MAX_ZONE_NAME_LENGTH, useZoneBuilder } from "@/hooks/useZoneBuilder";
import { isClosedPolygon, layerFocusPoint, zoneRecordToLayer, type MapZoneLayer } from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

const H3_RES_MIN = 5;
const H3_RES_MAX = 13;
const PROXIMITY_RADIUS_MIN = 10;
const PROXIMITY_RADIUS_MAX = 5000;
/** Compact Zones header row (card + side buttons), excluding safe-area inset. */
const ZONES_HEADER_BODY_HEIGHT = 58;

export default function DashboardScreen() {
  const { ownerZoneId, user } = useAuth();
  const insets = useSafeAreaInsets();
  const builder = useZoneBuilder(ownerZoneId || undefined, {
    currentUserId: user?.id != null ? String(user.id) : undefined,
    currentUserName: user?.name?.trim() || undefined,
    isAccountAdministrator:
      String(user?.role ?? "").toLowerCase() === "administrator",
  });

  const fabBottom = useFloatingFabBottom();

  /** Keep map chrome below the floating Zones header (iOS needs more offset). */
  const zonesHeaderBottom =
    insets.top + 6 + ZONES_HEADER_BODY_HEIGHT;
  const mapChromeTop =
    Platform.OS === "ios" ? zonesHeaderBottom + 14 : 96;
  const hintTop =
    Platform.OS === "ios" ? zonesHeaderBottom + 10 : 100;

  /** Zone-type dock collapsed by default (arrow-down only). */
  const [toolsExpanded, setToolsExpanded] = useState(false);
  /** Null until the user picks a draw tool — then map drawing is enabled. */
  const [activeTool, setActiveTool] = useState<ZoneDrawToolId | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailScrollEnabled, setDetailScrollEnabled] = useState(true);
  const [focusLayerId, setFocusLayerId] = useState<string | null>(null);
  const [focusLayerToken, setFocusLayerToken] = useState(0);

  const handlePublicZonesMenuOpenChange = useCallback((open: boolean) => {
    setDetailScrollEnabled(!open);
  }, []);

  /** Include public zones on the map during communal flow so focus works for others' zones. */
  const mapLayers = useMemo(() => {
    if (builder.zoneType !== "communal_id") return builder.layers;
    const byId = new Map(builder.layers.map((layer) => [layer.id, layer]));
    builder.publicZones.forEach((zone, index) => {
      const layer = zoneRecordToLayer(zone, index);
      if (layer && !byId.has(layer.id)) byId.set(layer.id, layer);
    });
    return Array.from(byId.values());
  }, [builder.layers, builder.publicZones, builder.zoneType]);

  const focusZoneOnMap = useCallback((zoneId: string) => {
    setDetailOpen(false);
    setFocusLayerId(zoneId);
    setFocusLayerToken((token) => token + 1);
  }, []);

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
    builder.draftRing.length > 0 &&
    !isClosedPolygon(builder.draftRing);

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

  const handleSelectLayer = useCallback(
    (layer: MapZoneLayer) => {
      const target = layerFocusPoint(layer);
      builder.markMapUserAdjusted();
      if (target) {
        builder.setMapCenter(target);
      }
      // Always fit via the map WebView so H3-only grids (and circles) still jump.
      setFocusLayerId(layer.id);
      setFocusLayerToken((n) => n + 1);
    },
    [builder],
  );

  const drawHint = useMemo(() => {
    if (!drawingActive) return null;
    if (builder.zoneType === "geofence") {
      if (builder.geofenceTool === "polygon") {
        const n = builder.draftRing.length;
        if (isClosedPolygon(builder.draftRing)) {
          return "Polygon closed — open Details to name & save.";
        }
        if (n === 0) return "Tap the map to drop vertices.";
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
        locationRequestNonce={builder.locationRequestNonce}
        zoomControlTop={mapChromeTop}
        onMapClick={builder.handleMapClick}
        onH3Toggle={builder.toggleH3Cell}
        onDeviceLocation={builder.applyDeviceLocation}
        onDeviceLocationError={builder.handleDeviceLocationError}
        onUserMovedMap={builder.markMapUserAdjusted}
        style={{ flex: 1 }}
      />

      {/* Compact top row: Zones List | Header | Save */}
      <SafeAreaView
        edges={["top"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        pointerEvents="box-none"
      >
        <View style={{ marginTop: 6 }} pointerEvents="box-none">
          <ZonesPageHeader
            subtitle={sectionTitle}
            layers={builder.layers}
            loadingList={builder.loadingList}
            listError={builder.listError}
            canDeleteLayer={builder.canDeleteLayer}
            onSelectLayer={handleSelectLayer}
            onDeleteLayer={builder.remove}
            onSave={() => void builder.save()}
            saving={builder.saving}
            canSave={builder.canSave}
          />
        </View>
      </SafeAreaView>

      {/* Hint chip */}
      {drawHint ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: hintTop,
            alignSelf: "center",
            left: 72,
            right: 72,
            alignItems: "center",
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
              label="Zone details"
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
            Zone details
          </Text>

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

          {builder.capabilities?.can_create_zone === false ? (
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
                  "You've reached the zone limit for this user. Delete a zone to free a slot."}
              </Text>
            </View>
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
