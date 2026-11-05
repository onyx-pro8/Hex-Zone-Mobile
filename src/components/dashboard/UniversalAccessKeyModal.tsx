import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, Copy, KeyRound, Search, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import {
  listPrivateUniversalAccessKeys,
  searchPublicUniversalAccessKeys,
  sendUniversalAccessKey,
  type UniversalAccessKeyRow,
} from "@/api/universalAccess";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

function CopyKeyButton({ code }: { code: string }) {
  return (
    <Pressable
      onPress={() => {
        void copyToClipboard(code).then((result) => {
          if (result.ok)
            toast.success("Access key copied.", { title: "Copied" });
          else toast.error(result.message || "Could not copy.");
        });
      }}
      accessibilityLabel="Copy access key"
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bgSurface,
      }}
    >
      <Copy size={12} color={colors.accent} />
      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
        Copy
      </Text>
    </Pressable>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onActivated?: () => void;
};

export function UniversalAccessKeyModal({ open, onClose, onActivated }: Props) {
  const [privateKeys, setPrivateKeys] = useState<UniversalAccessKeyRow[]>([]);
  const [publicQuery, setPublicQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UniversalAccessKeyRow[]>([]);
  const [pickedPublic, setPickedPublic] = useState<UniversalAccessKeyRow | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectableKeys = useMemo(() => {
    const rows = [...privateKeys];
    if (
      pickedPublic &&
      !rows.some((row) => row.credential_id === pickedPublic.credential_id)
    ) {
      rows.push(pickedPublic);
    }
    return rows;
  }, [privateKeys, pickedPublic]);

  useEffect(() => {
    if (!open) return;
    setPublicQuery("");
    setSuggestions([]);
    setPickedPublic(null);
    setSelectedId(null);
    setLoading(true);
    void listPrivateUniversalAccessKeys().then((result) => {
      setPrivateKeys(result.data ?? []);
      if (result.error) toast.error(result.error);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = publicQuery.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchPublicUniversalAccessKeys(query).then((result) => {
        setSuggestions(Array.isArray(result.data) ? result.data : []);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [publicQuery, open]);

  async function onSendKey() {
    if (selectedId == null) {
      toast.error("Select one access key to send.");
      return;
    }
    setBusy(true);
    const result = await sendUniversalAccessKey(selectedId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Access key sent.");
    onActivated?.();
    onClose();
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            maxHeight: "85%",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <KeyRound size={16} color={colors.accent} />
              <Text
                style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}
              >
                Universal access keys
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    Find a public access key
                  </Text>
                  <View
                    style={{
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor: colors.bgCard,
                    }}
                  >
                    <Search size={16} color={colors.textMuted} />
                    <TextInput
                      value={publicQuery}
                      onChangeText={setPublicQuery}
                      placeholder="Search public key"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 14,
                        paddingVertical: 10,
                      }}
                    />
                  </View>
                  {suggestions.length > 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        overflow: "hidden",
                        backgroundColor: colors.bgCard,
                      }}
                    >
                      {suggestions.map((item) => (
                        <Pressable
                          key={item.credential_id}
                          onPress={() => {
                            setPickedPublic(item);
                            setSelectedId(item.credential_id);
                            setPublicQuery(item.code);
                            setSuggestions([]);
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontFamily: "monospace",
                            }}
                          >
                            {item.code}
                          </Text>
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 12,
                              marginTop: 2,
                            }}
                          >
                            {(item.zones ?? [])
                              .map((zone) => zone.name)
                              .join(", ") || "Zones"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    Select one key
                  </Text>
                  {selectableKeys.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      No private keys yet. Search for a public key above.
                    </Text>
                  ) : (
                    selectableKeys.map((item) => {
                      const selected = selectedId === item.credential_id;
                      return (
                        <View
                          key={`${item.key_type}-${item.credential_id}`}
                          style={{
                            borderWidth: 1,
                            borderColor: selected
                              ? colors.success
                              : colors.border,
                            backgroundColor: selected
                              ? "rgba(47,162,74,0.08)"
                              : colors.bgCard,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            gap: 6,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setSelectedId(item.credential_id)}
                              style={{
                                flex: 1,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {selected ? (
                                <Check size={16} color={colors.success} />
                              ) : null}
                              <Text
                                style={{
                                  color: colors.text,
                                  fontFamily: "monospace",
                                  flexShrink: 1,
                                }}
                              >
                                {item.code}
                              </Text>
                              <Text
                                style={{
                                  color: colors.textMuted,
                                  fontSize: 10,
                                  fontWeight: "700",
                                  textTransform: "uppercase",
                                }}
                              >
                                {item.key_type}
                              </Text>
                              <Text
                                style={{
                                  color: selected
                                    ? colors.success
                                    : colors.accent,
                                  fontSize: 11,
                                  fontWeight: "700",
                                }}
                              >
                                {selected ? "Selected" : "Select"}
                              </Text>
                            </Pressable>
                            <CopyKeyButton code={item.code} />
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {(item.zones ?? [])
                              .map((zone) => zone.name)
                              .join(", ") || "Zones"}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Close"
                      size="sm"
                      fullWidth
                      variant="outline"
                      onPress={onClose}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={busy ? "Sending…" : "Send key"}
                      size="sm"
                      fullWidth
                      disabled={busy || selectedId == null}
                      onPress={() => void onSendKey()}
                    />
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
