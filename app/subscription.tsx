import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { useAuth } from "@/context/AuthContext";
import {
  confirmSubscriptionCheckout,
  type ConfirmCheckoutResult,
} from "@/api/subscription";
import { colors } from "@/theme/colors";

type Phase = "loading" | "success" | "failed" | "cancelled";

export default function SubscriptionResultScreen() {
  const router = useRouter();
  const { refreshUser, token } = useAuth();
  const params = useLocalSearchParams<{
    checkout?: string | string[];
    session_id?: string | string[];
    sessionId?: string | string[];
  }>();

  const checkout = useMemo(() => {
    const raw = params.checkout;
    return String(Array.isArray(raw) ? raw[0] : raw || "")
      .trim()
      .toLowerCase();
  }, [params.checkout]);

  const sessionId = useMemo(() => {
    const raw = params.session_id ?? params.sessionId;
    return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  }, [params.session_id, params.sessionId]);

  const [phase, setPhase] = useState<Phase>(
    checkout === "cancel" || checkout === "cancelled" ? "cancelled" : "loading",
  );
  const [result, setResult] = useState<ConfirmCheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runConfirm = useCallback(async () => {
    if (checkout === "cancel" || checkout === "cancelled") {
      setPhase("cancelled");
      return;
    }
    if (!token) {
      setError("Sign in again to finish activating your subscription.");
      setPhase("failed");
      return;
    }
    if (!sessionId) {
      setError("Missing Checkout session. Open Subscription and try again.");
      setPhase("failed");
      return;
    }
    setPhase("loading");
    setError(null);
    const res = await confirmSubscriptionCheckout(sessionId);
    if (res.error || !res.data) {
      setError(res.error || "Could not confirm payment.");
      setPhase("failed");
      return;
    }
    setResult(res.data);
    if (res.data.ok) {
      await refreshUser();
      setPhase("success");
    } else {
      setError(res.data.message || "Payment was not completed.");
      setPhase("failed");
    }
  }, [checkout, refreshUser, sessionId, token]);

  useEffect(() => {
    void runConfirm();
  }, [runConfirm]);

  const title =
    phase === "success"
      ? "Subscription successful"
      : phase === "cancelled"
        ? "Checkout cancelled"
        : phase === "failed"
          ? "Subscription failed"
          : "Confirming payment…";

  const subtitle =
    phase === "success"
      ? `Your account is now ${result?.plan?.label || "updated"}. Account type and role were applied automatically.`
      : phase === "cancelled"
        ? "No charge was made. You can upgrade again anytime from User settings."
        : phase === "failed"
          ? error || "Something went wrong while activating your plan."
          : "Please wait while we verify your Stripe payment and update your account.";

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            justifyContent: "center",
            gap: 16,
          }}
        >
          <Card style={{ gap: 14 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 22,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 14,
                lineHeight: 20,
                textAlign: "center",
              }}
            >
              {subtitle}
            </Text>

            {phase === "loading" ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
            ) : null}

            {phase === "success" && result ? (
              <View
                style={{
                  marginTop: 4,
                  borderRadius: 12,
                  backgroundColor: colors.bgSurface,
                  padding: 12,
                  gap: 4,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {result.plan.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Account type: {result.account_type}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Role: {result.role}
                </Text>
                {result.tier_level != null ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Organization level: {result.tier_level}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {phase === "loading" ? null : (
              <View style={{ gap: 10, marginTop: 8 }}>
                {phase === "failed" ? (
                  <Button
                    label="Try again"
                    onPress={() => void runConfirm()}
                    fullWidth
                  />
                ) : null}
                <Button
                  label="Back to User settings"
                  variant={phase === "success" ? "primary" : "secondary"}
                  onPress={() => router.replace("/(tabs)/user-settings")}
                  fullWidth
                />
                <Button
                  label="Go home"
                  variant="ghost"
                  onPress={() => router.replace("/(tabs)")}
                  fullWidth
                />
              </View>
            )}
          </Card>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}
