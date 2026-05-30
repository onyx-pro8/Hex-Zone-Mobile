import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  ChevronRight,
  MessageSquare,
  QrCode,
  Shield,
  Smartphone,
  Users,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/context/AuthContext";
import { getDevices } from "@/api/devices";
import { getMembers } from "@/api/members";
import { getZones } from "@/api/zones";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { colors } from "@/theme/colors";

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Card style={{ alignItems: "center", gap: 10, paddingVertical: 18 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.bgSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: 12,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { messages, refresh: refreshMessages } = useMessagesFeed({ limit: 5 });
  const [zonesCount, setZonesCount] = useState(0);
  const [membersCount, setMembersCount] = useState(0);
  const [devicesCount, setDevicesCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    const [zones, members, devices] = await Promise.all([
      getZones(),
      getMembers(),
      getDevices(),
    ]);
    setZonesCount(zones.data?.length ?? 0);
    setMembersCount(members.data?.length ?? 0);
    setDevicesCount(devices.data?.length ?? 0);
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), refreshMessages()]);
    setRefreshing(false);
  }, [loadStats, refreshMessages]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const unreadAlarms = messages.filter((m) => m.category === "Alarm").length;

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 8,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Logo size={28} />
            <Pressable
              onPress={() => router.push("/(tabs)/messages")}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.bgCard,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell size={20} color={colors.text} />
              {unreadAlarms > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                  }}
                />
              ) : null}
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {greeting},
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: "800",
                marginTop: 4,
              }}
            >
              {user?.name ?? "Member"}
            </Text>
            <Chip
              label={String(user?.accountType ?? "PRIVATE").replace("_", "+")}
              tone="muted"
              style={{ marginTop: 10 }}
            />
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Card glow padded={false}>
              <LinearGradient
                colors={["rgba(255,45,170,0.18)", "rgba(255,45,170,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 22 }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "600",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Zone overview
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 18,
                  }}
                >
                  {[
                    { label: "Zones", value: zonesCount },
                    { label: "Members", value: membersCount },
                    { label: "Devices", value: devicesCount },
                  ].map((stat) => (
                    <View key={stat.label} style={{ alignItems: "center" }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 28,
                          fontWeight: "800",
                        }}
                      >
                        {stat.value}
                      </Text>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          marginTop: 4,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {stat.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {user?.zoneId ? (
                  <View
                    style={{
                      marginTop: 18,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: colors.bgSurface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textDim,
                        fontSize: 10,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Primary zone ID
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 13,
                        fontWeight: "600",
                        marginTop: 4,
                      }}
                      numberOfLines={1}
                    >
                      {user.zoneId}
                    </Text>
                  </View>
                ) : null}
              </LinearGradient>
            </Card>
          </View>

          <View
            style={{
              paddingHorizontal: 20,
              marginTop: 24,
              flexDirection: "row",
              gap: 12,
            }}
          >
            <QuickAction
              icon={<MessageSquare size={20} color={colors.accent} />}
              label="Messages"
              onPress={() => router.push("/(tabs)/messages")}
            />
            <QuickAction
              icon={<QrCode size={20} color={colors.accent} />}
              label="QR Access"
              onPress={() => router.push("/(tabs)/access")}
            />
          </View>
          <View
            style={{
              paddingHorizontal: 20,
              marginTop: 12,
              flexDirection: "row",
              gap: 12,
            }}
          >
            <QuickAction
              icon={<Users size={20} color={colors.accent} />}
              label="Members"
              onPress={() => router.push("/(tabs)/members")}
            />
            <QuickAction
              icon={<Smartphone size={20} color={colors.accent} />}
              label="Devices"
              onPress={() => router.push("/(tabs)/devices")}
            />
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Recent activity
              </Text>
              <Pressable onPress={() => router.push("/(tabs)/messages")}>
                <Text style={{ color: colors.accent, fontSize: 13 }}>
                  View all
                </Text>
              </Pressable>
            </View>

            {messages.length === 0 ? (
              <Card>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Shield size={22} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, flex: 1 }}>
                    No recent messages. Push notifications will alert you when
                    alarms or access events arrive.
                  </Text>
                </View>
              </Card>
            ) : (
              messages.slice(0, 4).map((msg) => (
                <Pressable
                  key={msg.id}
                  onPress={() => router.push("/(tabs)/messages")}
                  style={{ marginBottom: 10 }}
                >
                  <Card style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Chip
                        label={msg.category}
                        tone={
                          msg.category === "Alarm"
                            ? "danger"
                            : msg.category === "Access"
                              ? "warning"
                              : "default"
                        }
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: "600",
                          marginTop: 8,
                        }}
                        numberOfLines={1}
                      >
                        {msg.message}
                      </Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        {new Date(msg.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textDim} />
                  </Card>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
