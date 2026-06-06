import { Text, View, Pressable } from "react-native";
import {
  CheckCircle2,
  Crosshair,
  LocateFixed,
  MapPin,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react-native";
import { isClosedPolygon } from "@/lib/zoneGeometry";
import { setStoredMapCenter } from "@/lib/storage";
import { Input } from "@/components/ui/Input";
import { AddressAutocompleteInput } from "@/components/ui/AddressAutocompleteInput";
import { CompactSlider } from "@/components/dashboard/Slider";
import type { ZoneBuilderState } from "@/hooks/useZoneBuilder";
import { colors } from "@/theme/colors";

type Props = { builder: ZoneBuilderState };

export function ZoneTypePanel({ builder }: Props) {
  const t = builder.zoneType;

  if (t === "geofence") {
    const polygonPoints = builder.draftRing.length;
    const polygonClosed = isClosedPolygon(builder.draftRing);
    const canFinishPolygon =
      builder.geofenceTool === "polygon" && polygonPoints >= 3 && !polygonClosed;
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ToolButton
            label="Polygon"
            active={builder.geofenceTool === "polygon"}
            onPress={() => builder.setGeofenceTool("polygon")}
          />
          <ToolButton
            label="Circle"
            active={builder.geofenceTool === "circle"}
            onPress={() => builder.setGeofenceTool("circle")}
          />
        </View>
        <Text style={hintStyle}>
          {builder.geofenceTool === "polygon"
            ? polygonClosed
              ? `Polygon closed · ${polygonPoints - 1} vertices.`
              : polygonPoints === 0
                ? "Tap the map to drop vertices, then press Finish (or tap near the first point) to close."
                : polygonPoints < 3
                  ? `Add ${3 - polygonPoints} more vertex${polygonPoints === 2 ? "" : "es"} to enable Finish.`
                  : `Tap Finish to close the polygon, or keep adding vertices (${polygonPoints} so far).`
            : "Tap the map once for the circle center, tap again to set the radius."}
        </Text>
        {builder.geofenceTool === "polygon" ? (
          <SecondaryButton
            label={polygonClosed ? "Polygon closed" : "Finish polygon"}
            icon={
              <CheckCircle2
                size={14}
                color={
                  canFinishPolygon
                    ? colors.accent
                    : polygonClosed
                      ? colors.success
                      : colors.textDim
                }
              />
            }
            onPress={builder.finishGeofencePolygon}
            disabled={!canFinishPolygon}
            highlight={canFinishPolygon}
          />
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SecondaryButton
            label="Undo"
            icon={<RotateCcw size={14} color={colors.textMuted} />}
            onPress={builder.undoGeofencePoint}
          />
          <SecondaryButton
            label="Clear"
            icon={<Trash2 size={14} color={colors.textMuted} />}
            onPress={builder.clearGeofence}
          />
        </View>
      </View>
    );
  }

  if (t === "grid") {
    return (
      <View style={{ gap: 12 }}>
        <CompactSlider
          label={`H3 resolution (${builder.h3Resolution})`}
          value={builder.h3Resolution}
          min={5}
          max={13}
          onChange={(v) => builder.setH3Resolution(v)}
        />
        <Text style={hintStyle}>
          Tap on the map to toggle hex cells. {builder.selectedH3Cells.length} cell(s) selected.
        </Text>
        <SecondaryButton
          label="Clear cells"
          icon={<Trash2 size={14} color={colors.textMuted} />}
          onPress={builder.clearH3}
        />
      </View>
    );
  }

  if (t === "proximity") {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ToolButton
            label="Pin on map"
            icon={<MapPin size={14} color={builder.proximitySource === "map_pin" ? colors.accent : colors.textMuted} />}
            active={builder.proximitySource === "map_pin"}
            onPress={() => builder.setProximitySource("map_pin")}
          />
          <ToolButton
            label={builder.proximityLocating ? "Locating…" : "My location"}
            icon={
              <LocateFixed
                size={14}
                color={
                  builder.proximitySource === "current_location"
                    ? colors.accent
                    : colors.textMuted
                }
              />
            }
            active={builder.proximitySource === "current_location"}
            onPress={() => void builder.requestCurrentLocation()}
          />
        </View>
        <CompactSlider
          label={`Radius (${builder.proximityRadius} m)`}
          value={builder.proximityRadius}
          min={10}
          max={5000}
          step={10}
          onChange={builder.setProximityRadius}
        />
        {builder.proximityCenter ? (
          <Text style={hintStyle}>
            Center {builder.proximityCenter[0].toFixed(5)},{" "}
            {builder.proximityCenter[1].toFixed(5)}
          </Text>
        ) : (
          <Text style={hintStyle}>Tap the map or use location to place the source.</Text>
        )}
      </View>
    );
  }

  if (t === "dynamic") {
    const p = builder.dynamicPreview;
    return (
      <View style={{ gap: 12 }}>
        <Text style={hintStyle}>
          The server scans members in your zone and resolves the tightest cluster
          for the chosen target.
        </Text>
        <Input
          label="Target users"
          keyboardType="number-pad"
          value={String(builder.dynamicTarget)}
          onChangeText={(v) =>
            builder.setDynamicTarget(Math.max(0, Math.min(500, Number(v) || 0)))
          }
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Min radius (m)"
              keyboardType="number-pad"
              value={String(builder.dynamicMin)}
              onChangeText={(v) =>
                builder.setDynamicMin(Math.max(1, Number(v) || 0))
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Max radius (m)"
              keyboardType="number-pad"
              value={String(builder.dynamicMax)}
              onChangeText={(v) =>
                builder.setDynamicMax(Math.max(1, Number(v) || 0))
              }
            />
          </View>
        </View>
        <View
          style={{
            padding: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor:
              builder.dynamicPreviewError || p?.infeasible
                ? "#7F1D1D"
                : p && !p.infeasible
                  ? "#14532D"
                  : colors.border,
            backgroundColor: colors.bgCard,
          }}
        >
          {builder.dynamicPreviewLoading ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Resolving cluster…
            </Text>
          ) : builder.dynamicPreviewError ? (
            <Text style={{ color: colors.danger, fontSize: 12 }}>
              {builder.dynamicPreviewError}
            </Text>
          ) : p?.infeasible ? (
            <Text style={{ color: colors.danger, fontSize: 12 }}>
              {p.reason ?? "No cluster matches the current inputs."}
            </Text>
          ) : p?.center && p.resolved_radius_meters ? (
            <Text style={{ color: "#86EFAC", fontSize: 12, lineHeight: 18 }}>
              Cluster: {p.matched_user_count} users in{" "}
              {Math.round(p.resolved_radius_meters)} m circle.
              {"\n"}
              <Text style={{ color: colors.textDim }}>
                Center {p.center.latitude.toFixed(5)},{" "}
                {p.center.longitude.toFixed(5)} · pool {p.population_size}
              </Text>
            </Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Adjust inputs above for the server to resolve a cluster.
            </Text>
          )}
        </View>
        {p?.center && p.resolved_radius_meters ? (
          <SecondaryButton
            label="Show cluster on map"
            icon={<Crosshair size={14} color={colors.accent} />}
            onPress={() => builder.recenterDraft()}
          />
        ) : null}
      </View>
    );
  }

  if (t === "communal_id") {
    return (
      <View style={{ gap: 12 }}>
        <Input
          label="Communal ID"
          autoCapitalize="characters"
          placeholder="COMM-12345"
          value={builder.communalCode}
          onChangeText={builder.setCommunalCode}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SecondaryButton
            label={builder.communalValidating ? "Validating…" : "Validate"}
            icon={<Sparkles size={14} color={colors.textMuted} />}
            onPress={() => void builder.validateCommunal()}
          />
          <SecondaryButton
            label="Generate"
            icon={<Wand2 size={14} color={colors.textMuted} />}
            onPress={() => void builder.generateCommunal()}
          />
        </View>
        {builder.communalValidation?.valid ? (
          <Text style={{ color: "#C4B5FD", fontSize: 12 }}>
            {builder.communalValidation.display_name ??
              builder.communalValidation.reference_id}{" "}
            — preview on map
          </Text>
        ) : null}
      </View>
    );
  }

  if (t === "government_local_code") {
    const f = builder.governmentFields;
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ToolButton
            label="Postal area"
            active={builder.governmentMode === "postal"}
            onPress={() => builder.setGovernmentMode("postal")}
          />
          <ToolButton
            label="Street"
            active={builder.governmentMode === "street"}
            onPress={() => builder.setGovernmentMode("street")}
          />
        </View>
        {builder.governmentMode === "street" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 2 }}>
              <Input
                label="Street"
                placeholder="Queen St W"
                value={f.street}
                onChangeText={(v) =>
                  builder.setGovernmentFields({ ...f, street: v })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="No."
                placeholder="100"
                value={f.streetNumber}
                onChangeText={(v) =>
                  builder.setGovernmentFields({ ...f, streetNumber: v })
                }
              />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Postal code"
              placeholder="M5H 2N2"
              value={f.postal}
              onChangeText={(v) =>
                builder.setGovernmentFields({ ...f, postal: v })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="City"
              placeholder="Toronto"
              value={f.city}
              onChangeText={(v) =>
                builder.setGovernmentFields({ ...f, city: v })
              }
            />
          </View>
        </View>
        <Input
          label="Country"
          placeholder="Canada"
          value={f.country}
          onChangeText={(v) =>
            builder.setGovernmentFields({ ...f, country: v })
          }
        />
        <SecondaryButton
          label={builder.governmentValidating ? "Validating…" : "Validate address"}
          icon={<Sparkles size={14} color={colors.textMuted} />}
          onPress={() => void builder.validateGovernment()}
        />
        {builder.governmentValidation?.valid ? (
          <Text style={{ color: "#7DD3FC", fontSize: 12 }}>
            {builder.governmentValidation.display_name ??
              builder.governmentValidation.reference_id}{" "}
            — area polygon on map
          </Text>
        ) : null}
      </View>
    );
  }

  if (t === "object") {
    return (
      <View style={{ gap: 12 }}>
        <AddressAutocompleteInput
          label="Search object"
          placeholder="Building, café, landmark…"
          value={builder.objectQuery}
          onChange={(addr, coords) => {
            builder.setObjectQuery(addr);
            if (coords) {
              builder.setObjectCenter(coords);
              builder.setMapCenter(coords);
              void setStoredMapCenter({
                latitude: coords[0],
                longitude: coords[1],
              });
              if (!builder.objectReferenceId) {
                builder.setObjectReferenceId(
                  `place-${coords[0].toFixed(4)}-${coords[1].toFixed(4)}`,
                );
              }
            }
          }}
        />
        <Input
          label="Object ID"
          placeholder="OSM reference or custom ID"
          value={builder.objectReferenceId}
          onChangeText={builder.setObjectReferenceId}
        />
        <CompactSlider
          label={`Object radius (${builder.objectRadius} m)`}
          value={builder.objectRadius}
          min={5}
          max={2000}
          step={5}
          onChange={builder.setObjectRadius}
        />
        <Text style={hintStyle}>
          Pick a place from suggestions, or tap the map to fine-tune the anchor.
        </Text>
      </View>
    );
  }

  return null;
}

const hintStyle = {
  color: colors.textDim,
  fontSize: 12,
  lineHeight: 18,
} as const;

function ToolButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? "rgba(47,128,237,0.12)" : colors.bgCard,
      }}
    >
      {icon}
      <Text
        style={{
          color: active ? colors.accent : colors.textMuted,
          fontWeight: "700",
          fontSize: 12,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  onPress,
  disabled,
  highlight,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: highlight ? colors.accent : colors.border,
        backgroundColor: highlight ? "rgba(47,128,237,0.12)" : colors.bgCard,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      <Text
        style={{
          color: highlight ? colors.accent : colors.textMuted,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
