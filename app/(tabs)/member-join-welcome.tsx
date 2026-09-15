import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ConfigForm } from "@/components/settings/ConfigForm";

export default function MemberJoinWelcomeScreen() {
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Member join welcome"
            subtitle="Message when invited members join"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <ConfigForm section="memberJoin" />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
