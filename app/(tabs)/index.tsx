import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronUp, Save, Trash2 } from "lucide-react-native";
import { DashboardMap } from "@/components/dashboard/DashboardMap";
import { ZoneTypePicker } from "@/components/dashboard/ZoneTypePicker";
import { ZoneTypePanel } from "@/components/dashboard/ZoneTypePanel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { AlertBellButton } from "@/components/ui/AlertBellButton";
import { useAuth } from "@/context/AuthContext";
import { MAX_ZONE_NAME_LENGTH, useZoneBuilder } from "@/hooks/useZoneBuilder";
import { colorForZoneType, summarizeZone } from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

export default function DashboardScreen() {
  const { ownerZoneId } = useAuth();
  // Always create zones against the account owner's zone_id, not the
  // signed-in user's. For admins they're the same; for non-admin USERS
  // the owner's zone is the canonical one for the whole account.
  const builder = useZoneBuilder(ownerZoneId || undefined);
  const [panelOpen, setPanelOpen] = useState(true);

  const dragResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 24) setPanelOpen(false);
      },
    }),
  ).current;

  const sectionTitle = useMemo(() => {
    switch (builder.zoneType) {
      case "geofence":
        return "Geofence zone";
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
  }, [builder.zoneType]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DashboardMap
        center={builder.mapCenter}
        drawMode={panelOpen ? builder.drawMode : "none"}
        draftRing={builder.draftRing}
        previewRings={builder.previewRings}
        draftCircle={builder.draftCircle}
        draftMarker={builder.draftMarker}
        selectedH3Cells={builder.selectedH3Cells}
        h3Resolution={builder.h3Resolution}
        savedLayers={builder.layers}
        draftColor={builder.draftColor}
        draftCircleSolid={builder.draftCircleSolid}
        fitDraftToken={builder.fitDraftToken}
        locationRequestNonce={builder.locationRequestNonce}
        onMapClick={builder.handleMapClick}
        onH3Toggle={builder.toggleH3Cell}
        onDeviceLocation={builder.applyDeviceLocation}
        onDeviceLocationError={builder.handleDeviceLocationError}
        style={{ flex: 1 }}
      />

      {/* Header */}
      <SafeAreaView
        edges={["top"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.92)",
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo size={22} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colorForZoneType(builder.zoneType),
              }}
            />
            <Text
              style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
            >
              {sectionTitle}
            </Text>
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor:
                  builder.capabilities?.can_create_zone === false
                    ? colors.danger
                    : colors.border,
              }}
            >
              <Text
                style={{
                  color:
                    builder.capabilities?.can_create_zone === false
                      ? colors.danger
                      : colors.textMuted,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {builder.loadingList
                  ? "…"
                  : builder.capabilities?.max_total != null
                    ? `${builder.layers.length}/${builder.capabilities.max_total}`
                    : `${builder.layers.length} saved`}
              </Text>
            </View>
          </View>
          <AlertBellButton />
        </View>
      </SafeAreaView>

      {/* Bottom sheet — tap handle to hide / show */}
      <SafeAreaView
        edges={["bottom"]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        pointerEvents="box-none"
      >
        {panelOpen ? (
          <View
            style={{
              marginHorizontal: 10,
              marginBottom: 8,
              borderRadius: 22,
              backgroundColor: "rgba(255,255,255,0.97)",
              borderWidth: 1,
              borderColor: colors.border,
              maxHeight: 440,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => setPanelOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Hide zone panel"
              {...dragResponder.panHandlers}
              style={{
                paddingTop: 10,
                paddingBottom: 8,
                paddingHorizontal: 14,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colors.borderStrong,
                  marginBottom: 8,
                }}
              />
            </Pressable>

            <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
              <ZoneTypePicker
                value={builder.zoneType}
                onChange={builder.changeZoneType}
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 14, gap: 14 }}
              bounces={false}
            >
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
                <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}>
                  {builder.capabilities.reason ??
                    "You've reached the zone limit for this account. Delete a zone to free a slot."}
                </Text>
              </View>
            ) : null}

            <ZoneTypePanel builder={builder} />

            {builder.listError ? (
              <Text style={{ color: colors.danger, fontSize: 12 }}>
                {builder.listError}
              </Text>
            ) : null}

              {builder.error ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {builder.error}
                </Text>
              ) : null}
              {builder.status ? (
                <Text style={{ color: colors.accent, fontSize: 12 }}>
                  {builder.status}
                </Text>
              ) : null}

              <Button
                label={builder.saving ? "Saving…" : "Save zone"}
                onPress={() => void builder.save()}
                loading={builder.saving}
                disabled={!builder.canSave}
                fullWidth
                size="lg"
                leftIcon={<Save size={18} color="#fff" />}
              />

              {builder.loadingList && builder.layers.length === 0 ? (
                <ActivityIndicator color={colors.accent} />
              ) : null}

              {builder.layers.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Saved zones
                  </Text>
                {builder.layers.map((layer) => {
                  const summary = summarizeZone(layer.raw);
                  return (
                    <View
                      key={layer.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: colors.bgCard,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: layer.color,
                        }}
                      />
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => {
                          const target =
                            layer.rings[0]?.[0] ??
                            layer.circles[0]?.center ??
                            layer.marker ??
                            builder.mapCenter;
                          builder.setMapCenter(target);
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
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {summary || layer.zoneType.replace("_", " ")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void builder.remove(layer.id)}
                        hitSlop={8}
                        style={{
                          padding: 8,
                          borderRadius: 10,
                          backgroundColor: "rgba(255,82,82,0.1)",
                        }}
                      >
                        <Trash2 size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  );
                })}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : (
          <Pressable
            onPress={() => setPanelOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Show zone panel"
            style={{
              alignSelf: "center",
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.95)",
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colorForZoneType(builder.zoneType),
              }}
            />
            <Text
              style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
            >
              Zone tools
            </Text>
            <ChevronUp size={16} color={colors.accent} />
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}
