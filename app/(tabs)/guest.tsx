import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarRange, ChevronRight, Ticket } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
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
  const { user } = useAuth();

  const zoneId = useMemo(
    () => String(user?.zoneId ?? user?.zone_id ?? "").trim(),
    [user?.zoneId, user?.zone_id],
  );

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
          />

          {!zoneId ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Card>
                <Text style={{ color: colors.textMuted }}>
                  Your account is not linked to a zone yet. Ask your administrator
                  to invite you to a zone before adding guests.
                </Text>
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
