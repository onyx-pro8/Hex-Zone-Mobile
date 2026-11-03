import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  BookOpen,
  History,
  LogOut,
  MessageSquareText,
  Ruler,
  Smartphone,
} from "lucide-react-native";
import { isSystemAdministrator } from "@/lib/accountLimits";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const isSystemAdmin = isSystemAdministrator({
    role: user?.role,
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
  });

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
            onBack={() => router.replace("/(tabs)")}
          />

          <View style={{ paddingHorizontal: 20 }}>
            <SettingsNavRow
              icon={<Bell size={18} color={colors.accent} />}
              title="Notification"
              subtitle="Push alerts for this device"
              onPress={() => router.push("/(tabs)/notification-settings")}
            />
            <SettingsNavRow
              icon={<Smartphone size={18} color={colors.accent} />}
              title="Device"
              subtitle="Manage registered phones and hubs"
              onPress={() => router.push("/(tabs)/devices")}
            />
            <SettingsNavRow
              icon={<MessageSquareText size={18} color={colors.accent} />}
              title="Message Template"
              subtitle="Arrival, alert, and welcome copy"
              onPress={() => router.push("/(tabs)/message-templates")}
            />
            <SettingsNavRow
              icon={<History size={18} color={colors.accent} />}
              title="Access history"
              subtitle="Guest access permission messages"
              onPress={() => router.push("/(tabs)/access-history")}
            />
            {isSystemAdmin ? (
              <SettingsNavRow
                icon={<Ruler size={18} color={colors.accent} />}
                title="Zone size limit"
                subtitle="Each zone and the account total"
                onPress={() => router.push("/(tabs)/zone-size-limits")}
              />
            ) : null}
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
