import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  CalendarRange,
  LogOut,
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
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { colors } from "@/theme/colors";

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
  const { user, logout } = useAuth();
  const { pushToken, permissionError } = useNotifications();

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
                  ? "Enabled — messages arrive as push alerts"
                  : permissionError ?? "Tap to enable notifications"
              }
              onPress={() => void retryPush()}
            />
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
