import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarRange,
  MessageSquareText,
  Ticket,
  UserCheck,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { colors } from "@/theme/colors";

export default function GuestManagementScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Guest management"
            subtitle="Lists, schedules, passes & arrival copy"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />

          <View style={{ paddingHorizontal: 20 }}>
            <SettingsNavRow
              icon={<UserCheck size={18} color={colors.accent} />}
              title="Guest list"
              subtitle="Pending and recent guest arrivals"
              onPress={() => router.push("/(tabs)/guest-list")}
            />
            <SettingsNavRow
              icon={<CalendarRange size={18} color={colors.accent} />}
              title="Guest schedules"
              subtitle="Expected windows · admin approval"
              onPress={() => router.push("/(tabs)/guest-schedules")}
            />
            <SettingsNavRow
              icon={<Ticket size={18} color={colors.accent} />}
              title="Guest passes"
              subtitle="Pre-registered passes with event IDs"
              onPress={() => router.push("/(tabs)/guest-passes")}
            />
            <SettingsNavRow
              icon={<MessageSquareText size={18} color={colors.accent} />}
              title="Arrival messages"
              subtitle={
                '"Expected" and "waiting for approval" wording for guests'
              }
              onPress={() => router.push("/(tabs)/guest-arrival-messages")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
