import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Check,
  ChevronDown,
  Map as MapIcon,
  Search,
  X,
} from "lucide-react-native";
import type { SavedZone } from "@/api/zones";
import { PublicZoneMapPreviewModal } from "@/components/dashboard/PublicZoneMapPreviewModal";
import { colors } from "@/theme/colors";

type Props = {
  zones: SavedZone[];
  selectedIds: number[];
  loading?: boolean;
  highlightedIds?: number[];
  onToggle: (zoneId: number) => void;
  onRemove: (zoneId: number) => void;
  onOpenChange?: (open: boolean) => void;
};

function zoneSubtitle(zone: SavedZone): string {
  const cfg =
    zone.config && typeof zone.config === "object" ? zone.config : {};
  const existingId =
    typeof cfg.communal_id === "string" ? cfg.communal_id : "";
  return [zone.type ?? zone.zone_type, zone.owner_name, existingId || null]
    .filter(Boolean)
    .join(" · ");
}

function ZoneCheckbox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: checked ? colors.accent : colors.borderStrong,
        backgroundColor: checked ? colors.accent : "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

export function PublicZonesMultiSelect({
  zones,
  selectedIds,
  loading,
  highlightedIds = [],
  onToggle,
  onRemove,
  onOpenChange,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewZoneId, setPreviewZoneId] = useState<number | null>(null);

  const setDropdownOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const selectedZones = useMemo(() => {
    const byId = new Map(zones.map((z) => [Number(z.id), z]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((z): z is SavedZone => z != null);
  }, [selectedIds, zones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => {
      const name = (z.name ?? "").toLowerCase();
      const owner = (z.owner_name ?? "").toLowerCase();
      const type = String(z.type ?? z.zone_type ?? "").toLowerCase();
      const cfg = z.config && typeof z.config === "object" ? z.config : {};
      const communal =
        typeof cfg.communal_id === "string"
          ? cfg.communal_id.toLowerCase()
          : "";
      return (
        name.includes(q) ||
        owner.includes(q) ||
        type.includes(q) ||
        communal.includes(q)
      );
    });
  }, [query, zones]);

  const closeDropdown = () => {
    setDropdownOpen(false);
    setQuery("");
  };

  /** iOS cannot stack a second Modal over the picker — close picker first. */
  const openZonePreview = (zoneId: number) => {
    if (open) {
      setDropdownOpen(false);
      setQuery("");
      const delay = Platform.OS === "ios" ? 350 : 80;
      setTimeout(() => setPreviewZoneId(zoneId), delay);
      return;
    }
    setPreviewZoneId(zoneId);
  };

  return (
    <View style={{ gap: 8, zIndex: 20 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Network primary zones
      </Text>

      <View
        style={{
          minHeight: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: open ? colors.accent : colors.border,
          backgroundColor: colors.bgCard,
          paddingHorizontal: 10,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {selectedZones.length === 0 ? (
            <Pressable onPress={() => setDropdownOpen(true)} style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.textDim,
                  fontSize: 13,
                  paddingVertical: 4,
                }}
              >
                {loading
                  ? "Loading network primary zones…"
                  : zones.length === 0
                    ? "No primary zones in your network yet"
                    : "Search and select primary zones…"}
              </Text>
            </Pressable>
          ) : (
            selectedZones.map((zone) => (
              <View
                key={String(zone.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: "rgba(139,92,246,0.15)",
                  borderWidth: 1,
                  borderColor: "rgba(139,92,246,0.35)",
                }}
              >
                <Pressable onPress={() => setDropdownOpen(true)}>
                  <Text
                    style={{
                      color: "#6D28D9",
                      fontSize: 12,
                      fontWeight: "700",
                      maxWidth: 140,
                    }}
                    numberOfLines={1}
                  >
                    {zone.name ?? `Zone ${zone.id}`}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onRemove(Number(zone.id))}
                  hitSlop={8}
                >
                  <X size={12} color="#6D28D9" />
                </Pressable>
              </View>
            ))
          )}
        </View>
        <Pressable onPress={() => setDropdownOpen(true)} hitSlop={8}>
          <ChevronDown size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeDropdown}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              ...StyleFill,
              backgroundColor: "rgba(15, 44, 92, 0.35)",
            }}
            onPress={closeDropdown}
          />
          <View
            style={{
              maxHeight: Math.min(windowHeight * 0.72, 520),
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              backgroundColor: "#FFFFFF",
              borderTopWidth: 1,
              borderColor: colors.border,
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Select network primary zones
              </Text>
              <Pressable onPress={closeDropdown} hitSlop={10}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgCard,
              }}
            >
              <Search size={14} color={colors.textDim} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name…"
                placeholderTextColor={colors.textDim}
                autoFocus
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  color: colors.text,
                  fontSize: 14,
                }}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <X size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              ListEmptyComponent={
                <Text
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 20,
                    color: colors.textDim,
                    fontSize: 13,
                  }}
                >
                  {loading
                    ? "Loading…"
                    : zones.length === 0
                      ? "No primary zones in your network yet"
                      : `No zones match “${query.trim() || "…"}”.`}
                </Text>
              }
              renderItem={({ item: zone }) => {
                const id = Number(zone.id);
                const checked = selectedIds.includes(id);
                const highlighted = highlightedIds.includes(id);
                return (
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: highlighted
                        ? "rgba(139,92,246,0.12)"
                        : checked
                          ? "rgba(47,128,237,0.08)"
                          : "transparent",
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <Pressable
                      onPress={() => onToggle(id)}
                      hitSlop={6}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <ZoneCheckbox checked={checked} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontWeight: "600",
                            fontSize: 14,
                          }}
                        >
                          {zone.name ?? `Zone ${zone.id}`}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {zoneSubtitle(zone)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => openZonePreview(id)}
                      hitSlop={8}
                      accessibilityLabel={`Show ${zone.name ?? "zone"} on map`}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(47,128,237,0.12)",
                        borderWidth: 1,
                        borderColor: "rgba(47,128,237,0.25)",
                      }}
                    >
                      <MapIcon size={18} color={colors.accent} />
                    </Pressable>
                  </View>
                );
              }}
            />

            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: colors.textDim, fontSize: 12 }}>
                {selectedIds.length} selected · {zones.length} available
              </Text>
              <Pressable
                onPress={closeDropdown}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <PublicZoneMapPreviewModal
        visible={previewZoneId != null}
        zones={zones}
        focusZoneId={previewZoneId}
        onClose={() => setPreviewZoneId(null)}
      />
    </View>
  );
}

const StyleFill = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
