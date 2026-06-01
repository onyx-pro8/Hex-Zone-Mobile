import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail, QrCode } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

export default function JoinScreen() {
  const router = useRouter();
  const { token: authToken, initializing, logout } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  const inviteToken = useMemo(() => {
    const raw = Array.isArray(params.token) ? params.token[0] : params.token;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.token]);

  useEffect(() => {
    if (initializing) return;
    if (!inviteToken) {
      router.replace(authToken ? "/(tabs)" : "/(auth)/welcome");
    }
  }, [initializing, inviteToken, authToken, router]);

  const onContinue = async () => {
    if (authToken) {
      await logout();
    }
    router.replace({
      pathname: "/(auth)/signup",
      params: { invite_token: inviteToken },
    });
  };

  if (initializing || !inviteToken) {
    return (
      <GradientBackground>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.accent} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Member invite" subtitle="Scanned from QR" />
        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 8 }}>
          <Card glow style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <QrCode size={20} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
                Invite token detected
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
              You scanned a single-use member invite. Continue to create your
              account; the invite token will be applied automatically.
            </Text>
            <View
              style={{
                marginTop: 4,
                padding: 10,
                borderRadius: 10,
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                selectable
                style={{
                  color: colors.accent,
                  fontFamily: "Menlo",
                  fontSize: 12,
                }}
              >
                {inviteToken}
              </Text>
            </View>
          </Card>

          <Button
            label={authToken ? "Sign out & continue" : "Continue to signup"}
            onPress={() => void onContinue()}
            leftIcon={<Mail size={16} color="#fff" />}
            fullWidth
            size="lg"
          />

          <Pressable onPress={() => router.replace("/(auth)/welcome")}>
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                fontSize: 13,
                marginTop: 6,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}
