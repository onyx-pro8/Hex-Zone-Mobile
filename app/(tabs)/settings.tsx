import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  BellRing,
  CalendarRange,
  LogOut,
  MessageSquareText,
  Shield,
  Smartphone,
  Ticket,
  User,
  UserCheck,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { API_BASE_URL } from "@/api/client";
import { sendTestPush } from "@/api/devices";
import {
  getNotificationPermissionStatus,
  registerForPushNotificationsAsync,
} from "@/lib/notifications";
import type { PushDeliveryError } from "@/api/devices";
import { colors } from "@/theme/colors";

const KILLED_APP_DELAY_SECONDS = 10;

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 10,
          opacity: onPress ? 1 : 0.95,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.bgSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const { pushToken, permissionError } = useNotifications();
  const [testingPush, setTestingPush] = useState<"none" | "now" | "delayed">(
    "none",
  );
  const [osNotificationsGranted, setOsNotificationsGranted] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    void getNotificationPermissionStatus().then(({ granted }) => {
      setOsNotificationsGranted(granted);
    });
  }, [pushToken]);

  // Recover a missing email (e.g. when the login payload was thin) by
  // re-fetching the profile when the screen opens without one.
  useEffect(() => {
    if (user && !(typeof user.email === "string" && user.email.trim())) {
      void refreshUser();
    }
    // Only react to identity / email changes, not every render.
  }, [user?.id, user?.email, refreshUser]);

  const isAdmin = (() => {
    const role = String(user?.role ?? "").toLowerCase();
    if (role) return role !== "user";
    const regType = String(
      user?.registrationType ?? user?.registration_type ?? "",
    ).toUpperCase();
    return regType !== "USER";
  })();

  const onLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void logout().then(() => router.replace("/(auth)/welcome"));
        },
      },
    ]);
  };

  const retryPush = async () => {
    const result = await registerForPushNotificationsAsync();
    Alert.alert(
      result.token ? "Push enabled" : "Push unavailable",
      result.token
        ? "This device is registered for message notifications."
        : result.error ?? "Could not register for push notifications.",
    );
  };

  // Diagnostic: trigger a self-test push from the server. Two variants help
  // isolate where delivery actually breaks:
  //   - "now": expect the foreground notification handler to fire — verifies
  //     the Expo → FCM → device path while the app is alive.
  //   - "delayed": server waits ~10s, so the user can close/kill the app and
  //     verify the system-tray notification appears with the app not running.
  const formatDeliveryErrors = (errors: PushDeliveryError[] | undefined) => {
    if (!errors?.length) return "";
    const first = errors[0];
    const code = first.error ?? first.message ?? "unknown";
    return ` Delivery error: ${code}.`;
  };

  const triggerTestPush = async (mode: "now" | "delayed") => {
    if (testingPush !== "none") return;
    const { granted } = await getNotificationPermissionStatus();
    setOsNotificationsGranted(granted);
    if (!granted) {
      Alert.alert(
        "Notifications blocked",
        "Android is not allowed to show notifications for Safe Zone Patrol. Open system Settings → Apps → Safe Zone Patrol → Notifications and enable them, then try again.",
      );
      return;
    }
    setTestingPush(mode);
    try {
      const delaySeconds = mode === "delayed" ? KILLED_APP_DELAY_SECONDS : 0;
      const result = await sendTestPush({ delaySeconds });
      if (result.error) throw new Error(result.error);
      const data = result.data ?? {};
      if (data.push_no_tokens || (data.tokens ?? 0) === 0) {
        Alert.alert(
          "No push tokens registered",
          "This account has no active push tokens on the server. Tap Push notifications above to re-register, then try again.",
        );
        return;
      }
      if (mode === "delayed") {
        Alert.alert(
          "Test push scheduled",
          `Server will send to ${data.tokens} token(s) in ${KILLED_APP_DELAY_SECONDS}s on channel "${data.channel_id ?? "default"}". Swipe the app away from recents (do not Force stop). If nothing appears, rebuild the installed APK after the latest app.json notification changes (eas build).`,
        );
        return;
      }
      const sent = data.push_sent ?? 0;
      const failed = data.push_failed ?? 0;
      const deliveryHint = formatDeliveryErrors(data.delivery_errors);
      if (sent > 0 && failed === 0) {
        Alert.alert(
          "Expo reports delivery OK",
          `Push reached Google/FCM for ${sent} device(s). If you still see nothing in the tray, open Android Settings → Apps → Safe Zone Patrol → Notifications and enable "Safe Zone Patrol" / pop on screen. After updating notification config, run a new EAS build and reinstall.${deliveryHint}`,
        );
        return;
      }
      Alert.alert(
        "Push delivery failed",
        `Tried ${data.tokens ?? 0} token(s); ${failed} failed.${deliveryHint} Check server logs for Expo push receipt errors.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not send a test push.";
      Alert.alert("Test push failed", msg);
    } finally {
      setTestingPush("none");
    }
  };

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <ScreenHeader title="Settings" subtitle="Account & preferences" />

          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Card glow>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.bgSurface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <User size={28} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 18,
                      fontWeight: "800",
                    }}
                  >
                    {user?.name ?? "Member"}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    {user?.email ?? "—"}
                  </Text>
                  <Chip
                    label={String(user?.role ?? "administrator")}
                    tone="muted"
                    style={{ marginTop: 8 }}
                  />
                </View>
              </View>
            </Card>
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {isAdmin ? (
              <>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    fontWeight: "700",
                    marginBottom: 8,
                  }}
                >
                  Guest management
                </Text>
                <SettingsRow
                  icon={<UserCheck size={20} color={colors.accent} />}
                  title="Guest list"
                  subtitle="Pending and recent guest arrivals"
                  onPress={() => router.push("/(tabs)/guest-list")}
                />
                <SettingsRow
                  icon={<CalendarRange size={20} color={colors.accent} />}
                  title="Guest schedules"
                  subtitle="Pre-approve expected guest windows"
                  onPress={() => router.push("/(tabs)/guest-schedules")}
                />
                <SettingsRow
                  icon={<Ticket size={20} color={colors.accent} />}
                  title="Guest passes"
                  subtitle="Pre-registered passes with event IDs"
                  onPress={() => router.push("/(tabs)/guest-passes")}
                />
                <SettingsRow
                  icon={<MessageSquareText size={20} color={colors.accent} />}
                  title="Arrival messages"
                  subtitle={
                    '"Expected" and "waiting for approval" wording for guests'
                  }
                  onPress={() =>
                    router.push("/(tabs)/guest-arrival-messages")
                  }
                />
              </>
            ) : null}

            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                fontWeight: "700",
                marginTop: isAdmin ? 16 : 0,
                marginBottom: 8,
              }}
            >
              Account
            </Text>
            <SettingsRow
              icon={<Bell size={20} color={colors.accent} />}
              title="Push notifications"
              subtitle={
                pushToken
                  ? osNotificationsGranted === false
                    ? "Token registered — system notifications are OFF"
                    : "Enabled — messages arrive as push alerts"
                  : permissionError ?? "Tap to enable notifications"
              }
              onPress={() => void retryPush()}
            />
            {pushToken ? (
              <Card
                style={{
                  marginBottom: 10,
                  paddingVertical: 12,
                  gap: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: colors.bgSurface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BellRing size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      Diagnose push delivery
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        marginTop: 3,
                      }}
                    >
                      "Test now" verifies foreground delivery. "Test killed
                      app" waits {KILLED_APP_DELAY_SECONDS}s so you can close
                      the app first.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button
                    label="Test now"
                    variant="secondary"
                    onPress={() => void triggerTestPush("now")}
                    loading={testingPush === "now"}
                    disabled={testingPush !== "none"}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={`Test killed app (${KILLED_APP_DELAY_SECONDS}s)`}
                    onPress={() => void triggerTestPush("delayed")}
                    loading={testingPush === "delayed"}
                    disabled={testingPush !== "none"}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ) : null}
            <SettingsRow
              icon={<Smartphone size={20} color={colors.accent} />}
              title="Devices"
              subtitle="Manage registered phones & tablets"
              onPress={() => router.push("/(tabs)/devices")}
            />
            <SettingsRow
              icon={<Shield size={20} color={colors.accent} />}
              title="API endpoint"
              subtitle={API_BASE_URL}
              onPress={() => router.push("/(tabs)/api-docs")}
            />

            <Button
              label="Log out"
              variant="danger"
              onPress={onLogout}
              fullWidth
              leftIcon={<LogOut size={18} color={colors.danger} />}
              style={{ marginTop: 24 }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
