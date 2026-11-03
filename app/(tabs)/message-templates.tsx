import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bell, MessageSquareText, UserPlus } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { colors } from "@/theme/colors";

export default function MessageTemplatesScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Message Template"
            subtitle="Arrival, alert, and welcome copy"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />

          <View style={{ paddingHorizontal: 20 }}>
            <SettingsNavRow
              icon={<MessageSquareText size={18} color={colors.accent} />}
              title="Arrival messages"
              subtitle="Copy guests see when they arrive"
              onPress={() => router.push("/(tabs)/guest-arrival-messages")}
            />
            <SettingsNavRow
              icon={<Bell size={18} color={colors.accent} />}
              title="Quick alert messages"
              subtitle="Preset text for the alert buttons"
              onPress={() => router.push("/(tabs)/quick-alert-messages")}
            />
            <SettingsNavRow
              icon={<UserPlus size={18} color={colors.accent} />}
              title="Member welcome message"
              subtitle="Greeting when an invited member joins"
              onPress={() => router.push("/(tabs)/member-join-welcome")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
