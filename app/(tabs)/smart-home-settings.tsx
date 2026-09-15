import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ConfigForm } from "@/components/settings/ConfigForm";

export default function SmartHomeSettingsScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Smart-home integration"
            subtitle="Hubs, webhook & network ID"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <ConfigForm section="smartHome" />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
