import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useAlarmInbox } from "@/context/AlarmInboxContext";
import { useAuth } from "@/context/AuthContext";
import { getMembers } from "@/api/members";
import { messageBroadcastLabel } from "@/lib/messageBroadcast";
import { resolveBroadcastName } from "@/lib/appSettings";
import { toMessageTypeLabel } from "@/lib/messageTypes";
import { isUnknownMessageType } from "@/lib/messageWorkflow";
import { useEffect, useMemo, useState } from "react";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;

export default function AlertsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const selfBroadcastName = resolveBroadcastName(user?.name);
  const ownerId = user?.id != null ? Number(user.id) : null;
  const { alarmMessages, loading, error, refresh, markAlarmsSeen } = useAlarmInbox();
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});

  useEffect(() => {
    void markAlarmsSeen();
  }, [markAlarmsSeen]);

  useEffect(() => {
    let active = true;
    void getMembers().then((res) => {
      if (!active) return;
      const map: OwnerNameMap = {};
      (res.data ?? []).forEach((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const name =
          row.name ||
          `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
          row.email ||
          "";
        if (name) map[id] = name;
      });
      setOwnerNames(map);
    });
    return () => {
      active = false;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...alarmMessages].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [alarmMessages],
  );

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Incoming alarms"
          subtitle="PANIC, SENSOR, NS-PANIC & other alarms"
          showBack
          onBack={() => router.back()}
        />

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              borderColor: "rgba(226,59,78,0.35)",
              backgroundColor: "rgba(252,231,234,0.65)",
            }}
          >
            <AlertTriangle size={18} color={colors.danger} />
            <Text
              style={{
                color: colors.text,
                fontSize: 12,
                lineHeight: 18,
                flex: 1,
              }}
            >
              Critical alarms are kept separate from Messages so they stay easy
              to read during an emergency.
            </Text>
          </Card>
        </View>

        {error ? (
          <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>
            {error}
          </Text>
        ) : null}

        {loading && sorted.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void refresh()}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No incoming alarms.
                </Text>
              </Card>
            }
            renderItem={({ item }) => {
              const isUnknown = isUnknownMessageType(item.type);
              const broadcast = messageBroadcastLabel(item, {
                selfOwnerId: ownerId,
                selfBroadcastName,
                resolveOwnerName: (id) => ownerNames[id] ?? null,
              });
              return (
                <Card
                  style={{
                    marginBottom: 10,
                    borderColor: isUnknown ? "#B71C1C" : "rgba(226,59,78,0.35)",
                    borderWidth: isUnknown ? 2 : 1,
                    backgroundColor: isUnknown ? "#FFEBEE" : undefined,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Chip
                      label={toMessageTypeLabel(item.type)}
                      tone={isUnknown ? "critical" : "danger"}
                    />
                    <Text style={{ color: colors.textDim, fontSize: 11 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: isUnknown ? "#B71C1C" : colors.text,
                      fontSize: isUnknown ? 18 : 16,
                      fontWeight: "800",
                      marginTop: 10,
                    }}
                  >
                    {broadcast}
                  </Text>
                  <Text
                    style={{
                      color: isUnknown ? "#7A1622" : colors.text,
                      fontSize: isUnknown ? 17 : 15,
                      fontWeight: isUnknown ? "700" : "500",
                      marginTop: 4,
                      lineHeight: 22,
                    }}
                  >
                    {item.message}
                  </Text>
                  <Text
                    style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}
                  >
                    Zone {item.zone_id}
                  </Text>
                </Card>
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
