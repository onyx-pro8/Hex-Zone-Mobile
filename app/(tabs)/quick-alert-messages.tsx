import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ConfigForm } from "@/components/settings/ConfigForm";

export default function QuickAlertMessagesScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Quick alert messages"
            subtitle="Presets for Quick Alert buttons"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <ConfigForm section="quickAlerts" />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
