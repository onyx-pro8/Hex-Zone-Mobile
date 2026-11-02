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
            title="Member welcome message"
            subtitle="Greeting when an invited member joins"
            showBack
            onBack={() => router.replace("/(tabs)/message-templates")}
          />
          <ConfigForm section="memberJoin" />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
