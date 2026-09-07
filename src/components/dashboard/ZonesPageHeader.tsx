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
import { ChevronDown, Save, Trash2 } from "lucide-react-native";
import { AppHeader } from "@/components/ui/AppHeader";
import { summarizeZone, zoneOwnerLabel, type MapZoneLayer } from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

type Props = {
  subtitle: string;
  layers: MapZoneLayer[];
  loadingList: boolean;
  listError: string | null;
  canDeleteLayer: (layer: MapZoneLayer) => boolean;
  onSelectLayer: (layer: MapZoneLayer) => void;
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
  canDeleteLayer,
  onSelectLayer,
  onDeleteLayer,
  onSave,
  saving,
  canSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [listOpen, setListOpen] = useState(false);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        {/* Compact centered header: title, zone type, alerts, avatar */}
        <View style={styles.headerCard}>
          <AppHeader
            title="Zones"
            subtitle={subtitle}
            compact
            style={styles.headerInner}
          />
        </View>

        {/* Outside / right of header */}
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
          <Text style={styles.saveBtnText}>{saving ? "…" : "Save"}</Text>
        </Pressable>
        {/* Outside / left of header */}
        <Pressable
          onPress={() => setListOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Zones list"
          style={[styles.sideBtn, { borderWidth: 0, paddingHorizontal: 0 }]}
        >
          <Text style={styles.listBtnText} numberOfLines={1}>
            Zones
          </Text>
          <ChevronDown
            size={14}
            color={colors.accent}
            style={{
              transform: [{ rotate: listOpen ? "180deg" : "0deg" }],
            }}
          />
        </Pressable>
      </View>

      <Modal
        visible={listOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setListOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setListOpen(false)}
          />
          <View style={[styles.dropdown, { marginTop: insets.top + 58 }]}>
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
                return (
                  <View key={layer.id} style={styles.layerRow}>
                    <View
                      style={[styles.swatch, { backgroundColor: layer.color }]}
                    />
                    <Pressable
                      style={{ flex: 1, minWidth: 0 }}
                      onPress={() => {
                        setListOpen(false);
                        onSelectLayer(layer);
                      }}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {layer.name}
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
    gap: 4,
    paddingHorizontal: 6,
  },
  sideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  listBtnText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800",
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
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  saveBtn: {
    borderColor: "transparent",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 11,
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
});
