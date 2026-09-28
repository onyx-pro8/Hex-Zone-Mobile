import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { GuestHubLinks } from "@/components/guest/GuestHubLinks";

export default function GuestManagementScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Guest management"
            subtitle="List, Event ID passes & arrival templates"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />

          <View style={{ paddingHorizontal: 20 }}>
            <GuestHubLinks includeAdminTools />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
