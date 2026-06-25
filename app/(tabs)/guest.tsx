import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarRange, ChevronRight, Ticket } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { AlertBellButton } from "@/components/ui/AlertBellButton";
import { Card } from "@/components/ui/Card";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { colors } from "@/theme/colors";

type GuestEntry = {
  key: "schedules" | "passes";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  href: "/(tabs)/guest-schedules" | "/(tabs)/guest-passes";
};

export default function GuestHubScreen() {
  const router = useRouter();
  const { effectiveZoneId, zonesLoading } = useEffectiveZoneId();
  const zoneId = effectiveZoneId;

  const entries: GuestEntry[] = [
    {
      key: "schedules",
      title: "Guest schedules",
      subtitle: "Pre-approve expected guest windows",
      icon: <CalendarRange size={22} color={colors.accent} />,
      href: "/(tabs)/guest-schedules",
    },
    {
      key: "passes",
      title: "Guest passes",
      subtitle: "Pre-registered arrivals & event IDs",
      icon: <Ticket size={22} color={colors.accent} />,
      href: "/(tabs)/guest-passes",
    },
  ];

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <ScreenHeader
            title="Guest"
            subtitle="Manage your expected visitors"
            right={<AlertBellButton />}
          />

          {!zoneId ? (
            <View style={{ paddingHorizontal: 20 }}>
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

          <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 8 }}>
            {entries.map((entry) => (
              <Pressable
                key={entry.key}
                onPress={() => router.push(entry.href)}
              >
                <Card
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  {entry.icon}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {entry.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {entry.subtitle}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textDim} />
                </Card>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
