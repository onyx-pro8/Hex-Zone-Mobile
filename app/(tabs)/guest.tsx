import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { GuestHubLinks } from "@/components/guest/GuestHubLinks";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { colors } from "@/theme/colors";

export default function GuestHubScreen() {
  const { effectiveZoneId, zonesLoading } = useEffectiveZoneId();
  const zoneId = effectiveZoneId;

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <AppHeader
            title="Guest"
            subtitle="Create an Event ID pass for guest access"
          />

          {!zoneId ? (
            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <Card>
                {zonesLoading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator color={colors.accent} />
                    <Text style={{ color: colors.textMuted }}>
                      Looking up your zone…
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted }}>
                    Your account is not linked to a zone yet. Ask your
                    administrator to invite you to a zone before adding guests.
                  </Text>
                )}
              </Card>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 20 }}>
            <GuestHubLinks includeAdminTools={false} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
