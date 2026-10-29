import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Search,
  X,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import {
  activatePublicUniversalAccessKey,
  deactivatePublicUniversalAccessKey,
  listActivatedUniversalAccessKeys,
  listPrivateUniversalAccessKeys,
  searchPublicUniversalAccessKeys,
  setPrivateUniversalAccessKeySelected,
  type UniversalAccessKeyRow,
} from "@/api/universalAccess";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

type FieldStatus = "empty" | "inputting" | "selected";

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
  const [codes, setCodes] = useState<string[]>([""]);
  const [selectedFlags, setSelectedFlags] = useState<boolean[]>([false]);
  const [privateKeys, setPrivateKeys] = useState<UniversalAccessKeyRow[]>([]);
  const [activated, setActivated] = useState<UniversalAccessKeyRow[]>([]);
  const [suggestions, setSuggestions] = useState<UniversalAccessKeyRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privateBusyId, setPrivateBusyId] = useState<number | null>(null);

  function fieldStatus(index: number): FieldStatus {
    if (selectedFlags[index]) return "selected";
    if ((codes[index] ?? "").trim().length > 0) return "inputting";
    return "empty";
  }

  useEffect(() => {
    if (!open) return;
    setCodes([""]);
    setSelectedFlags([false]);
    setSuggestions([]);
    setActiveIndex(0);
    setLoading(true);
    void Promise.all([
      listPrivateUniversalAccessKeys(),
      listActivatedUniversalAccessKeys(),
    ]).then(([privateResult, activatedResult]) => {
      setPrivateKeys(privateResult.data ?? []);
      setActivated(activatedResult.data ?? []);
      if (privateResult.error) toast.error(privateResult.error);
      if (activatedResult.error) toast.error(activatedResult.error);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (selectedFlags[activeIndex]) {
      setSuggestions([]);
      return;
    }
    const query = (codes[activeIndex] ?? "").trim();
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
  }, [codes, activeIndex, open, selectedFlags]);

  async function submitCodes() {
    const unique = [
      ...new Set(
        codes.map((item) => item.trim().toUpperCase()).filter(Boolean),
      ),
    ];
    if (unique.length === 0) {
      toast.error("Enter at least one public access key.");
      return;
    }
    setBusy(true);
    for (const code of unique) {
      const result = await activatePublicUniversalAccessKey(code);
      if (result.error) {
        setBusy(false);
        toast.error(result.error);
        return;
      }
    }
    setBusy(false);
    setCodes([""]);
    setSelectedFlags([false]);
    setSuggestions([]);
    toast.success("Access keys applied.");
    onActivated?.();
    const activatedResult = await listActivatedUniversalAccessKeys();
    setActivated(activatedResult.data ?? []);
  }

  async function togglePrivate(item: UniversalAccessKeyRow) {
    const next = item.selected === false;
    setPrivateBusyId(item.credential_id);
    const result = await setPrivateUniversalAccessKeySelected(
      item.credential_id,
      next,
    );
    setPrivateBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPrivateKeys((prev) =>
      prev.map((row) =>
        row.credential_id === item.credential_id
          ? { ...row, selected: next }
          : row,
      ),
    );
    onActivated?.();
    toast.success(next ? "Access key selected." : "Access key removed.");
  }

  async function removeActivated(credentialId: number) {
    const result = await deactivatePublicUniversalAccessKey(credentialId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setActivated((prev) =>
      prev.filter((item) => item.credential_id !== credentialId),
    );
    onActivated?.();
    toast.success("Access key removed.");
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
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <KeyRound size={16} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: "800" }}>
                Universal access keys
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
            {loading ? <ActivityIndicator color={colors.accent} /> : null}

            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                Public access keys
              </Text>
              {codes.map((code, index) => {
                const status = fieldStatus(index);
                const showMenu =
                  status === "inputting" &&
                  index === activeIndex &&
                  suggestions.length > 0;
                const borderColor =
                  status === "selected"
                    ? "#16A34A"
                    : status === "inputting"
                      ? colors.accent
                      : colors.border;
                return (
                  <View
                    key={`code-${index}`}
                    style={{ zIndex: showMenu ? 20 : 1 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor,
                          borderRadius: 12,
                          backgroundColor:
                            status === "selected"
                              ? "rgba(22,163,74,0.06)"
                              : "#fff",
                          paddingHorizontal: 10,
                          minHeight: 44,
                        }}
                      >
                        {status === "selected" ? (
                          <Check size={15} color="#16A34A" />
                        ) : (
                          <Search
                            size={15}
                            color={
                              status === "inputting"
                                ? colors.accent
                                : colors.textMuted
                            }
                          />
                        )}
                        <TextInput
                          value={code}
                          onFocus={() => setActiveIndex(index)}
                          onChangeText={(value) => {
                            const next = [...codes];
                            next[index] = value;
                            setCodes(next);
                            setSelectedFlags((prev) => {
                              const flags = [...prev];
                              flags[index] = false;
                              return flags;
                            });
                            setActiveIndex(index);
                          }}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          placeholder="Search public key…"
                          placeholderTextColor={colors.textMuted}
                          style={{
                            flex: 1,
                            paddingHorizontal: 8,
                            paddingVertical: 10,
                            color: colors.text,
                            fontFamily: "monospace",
                            fontSize: 13,
                          }}
                        />
                        {status === "selected" ? (
                          <Text
                            style={{
                              color: "#16A34A",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            Selected
                          </Text>
                        ) : (
                          <ChevronDown
                            size={16}
                            color={
                              status === "inputting"
                                ? colors.accent
                                : colors.textMuted
                            }
                          />
                        )}
                      </View>
                      {index > 0 ? (
                        <Pressable
                          onPress={() => {
                            setCodes((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                            setSelectedFlags((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                            setActiveIndex((current) =>
                              current >= index
                                ? Math.max(0, current - 1)
                                : current,
                            );
                            setSuggestions([]);
                          }}
                          accessibilityLabel="Remove key"
                          hitSlop={8}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.bgSurface,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <X size={14} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                    {showMenu ? (
                      <View
                        style={{
                          marginTop: 6,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: "#fff",
                          overflow: "hidden",
                          shadowColor: "#0F2C5C",
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.12,
                          shadowRadius: 16,
                          elevation: 6,
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: colors.bgSurface,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                              letterSpacing: 0.4,
                            }}
                          >
                            {suggestions.length} match
                            {suggestions.length === 1 ? "" : "es"}
                          </Text>
                        </View>
                        {suggestions.map((item, suggestionIndex) => {
                          const zoneLabel =
                            (item.zones ?? [])
                              .map((zone) => zone.name)
                              .join(", ") || "Shared zones";
                          const isLast =
                            suggestionIndex === suggestions.length - 1;
                          return (
                            <Pressable
                              key={item.credential_id}
                              onPress={() => {
                                const next = [...codes];
                                next[index] = item.code;
                                setCodes(next);
                                setSelectedFlags((prev) => {
                                  const flags = [...prev];
                                  flags[index] = true;
                                  return flags;
                                });
                                setSuggestions([]);
                              }}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 4,
                                backgroundColor: "#fff",
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.text,
                                  fontFamily: "monospace",
                                  fontSize: 13,
                                  fontWeight: "700",
                                }}
                              >
                                {item.code}
                              </Text>
                              <Text
                                style={{
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  marginTop: 4,
                                }}
                                numberOfLines={1}
                              >
                                {zoneLabel}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <Pressable
                onPress={() => {
                  setCodes((prev) => [...prev, ""]);
                  setSelectedFlags((prev) => [...prev, false]);
                }}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 2,
                }}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  + Add another key
                </Text>
              </Pressable>
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
                Your private keys
              </Text>
              {privateKeys.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  No private keys yet.
                </Text>
              ) : (
                privateKeys.map((item) => {
                  const selected = item.selected !== false;
                  const rowBusy = privateBusyId === item.credential_id;
                  return (
                    <View
                      key={item.credential_id}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? colors.success : colors.border,
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
                          accessibilityState={{ selected, disabled: rowBusy }}
                          disabled={rowBusy}
                          onPress={() => void togglePrivate(item)}
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            opacity: rowBusy ? 0.6 : 1,
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
                              color: selected ? colors.success : colors.accent,
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            {rowBusy
                              ? "Saving…"
                              : selected
                                ? "Selected"
                                : "Select"}
                          </Text>
                        </Pressable>
                        <CopyKeyButton code={item.code} />
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {(item.zones ?? []).map((zone) => zone.name).join(", ") ||
                          "Zones"}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {activated.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                  }}
                >
                  Activated public keys
                </Text>
                {activated.map((item) => (
                  <View
                    key={item.credential_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "monospace",
                        flexShrink: 1,
                      }}
                    >
                      {item.code}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <CopyKeyButton code={item.code} />
                      <Pressable
                        onPress={() => void removeActivated(item.credential_id)}
                        accessibilityLabel="Remove activated key"
                        hitSlop={8}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.bgSurface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <X size={14} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

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
                  label={busy ? "Applying…" : "Apply keys"}
                  size="sm"
                  fullWidth
                  disabled={busy}
                  onPress={() => void submitCodes()}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
