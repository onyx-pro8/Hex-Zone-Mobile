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
import { KeyRound, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import {
  activatePublicUniversalAccessKey,
  listActivatedUniversalAccessKeys,
  listPrivateUniversalAccessKeys,
  searchPublicUniversalAccessKeys,
  type UniversalAccessKeyRow,
} from "@/api/universalAccess";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

type Props = {
  open: boolean;
  onClose: () => void;
  onActivated?: () => void;
};

export function UniversalAccessKeyModal({ open, onClose, onActivated }: Props) {
  const [codes, setCodes] = useState<string[]>([""]);
  const [privateKeys, setPrivateKeys] = useState<UniversalAccessKeyRow[]>([]);
  const [activated, setActivated] = useState<UniversalAccessKeyRow[]>([]);
  const [suggestions, setSuggestions] = useState<UniversalAccessKeyRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [codes, activeIndex, open]);

  async function submitCodes() {
    const unique = [
      ...new Set(
        codes
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
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
    toast.success("Access keys applied.");
    onActivated?.();
    const activatedResult = await listActivatedUniversalAccessKeys();
    setActivated(activatedResult.data ?? []);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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

            <View style={{ gap: 8 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Public access keys
              </Text>
              {codes.map((code, index) => (
                <View key={`code-${index}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={code}
                      onFocus={() => setActiveIndex(index)}
                      onChangeText={(value) => {
                        const next = [...codes];
                        next[index] = value;
                        setCodes(next);
                        setActiveIndex(index);
                      }}
                      autoCapitalize="characters"
                      placeholder="UAC-XXXX-XXXX"
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.text,
                        fontFamily: "monospace",
                      }}
                    />
                    {index > 0 ? (
                      <Pressable
                        onPress={() => {
                          setCodes((prev) => prev.filter((_, i) => i !== index));
                          setActiveIndex((current) =>
                            current >= index ? Math.max(0, current - 1) : current,
                          );
                          setSuggestions([]);
                        }}
                        accessibilityLabel="Remove key"
                        hitSlop={8}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
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
                  {index === activeIndex
                    ? suggestions.map((item) => (
                        <Pressable
                          key={item.credential_id}
                          onPress={() => {
                            const next = [...codes];
                            next[index] = item.code;
                            setCodes(next);
                            setSuggestions([]);
                          }}
                          style={{
                            paddingVertical: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          }}
                        >
                          <Text style={{ color: colors.text, fontFamily: "monospace" }}>
                            {item.code}
                          </Text>
                        </Pressable>
                      ))
                    : null}
                </View>
              ))}
              <Pressable onPress={() => setCodes((prev) => [...prev, ""])}>
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>
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
                privateKeys.map((item) => (
                  <View
                    key={item.credential_id}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontFamily: "monospace" }}>
                      {item.code}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {(item.zones ?? []).map((zone) => zone.name).join(", ") || "Zones"}
                    </Text>
                  </View>
                ))
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
                  <Text
                    key={item.credential_id}
                    style={{ color: colors.text, fontFamily: "monospace" }}
                  >
                    {item.code}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Close" size="sm" fullWidth variant="outline" onPress={onClose} />
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
