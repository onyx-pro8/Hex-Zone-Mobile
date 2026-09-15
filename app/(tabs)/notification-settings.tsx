import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PushNotificationsSection } from "@/components/settings/PushNotificationsSection";

export default function NotificationSettingsScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Notification"
            subtitle="Push alerts for this device"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <View style={{ paddingHorizontal: 20 }}>
            <PushNotificationsSection />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
