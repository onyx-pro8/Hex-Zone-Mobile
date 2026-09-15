import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  BookOpen,
  Home,
  LogOut,
  Smartphone,
  UserPlus,
  Users,
  Zap,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();

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

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Account settings"
            subtitle="Choose a category to manage"
            showBack
          />

          <View style={{ paddingHorizontal: 20 }}>
            <SettingsNavRow
              icon={<Home size={18} color={colors.accent} />}
              title="Smart-home integration"
              subtitle="Hubs, webhook, API key & network ID"
              onPress={() => router.push("/(tabs)/smart-home-settings")}
            />
            <SettingsNavRow
              icon={<Zap size={18} color={colors.accent} />}
              title="Quick alert messages"
              subtitle="Preset text for Quick Alert buttons"
              onPress={() => router.push("/(tabs)/quick-alert-messages")}
            />
            <SettingsNavRow
              icon={<UserPlus size={18} color={colors.accent} />}
              title="Member join welcome"
              subtitle="Message when invited members join"
              onPress={() => router.push("/(tabs)/member-join-welcome")}
            />
            <SettingsNavRow
              icon={<Users size={18} color={colors.accent} />}
              title="Guest management"
              subtitle="Lists, schedules, passes & arrival copy"
              onPress={() => router.push("/(tabs)/guest-management")}
            />
            <SettingsNavRow
              icon={<Bell size={18} color={colors.accent} />}
              title="Notification"
              subtitle="Push alerts for this device"
              onPress={() => router.push("/(tabs)/notification-settings")}
            />
            <SettingsNavRow
              icon={<Smartphone size={18} color={colors.accent} />}
              title="Device"
              subtitle="Manage registered phones & hubs"
              onPress={() => router.push("/(tabs)/devices")}
            />
            <SettingsNavRow
              icon={<BookOpen size={18} color={colors.accent} />}
              title="APIs"
              subtitle="Explore and try API endpoints"
              onPress={() => router.push("/(tabs)/api-docs")}
            />

            <Button
              label="Log out"
              variant="danger"
              size="sm"
              onPress={onLogout}
              fullWidth
              leftIcon={<LogOut size={16} color={colors.danger} />}
              style={{ marginTop: 16 }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
