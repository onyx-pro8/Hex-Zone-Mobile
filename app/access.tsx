/**
 * Public guest access landing.
 *
 * Reached via QR scan: `zoneweaver:///access?gt=<guest-qr-token>&zid=<zone-id>`.
 * Mirrors the web flow in `Hex-Zone-Client/src/pages/GuestAccess.tsx`:
 *   1. Form → POST /api/access/permission (anonymous)
 *   2. EXPECTED      → immediately approved (came from a guest schedule)
 *   3. UNEXPECTED    → poll GET /api/access/session/{guest_id} until APPROVED/REJECTED
 *   4. APPROVED + exchange_code → POST /api/access/guest-session → guest token
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle, Loader2, MapPin, QrCode, ShieldAlert, X } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  exchangeGuestSession,
  pollGuestAccessSession,
  submitAnonymousGuestPermission,
} from "@/api/guestPublic";
import { getOrCreateDeviceHid, setStoredGuestSession } from "@/lib/storage";
import { readDeviceLocation } from "@/lib/expoLocation";
import { colors } from "@/theme/colors";

type Phase =
  | { id: "form" }
  | {
      id: "waiting";
      guestId: string;
      pollZoneId: string;
      serverMessage: string;
      pollMessage?: string;
    }
  | {
      id: "approved";
      guestId: string;
      pollZoneId: string;
      message?: string;
      exchange_code?: string;
      exchange_expires_at?: string;
      pollMessage?: string;
    }
  | { id: "rejected"; message?: string };

const POLL_MS = 3500;

const inputStyle = {
  backgroundColor: colors.bgCard,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: colors.text,
  fontSize: 14,
} as const;

const labelStyle = {
  color: colors.textMuted,
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase" as const,
  fontWeight: "700" as const,
  marginBottom: 6,
};

export default function GuestAccessScreen() {
  const router = useRouter();
  const { token: memberToken } = useAuth();
  const params = useLocalSearchParams<{
    gt?: string;
    zid?: string;
    nid?: string;
    eid?: string;
    sig?: string;
  }>();

  const gt = String(params.gt ?? "").trim();
  const zid = String(params.zid ?? "").trim();
  const nid = String(params.nid ?? "").trim();
  const eidFromQuery = String(params.eid ?? "").trim();
  const sigFromQuery = String(params.sig ?? "").trim();
  const hasInvite = Boolean(gt || zid || nid);

  const [guestName, setGuestName] = useState("");
  const [eventId, setEventId] = useState(eidFromQuery);
  const [position, setPosition] = useState<
    { lat: number; lng: number } | null
  >(null);
  const [locating, setLocating] = useState(false);

  const [phase, setPhase] = useState<Phase>({ id: "form" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setEventId(eidFromQuery);
  }, [eidFromQuery]);

  const captureLocation = useCallback(async () => {
    setLocating(true);
    setFormError(null);
    try {
      const result = await readDeviceLocation({ timeoutMs: 10000 });
      if (!result) {
        setFormError(
          "Could not read your location. You can still continue without it.",
        );
        return;
      }
      setPosition({
        lat: result.coords.latitude,
        lng: result.coords.longitude,
      });
    } catch {
      setFormError("Could not read your location. You can still continue.");
    } finally {
      setLocating(false);
    }
  }, []);

  const runExchange = useCallback(
    async (
      guestId: string,
      pollZoneId: string,
      exchangeCode: string,
    ): Promise<boolean> => {
      const gid = guestId.trim();
      const zone = pollZoneId.trim();
      const code = exchangeCode.trim();
      if (!gid || !zone || !code) return false;
      setExchangeBusy(true);
      setExchangeError(null);
      try {
        const hid = await getOrCreateDeviceHid();
        const ex = await exchangeGuestSession({
          guest_id: gid,
          zone_id: zone,
          exchange_code: code,
          device_id: hid,
        });
        if (ex.error || !ex.data) {
          setExchangeError(ex.error ?? "Could not start guest session.");
          return false;
        }
        // Prefer the zone used at check-in when it appears in the guest's
        // zone list (matches web persistGuestSessionAfterExchange).
        const zoneIds = ex.data.guest.zone_ids?.length
          ? ex.data.guest.zone_ids
          : [];
        const pollZone = zone.trim();
        const primaryZone =
          zoneIds.find((z) => z === pollZone) ?? (pollZone || zoneIds[0] || "");
        const resolvedZoneIds = zoneIds.length
          ? zoneIds
          : primaryZone
            ? [primaryZone]
            : [];
        const allowed = ex.data.guest.allowed_message_types?.length
          ? ex.data.guest.allowed_message_types
          : ["CHAT"];
        const network_geo_messaging = allowed.some((t) =>
          ["PANIC", "NS_PANIC", "NS-PANIC", "PA", "SERVICE", "UNKNOWN", "PRIVATE"].includes(
            String(t).trim().toUpperCase(),
          ),
        );
        await setStoredGuestSession({
          access_token: ex.data.access_token,
          guest_id: ex.data.guest.guest_id,
          display_name: ex.data.guest.display_name,
          zone_id: primaryZone,
          zone_ids: resolvedZoneIds,
          allowed_message_types: allowed,
          ...(network_geo_messaging ? { network_geo_messaging: true } : {}),
          saved_at: Date.now(),
        });
        return true;
      } finally {
        setExchangeBusy(false);
      }
    },
    [],
  );

  /* Poll session while waiting for approval (and while awaiting exchange_code). */
  useEffect(() => {
    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const shouldPoll =
      phase.id === "waiting" ||
      (phase.id === "approved" && !phase.exchange_code?.trim());
    if (!shouldPoll) {
      stopPolling();
      return;
    }

    const guestId =
      phase.id === "waiting" || phase.id === "approved"
        ? phase.guestId.trim()
        : "";
    const pollZoneId =
      phase.id === "waiting" || phase.id === "approved"
        ? phase.pollZoneId.trim()
        : "";
    if (!guestId) return;

    let cancelled = false;
    const tick = async () => {
      const res = await pollGuestAccessSession(guestId, pollZoneId);
      if (cancelled) return;
      if (res.error) {
        setPhase((current) => {
          if (current.id === "waiting") {
            return { ...current, pollMessage: res.error ?? undefined };
          }
          if (current.id === "approved" && !current.exchange_code) {
            return { ...current, pollMessage: res.error ?? undefined };
          }
          return current;
        });
        return;
      }
      if (res.status === "APPROVED") {
        setPhase((current) => {
          if (current.id === "waiting") {
            return {
              id: "approved",
              guestId: current.guestId,
              pollZoneId: current.pollZoneId,
              ...(res.message ? { message: res.message } : {}),
              ...(res.exchange_code
                ? { exchange_code: res.exchange_code }
                : {}),
              ...(res.exchange_expires_at
                ? { exchange_expires_at: res.exchange_expires_at }
                : {}),
            };
          }
          if (
            current.id === "approved" &&
            !current.exchange_code &&
            res.exchange_code
          ) {
            return {
              ...current,
              exchange_code: res.exchange_code,
              ...(res.exchange_expires_at
                ? { exchange_expires_at: res.exchange_expires_at }
                : {}),
            };
          }
          return current;
        });
        return;
      }
      if (res.status === "REJECTED") {
        setPhase({
          id: "rejected",
          ...(res.message ? { message: res.message } : {}),
        });
        return;
      }
      if (res.message) {
        setPhase((current) => {
          if (current.id === "waiting") {
            return { ...current, pollMessage: res.message };
          }
          if (current.id === "approved" && !current.exchange_code) {
            return { ...current, pollMessage: res.message };
          }
          return current;
        });
      }
    };

    void tick();
    pollTimerRef.current = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [phase]);

  /* Once we have an exchange_code, auto-run the exchange and route to home. */
  useEffect(() => {
    if (phase.id !== "approved") return;
    const code = phase.exchange_code?.trim();
    if (!code) return;
    const gid = phase.guestId.trim();
    const zone = phase.pollZoneId.trim();
    if (!gid || !zone) return;
    let cancelled = false;
    void (async () => {
      const ok = await runExchange(gid, zone, code);
      if (cancelled) return;
      if (ok) {
        // Approved guests land on the guest dashboard (map + chat).
        router.replace("/guest/dashboard");
      } else {
        // Exchange failed — fall back to welcome / tabs.
        router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, runExchange, router, memberToken]);

  const reset = () => {
    setPhase({ id: "form" });
    setFormError(null);
    setExchangeError(null);
  };

  const submit = async () => {
    if (!gt && !zid && !nid) {
      setFormError("This link is missing a guest token or network id.");
      return;
    }
    const name = guestName.trim();
    if (!name) {
      setFormError("Please enter your name.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const hid = await getOrCreateDeviceHid();
      const body: Parameters<typeof submitAnonymousGuestPermission>[0] = {
        guest_name: name,
        device_id: hid,
        ...(gt ? { guest_qr_token: gt } : {}),
        ...(zid ? { zone_id: zid } : {}),
        ...(nid ? { network_id: nid } : {}),
        ...(eventId.trim() ? { event_id: eventId.trim() } : {}),
        ...(position
          ? { location: { lat: position.lat, lng: position.lng } }
          : {}),
        ...(sigFromQuery ? { sig: sigFromQuery } : {}),
      };
      const result = await submitAnonymousGuestPermission(body);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      const pollZoneId = (result.zoneId ?? zid ?? nid).trim();
      const guestId = (result.guestId ?? "").trim();

      if (result.status === "EXPECTED") {
        if (guestId && pollZoneId) {
          setPhase({
            id: "approved",
            guestId,
            pollZoneId,
            message: result.message || "You are expected — access granted.",
            ...(result.exchange_code?.trim()
              ? { exchange_code: result.exchange_code.trim() }
              : {}),
            ...(result.exchange_expires_at?.trim()
              ? { exchange_expires_at: result.exchange_expires_at.trim() }
              : {}),
          });
        } else {
          // Server confirms expected but didn't return a guest session id.
          setPhase({
            id: "approved",
            guestId: "",
            pollZoneId: pollZoneId || zid,
            message:
              result.message ||
              "You are expected. Please wait for the host to greet you.",
          });
        }
        return;
      }

      if (!guestId) {
        setFormError(
          "Your request was received but the server did not return a session id. Please contact your host.",
        );
        return;
      }
      setPhase({
        id: "waiting",
        guestId,
        pollZoneId,
        serverMessage: result.message || "Waiting for approval…",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasInvite) {
    return (
      <GradientBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScreenHeader title="Guest access" subtitle="Scanned from QR" />
          <View style={{ paddingHorizontal: 20 }}>
            <Card glow style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <QrCode size={20} color={colors.accent} />
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Invalid link
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                Ask your host for a guest link that includes an invitation
                token or a network id.
              </Text>
              <Button
                label={memberToken ? "Back to dashboard" : "Back to welcome"}
                variant="outline"
                onPress={() =>
                  router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome")
                }
                fullWidth
              />
            </Card>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <ScreenHeader
              title="Guest access"
              subtitle={
                gt && zid
                  ? "Invitation link"
                  : gt
                    ? "Invitation link"
                    : "Zone check-in"
              }
            />

            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              {zid ? (
                <Card style={{ flexDirection: "row", gap: 10 }}>
                  <QrCode size={16} color={colors.accent} />
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    Zone{"  "}
                    <Text
                      style={{
                        color: colors.accent,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      {zid}
                    </Text>
                  </Text>
                </Card>
              ) : null}

              {phase.id === "form" ? (
                <Card style={{ gap: 12 }}>
                  <View>
                    <Text style={labelStyle}>Your name (required)</Text>
                    <TextInput
                      value={guestName}
                      onChangeText={setGuestName}
                      placeholder="Your full name"
                      placeholderTextColor={colors.textDim}
                      autoComplete="name"
                      style={inputStyle}
                    />
                  </View>

                  <View>
                    <Text style={labelStyle}>Event id (optional)</Text>
                    <TextInput
                      value={eventId}
                      onChangeText={setEventId}
                      editable={!eidFromQuery}
                      placeholder={
                        eidFromQuery ? "Set from link" : "e.g. EVT-2026-GALA"
                      }
                      placeholderTextColor={colors.textDim}
                      style={{
                        ...inputStyle,
                        opacity: eidFromQuery ? 0.7 : 1,
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={labelStyle}>Location (optional)</Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontFamily:
                            Platform.OS === "ios" ? "Menlo" : "monospace",
                          fontSize: 12,
                        }}
                      >
                        {position
                          ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                          : "No location sent"}
                      </Text>
                    </View>
                    <Button
                      label={locating ? "Reading…" : "Use location"}
                      size="sm"
                      variant="outline"
                      onPress={() => void captureLocation()}
                      disabled={locating}
                      leftIcon={
                        locating ? (
                          <Loader2 size={14} color={colors.accent} />
                        ) : (
                          <MapPin size={14} color={colors.accent} />
                        )
                      }
                    />
                  </View>

                  {formError ? (
                    <Text style={{ color: colors.danger, fontSize: 12 }}>
                      {formError}
                    </Text>
                  ) : null}

                  <Button
                    label={submitting ? "Submitting…" : "Request access"}
                    onPress={() => void submit()}
                    loading={submitting}
                    fullWidth
                  />
                </Card>
              ) : null}

              {phase.id === "waiting" ? (
                <Card glow style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ShieldAlert size={20} color={colors.warning} />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      Waiting for approval
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {phase.serverMessage}
                  </Text>
                  {phase.pollMessage &&
                  phase.pollMessage !== phase.serverMessage ? (
                    <Text style={{ color: colors.textDim, fontSize: 12 }}>
                      {phase.pollMessage}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ActivityIndicator color={colors.accent} size="small" />
                    <Text
                      style={{ color: colors.textDim, fontSize: 12 }}
                    >
                      Checking status…
                    </Text>
                  </View>
                  <Text
                    selectable
                    style={{
                      color: colors.textDim,
                      fontSize: 10,
                      fontFamily:
                        Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    Ref: {phase.guestId}
                  </Text>
                  <Pressable onPress={reset}>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        textDecorationLine: "underline",
                      }}
                    >
                      Cancel and start over
                    </Text>
                  </Pressable>
                </Card>
              ) : null}

              {phase.id === "approved" ? (
                <Card glow style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <CheckCircle size={20} color={colors.success} />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      Approved
                    </Text>
                  </View>
                  {phase.message ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {phase.message}
                    </Text>
                  ) : null}
                  {!phase.exchange_code ? (
                    <Text style={{ color: colors.textDim, fontSize: 12 }}>
                      Finishing sign-in…
                    </Text>
                  ) : exchangeBusy ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <ActivityIndicator color={colors.accent} size="small" />
                      <Text
                        style={{ color: colors.textDim, fontSize: 12 }}
                      >
                        Opening guest session…
                      </Text>
                    </View>
                  ) : null}
                  {exchangeError ? (
                    <Text style={{ color: colors.danger, fontSize: 12 }}>
                      {exchangeError}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              {phase.id === "rejected" ? (
                <Card glow style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <X size={20} color={colors.danger} />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      Not approved
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {phase.message ?? "Your request was declined."}
                  </Text>
                  <Button
                    label="Try again"
                    variant="outline"
                    onPress={reset}
                    fullWidth
                  />
                </Card>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
