import { useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { Check, Search } from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ZoneBuilderState } from "@/hooks/useZoneBuilder";
import { colors } from "@/theme/colors";

type Props = {
  builder: ZoneBuilderState;
  /** Parent sheet should disable scroll while the picker is open. */
  onPickerOpenChange?: (open: boolean) => void;
};

/**
 * Multi Communal ID chips for primary zone create/edit (admins only).
 * Focusing the input opens a picker of network Communal IDs.
 */
export function CommunalIdsAttachField({ builder, onPickerOpenChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInputType>(null);

  const enabled =
    builder.canUseCommunalTools &&
    builder.createAsPrimary &&
    builder.zoneType !== "communal_id";
  const selected = useMemo(
    () => new Set(builder.definingCommunalIds),
    [builder.definingCommunalIds],
  );
  const rows = builder.publicCommunalIds ?? builder.networkCommunalIds ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.reference_id,
        row.network_id,
        row.creator_name ?? "",
        String(row.creator_id ?? ""),
      ]
        .join(" ")
        .toUpperCase();
      return hay.includes(q);
    });
  }, [query, rows]);

  if (!builder.canUseCommunalTools || builder.zoneType === "communal_id") {
    return null;
  }

  const openPicker = () => {
    if (!enabled || pickerOpen) return;
    setQuery("");
    setPickerOpen(true);
    onPickerOpenChange?.(true);
    inputRef.current?.blur();
  };

  const closePicker = () => {
    setPickerOpen(false);
    onPickerOpenChange?.(false);
    inputRef.current?.blur();
  };

  const toggleId = (id: string) => {
    const normalized = id.trim().toUpperCase();
    if (!normalized) return;
    if (selected.has(normalized)) {
      builder.removeDefiningCommunalId(normalized);
    } else {
      builder.addDefiningCommunalId(normalized);
    }
  };

  return (
    <>
      <View
        style={{
          gap: 10,
          marginTop: 4,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgCard,
          opacity: enabled ? 1 : 0.85,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          Communal ID connections
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {enabled
            ? "Tap the field to pick any public Communal ID (any network). Selected IDs appear as chips — tap a chip to remove it."
            : "Communal IDs can only be connected on Primary zones. Choose Primary tier (or edit a primary zone)."}
        </Text>

        {builder.definingCommunalIds.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {builder.definingCommunalIds.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  if (!enabled) return;
                  builder.removeDefiningCommunalId(id);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: "#EDE9FE",
                  borderWidth: 1,
                  borderColor: "#C4B5FD",
                }}
              >
                <Text
                  style={{ color: "#5B21B6", fontSize: 12, fontWeight: "600" }}
                >
                  {id}
                </Text>
                {enabled ? (
                  <Text style={{ color: "#7C3AED", fontSize: 12 }}>×</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textDim, fontSize: 11 }}>
            No Communal IDs connected yet.
          </Text>
        )}

        {enabled ? (
          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Add Communal ID
            </Text>
            <TextInput
              ref={inputRef}
              value=""
              editable
              showSoftInputOnFocus={false}
              caretHidden
              onFocus={openPicker}
              onPressIn={openPicker}
              placeholder="Tap to select Communal IDs…"
              placeholderTextColor={colors.textDim}
              style={{
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: colors.border,
                backgroundColor: colors.bg,
                paddingHorizontal: 12,
                color: colors.text,
                fontSize: 14,
              }}
            />
          </View>
        ) : null}
      </View>

      <BottomSheet visible={pickerOpen} onClose={closePicker} maxHeight="72%">
        <View style={{ padding: 16, gap: 12, paddingBottom: 28 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            Select Communal IDs
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}
          >
            Choose one or more public Communal IDs from any network. Already
            selected IDs stay checked.
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              backgroundColor: colors.bgCard,
            }}
          >
            <Search size={16} color={colors.textMuted} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by ID, generator, or network"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
              style={{
                flex: 1,
                paddingVertical: 12,
                color: colors.text,
                fontSize: 14,
              }}
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 360 }}
          >
            {rows.length === 0 ? (
              <Text
                style={{
                  color: colors.textDim,
                  fontSize: 13,
                  paddingVertical: 16,
                }}
              >
                No Communal IDs registered yet. Create one with the Communal
                tool first.
              </Text>
            ) : filtered.length === 0 ? (
              <Text
                style={{
                  color: colors.textDim,
                  fontSize: 13,
                  paddingVertical: 16,
                }}
              >
                No Communal IDs match “{query.trim()}”.
              </Text>
            ) : (
              filtered.map((row) => {
                const active = selected.has(row.reference_id);
                const generator =
                  row.creator_name?.trim() ||
                  (row.creator_id != null
                    ? `User #${row.creator_id}`
                    : "Unknown");
                const network = row.network_id?.trim() || "—";
                const zonesLabel =
                  row.zone_count === 0
                    ? "0 zones"
                    : `${row.zone_count} zone${row.zone_count === 1 ? "" : "s"}`;
                return (
                  <Pressable
                    key={row.reference_id}
                    onPress={() => toggleId(row.reference_id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: active
                        ? "rgba(139,92,246,0.08)"
                        : "transparent",
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: active ? "#8B5CF6" : colors.borderStrong,
                        backgroundColor: active ? "#8B5CF6" : "#fff",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {active ? (
                        <Check size={14} color="#fff" strokeWidth={3} />
                      ) : null}
                    </View>

                    <View style={{ flexShrink: 1, gap: 1, maxWidth: "46%" }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                        numberOfLines={1}
                      >
                        {row.reference_id}
                      </Text>
                      <Text
                        style={{ color: colors.textDim, fontSize: 11 }}
                        numberOfLines={1}
                      >
                        {zonesLabel}
                      </Text>
                    </View>

                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        alignItems: "flex-end",
                        gap: 1,
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
                        {generator}
                      </Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 11,
                          textAlign: "right",
                        }}
                        numberOfLines={1}
                      >
                        {network}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Pressable
            onPress={closePicker}
            style={{
              marginTop: 4,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
              Done
              {builder.definingCommunalIds.length
                ? ` · ${builder.definingCommunalIds.length} selected`
                : ""}
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}
