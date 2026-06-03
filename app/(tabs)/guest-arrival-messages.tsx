/**
 * Admin screen: configure the two phrases a guest sees on arrival.
 *
 * Mirrors the web app's `GuestArrivalMessagesAdmin.tsx`:
 *   - "Expected (on schedule)"     → expected_arrival_message
 *   - "Unexpected (waiting copy)"  → unexpected_arrival_message
 *
 * Reached from the Access tab. Admin only. Leaving a field blank reverts that
 * phrase to the server default for new arrivals.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageSquareText, RefreshCw } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { useGuestManagementBack } from "@/hooks/useGuestManagementBack";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  GUEST_ARRIVAL_MESSAGE_MAX_LEN,
  getGuestArrivalMessages,
  normalizeGuestArrivalMessageField,
  updateGuestArrivalMessages,
  type GuestArrivalMessages,
} from "@/api/guestArrivalMessages";
import { colors } from "@/theme/colors";

const labelStyle = {
  color: colors.textMuted,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase" as const,
  fontWeight: "700" as const,
  marginBottom: 6,
};

function inputStyle() {
  return {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top" as const,
  } as const;
}

export default function GuestArrivalMessagesScreen() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const guestMgmtBack = useGuestManagementBack();
  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    guestMgmtBack();
  }, [router, guestMgmtBack]);
  const {
    effectiveZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<GuestArrivalMessages | null>(null);

  const [expected, setExpected] = useState("");
  const [unexpected, setUnexpected] = useState("");

  const load = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await getGuestArrivalMessages(effectiveZoneId);
    if (!result.ok) {
      setError(result.message);
      setData(null);
    } else {
      setData(result.data);
      setExpected(result.data.expected_arrival_message ?? "");
      setUnexpected(result.data.unexpected_arrival_message ?? "");
    }
    setLoading(false);
  }, [effectiveZoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!effectiveZoneId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateGuestArrivalMessages(effectiveZoneId, {
        expected_arrival_message: normalizeGuestArrivalMessageField(expected),
        unexpected_arrival_message:
          normalizeGuestArrivalMessageField(unexpected),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
      setExpected(result.data.expected_arrival_message ?? "");
      setUnexpected(result.data.unexpected_arrival_message ?? "");
      setNotice("Saved. New guest arrivals will see these messages.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }, [effectiveZoneId, expected, unexpected]);

  const onReset = useCallback(async () => {
    if (!effectiveZoneId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateGuestArrivalMessages(effectiveZoneId, {
        expected_arrival_message: null,
        unexpected_arrival_message: null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
      setExpected("");
      setUnexpected("");
      setNotice("Reset to the default wording.");
    } finally {
      setSaving(false);
    }
  }, [effectiveZoneId]);

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScreenHeader
            title="Arrival messages"
            subtitle={
              effectiveZoneId
                ? `What guests see on check-in · ${effectiveZoneId}`
                : "What guests see on check-in"
            }
            showBack
            onBack={onBack}
          />

          {!effectiveZoneId ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Card>
                {zonesLoading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator color={colors.accent} />
                    <Text style={{ color: colors.textMuted }}>
                      Looking up your zones…
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted }}>
                    {isAdmin
                      ? "No zones are linked to this account yet. Create a zone from the Dashboard, then come back here."
                      : "Your account is not linked to a zone yet."}
                  </Text>
                )}
              </Card>
            </View>
          ) : !isAdmin ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Card>
                <Text style={{ color: colors.textMuted }}>
                  Only zone administrators can edit guest arrival messages.
                </Text>
              </Card>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={() => void load()}
                  tintColor={colors.accent}
                />
              }
            >
              {showZonePicker ? (
                <Card style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={labelStyle}>Zone</Text>
                    <Pressable onPress={() => void refreshZones()} hitSlop={8}>
                      <RefreshCw size={14} color={colors.accent} />
                    </Pressable>
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {candidateZoneIds.map((zid) => (
                      <Pressable key={zid} onPress={() => setPickedZoneId(zid)}>
                        <Chip label={zid} active={zid === effectiveZoneId} />
                      </Pressable>
                    ))}
                  </View>
                </Card>
              ) : null}

              <Card style={{ gap: 10 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <MessageSquareText size={18} color={colors.accent} />
                  <Text
                    style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}
                  >
                    Guest check-in wording
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                  These messages are shown to a guest right after they request
                  access. Leave a field blank to use the default. Changes only
                  affect guests who arrive after you save.
                </Text>
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={labelStyle}>Expected guest (on schedule)</Text>
                <TextInput
                  value={expected}
                  onChangeText={setExpected}
                  placeholder={
                    data?.defaults.expected_arrival_message ??
                    "You are expected. Please proceed."
                  }
                  placeholderTextColor={colors.textDim}
                  multiline
                  maxLength={GUEST_ARRIVAL_MESSAGE_MAX_LEN}
                  style={inputStyle()}
                />
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  Shown when the guest matches a schedule or guest pass.
                </Text>
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={labelStyle}>
                  Unexpected guest (waiting for approval)
                </Text>
                <TextInput
                  value={unexpected}
                  onChangeText={setUnexpected}
                  placeholder={
                    data?.defaults.unexpected_arrival_message ??
                    "You are not scheduled. Please wait for approval."
                  }
                  placeholderTextColor={colors.textDim}
                  multiline
                  maxLength={GUEST_ARRIVAL_MESSAGE_MAX_LEN}
                  style={inputStyle()}
                />
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  Shown to walk-in guests while an admin reviews the request.
                </Text>
              </Card>

              {error ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
              ) : null}
              {notice ? (
                <Text style={{ color: colors.success, fontSize: 12 }}>
                  {notice}
                </Text>
              ) : null}

              <Button
                label={saving ? "Saving…" : "Save messages"}
                onPress={() => void onSave()}
                loading={saving}
                disabled={loading}
                fullWidth
              />
              <Button
                label="Reset to defaults"
                variant="outline"
                onPress={() => void onReset()}
                disabled={saving || loading}
                fullWidth
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
