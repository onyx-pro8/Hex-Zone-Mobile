import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Layers, Save, Trash2 } from "lucide-react-native";
import { AppHeader } from "@/components/ui/AppHeader";
import {
  isOwnZone,
  listZoneShapes,
  summarizeZone,
  zoneOwnerLabel,
  type MapZoneLayer,
  type ZoneShapeItem,
} from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

type Props = {
  subtitle: string;
  layers: MapZoneLayer[];
  loadingList: boolean;
  listError: string | null;
  currentUserId?: string;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  canDeleteLayer: (layer: MapZoneLayer) => boolean;
  onSelectLayer: (layer: MapZoneLayer) => void;
  onSelectShape: (layer: MapZoneLayer, shape: ZoneShapeItem) => void;
  onDeleteLayer: (layer: MapZoneLayer) => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
};

export function ZonesPageHeader({
  subtitle,
  layers,
  loadingList,
  listError,
  currentUserId,
  listOpen,
  onListOpenChange,
  canDeleteLayer,
  onSelectLayer,
  onSelectShape,
  onDeleteLayer,
  onSave,
  saving,
  canSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [shapesLayer, setShapesLayer] = useState<MapZoneLayer | null>(null);

  const shapes = shapesLayer ? listZoneShapes(shapesLayer) : [];

  const handleLayerPress = (layer: MapZoneLayer) => {
    const pieces = listZoneShapes(layer);
    if (pieces.length > 1) {
      onListOpenChange(false);
      setShapesLayer(layer);
      return;
    }
    onListOpenChange(false);
    onSelectLayer(layer);
  };

  const handleShapePress = (shape: ZoneShapeItem) => {
    if (!shapesLayer) return;
    const layer = shapesLayer;
    setShapesLayer(null);
    onSelectShape(layer, shape);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <AppHeader
            title="Zones"
            subtitle={subtitle}
            compact
            style={styles.headerInner}
            leadingActions={
              <Pressable
                onPress={() => onListOpenChange(!listOpen)}
                accessibilityRole="button"
                accessibilityLabel="Zones list"
                hitSlop={6}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Layers
                  size={18}
                  color={listOpen ? colors.accentDeep : colors.accent}
                  strokeWidth={2.2}
                />
              </Pressable>
            }
          />
        </View>

        <Pressable
          onPress={onSave}
          disabled={!canSave || saving}
          accessibilityRole="button"
          accessibilityLabel="Save zone"
          style={[
            styles.sideBtn,
            styles.saveBtn,
            {
              backgroundColor: canSave ? colors.accent : colors.textDim,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Save size={15} color="#fff" strokeWidth={2.4} />
          )}
          {!saving && <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <Modal
        visible={listOpen}
        transparent
        animationType="fade"
        onRequestClose={() => onListOpenChange(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => onListOpenChange(false)}
          />
          <View style={[styles.dropdown, { marginTop: insets.top + 72 }]}>
            <Text style={styles.dropdownTitle}>
              Saved zones ({layers.length})
            </Text>
            {loadingList && layers.length === 0 ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginVertical: 16 }}
              />
            ) : null}
            {!loadingList && layers.length === 0 ? (
              <Text style={styles.emptyText}>
                {listError ? "Could not load zones." : "No saved zones yet."}
              </Text>
            ) : null}
            <ScrollView
              style={{ maxHeight: 280 }}
              keyboardShouldPersistTaps="handled"
            >
              {layers.map((layer) => {
                const summary = summarizeZone(layer.raw);
                const owner = zoneOwnerLabel(layer.raw);
                const mine = isOwnZone(layer.raw, currentUserId);
                return (
                  <View
                    key={layer.id}
                    style={[styles.layerRow, mine ? styles.layerRowMine : null]}
                  >
                    <View
                      style={[styles.swatch, { backgroundColor: layer.color }]}
                    />
                    <Pressable
                      style={{ flex: 1, minWidth: 0 }}
                      onPress={() => handleLayerPress(layer)}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {layer.name}
                        {mine ? (
                          <Text style={styles.mineTag}> · Mine</Text>
                        ) : null}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {summary || layer.zoneType.replace("_", " ")}
                      </Text>
                      {owner ? (
                        <Text style={styles.rowOwner} numberOfLines={1}>
                          {owner}
                        </Text>
                      ) : null}
                    </Pressable>
                    <Pressable
                      onPress={() => onDeleteLayer(layer)}
                      disabled={!canDeleteLayer(layer)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete zone ${layer.name}`}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        backgroundColor: canDeleteLayer(layer)
                          ? "rgba(255,82,82,0.1)"
                          : "rgba(148,163,184,0.12)",
                        opacity: canDeleteLayer(layer) ? 1 : 0.45,
                      }}
                    >
                      <Trash2
                        size={14}
                        color={
                          canDeleteLayer(layer) ? colors.danger : colors.textDim
                        }
                      />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={shapesLayer != null}
        transparent
        animationType="fade"
        onRequestClose={() => setShapesLayer(null)}
      >
        <View style={styles.shapesRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShapesLayer(null)}
          />
          <View style={styles.shapesCard}>
            <Text style={styles.dropdownTitle}>Shapes in zone</Text>
            <Text style={styles.shapesZoneName} numberOfLines={1}>
              {shapesLayer?.name ?? "Zone"}
            </Text>
            <Text style={styles.shapesHint}>
              Tap a cell or polygon to zoom the map to it.
            </Text>
            <ScrollView
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
            >
              {shapes.map((shape) => (
                <Pressable
                  key={shape.id}
                  onPress={() => handleShapePress(shape)}
                  style={styles.shapeRow}
                >
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: shapesLayer?.color ?? colors.accent,
                      },
                    ]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {shape.label}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {shape.kind === "h3"
                        ? "Grid cell"
                        : shape.kind === "ring"
                          ? "Polygon"
                          : shape.kind === "circle"
                            ? "Circle"
                            : "Pin"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShapesLayer(null)}
              style={styles.shapesCancel}
            >
              <Text style={styles.shapesCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  sideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  headerCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  headerInner: {
    backgroundColor: "transparent",
    paddingRight: 12,
    paddingLeft: 14,
    paddingTop: 5,
    paddingBottom: 6,
  },
  saveBtn: {
    borderColor: "transparent",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 44, 92, 0.18)",
    paddingHorizontal: 20,
    alignItems: "flex-end",
  },
  dropdown: {
    width: "88%",
    maxWidth: 340,
    marginLeft: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  dropdownTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  layerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  layerRowMine: {
    backgroundColor: "rgba(47, 128, 237, 0.08)",
    borderColor: colors.accentSoft,
  },
  mineTag: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  rowName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  rowMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  rowOwner: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  shapesRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 44, 92, 0.28)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  shapesCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 14,
  },
  shapesZoneName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  shapesHint: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  shapeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  shapesCancel: {
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 10,
  },
  shapesCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
});
