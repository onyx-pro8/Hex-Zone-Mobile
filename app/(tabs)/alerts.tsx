import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { toMessageTypeLabel, type MessageType } from "@/lib/messageTypes";
import {
  applyMessageInboxFilters,
  messageTypesForCategories,
} from "@/lib/messageInboxFilters";
import {
  isUnknownMessageType,
  wellnessResponseTrackingEnabled,
} from "@/lib/messageWorkflow";
import { messageZoneLabel } from "@/lib/messageZoneLabel";
import {
  formatMessageCoordinatesLabel,
  hasMessageCoordinates,
  messageCoordinatesMapsUrl,
} from "@/lib/messageCoordinates";
import { WellnessAckInline } from "@/components/messages/WellnessAckInline";
import { useZoneNameLookup } from "@/hooks/useZoneNameLookup";
import { useEffect, useMemo, useState } from "react";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;

export default function AlertsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const selfBroadcastName = resolveBroadcastName(user?.name);
  const ownerId = user?.id != null ? Number(user.id) : null;
  const { alarmMessages, loading, error, refresh, markAlarmsSeen } = useAlarmInbox();
  const { zoneNames } = useZoneNameLookup();
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});
  const [zoneFilter, setZoneFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MessageType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

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

  const alarmTypeOptions = useMemo(
    () => messageTypesForCategories(["Alarm"]),
    [],
  );

  const allZoneIds = useMemo(() => {
    const fromMessages = alarmMessages
      .map((m) => String(m.zone_id ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(fromMessages)).sort();
  }, [alarmMessages]);

  useEffect(() => {
    if (zoneFilter !== "all" && !allZoneIds.includes(zoneFilter)) {
      setZoneFilter("all");
    }
  }, [allZoneIds, zoneFilter]);

  const filtered = useMemo(
    () =>
      applyMessageInboxFilters(alarmMessages, {
        includeCategories: ["Alarm"],
        zoneFilter,
        typeFilter,
        dateFrom,
        dateTo,
        search,
      }),
    [alarmMessages, zoneFilter, typeFilter, dateFrom, dateTo, search],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [filtered],
  );

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Incoming alarms"
          subtitle="PANIC, SENSOR, NS-PANIC, WELLNESS CHECK & other alarms"
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
            ListHeaderComponent={
              <Card style={{ marginBottom: 14, gap: 12 }}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search alarms…"
                  placeholderTextColor={colors.textDim}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bgElevated,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    color: colors.text,
                    fontSize: 15,
                  }}
                />

                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Zone
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                  >
                    <Pressable onPress={() => setZoneFilter("all")}>
                      <Chip
                        label="All zones"
                        active={zoneFilter === "all"}
                        style={{ paddingHorizontal: 12, paddingVertical: 7 }}
                      />
                    </Pressable>
                    {allZoneIds.map((zone) => (
                      <Pressable key={zone} onPress={() => setZoneFilter(zone)}>
                        <Chip
                          label={zoneNames.get(zone) ?? zone}
                          active={zoneFilter === zone}
                          style={{ paddingHorizontal: 12, paddingVertical: 7 }}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Type
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                  >
                    <Pressable onPress={() => setTypeFilter("all")}>
                      <Chip
                        label="All types"
                        active={typeFilter === "all"}
                        style={{ paddingHorizontal: 12, paddingVertical: 7 }}
                      />
                    </Pressable>
                    {alarmTypeOptions.map((option) => (
                      <Pressable
                        key={option.type}
                        onPress={() => setTypeFilter(option.type)}
                      >
                        <Chip
                          label={option.label}
                          active={typeFilter === option.type}
                          style={{ paddingHorizontal: 12, paddingVertical: 7 }}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Date range
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={dateFrom}
                      onChangeText={setDateFrom}
                      placeholder="From"
                      placeholderTextColor={colors.textDim}
                      autoCapitalize="none"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.bgElevated,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.text,
                        fontSize: 13,
                      }}
                    />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>to</Text>
                    <TextInput
                      value={dateTo}
                      onChangeText={setDateTo}
                      placeholder="To"
                      placeholderTextColor={colors.textDim}
                      autoCapitalize="none"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.bgElevated,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.text,
                        fontSize: 13,
                      }}
                    />
                  </View>
                </View>

                {(search.trim() ||
                  zoneFilter !== "all" ||
                  typeFilter !== "all" ||
                  dateFrom ||
                  dateTo) && (
                  <Pressable
                    onPress={() => {
                      setSearch("");
                      setZoneFilter("all");
                      setTypeFilter("all");
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    <Text
                      style={{
                        color: colors.accent,
                        fontSize: 13,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      Clear filters
                    </Text>
                  </Pressable>
                )}
              </Card>
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
              const mapsUrl = messageCoordinatesMapsUrl(item);
              const hasCoords = hasMessageCoordinates(item);
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
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <Chip
                        label={toMessageTypeLabel(item.type)}
                        tone={isUnknown ? "critical" : "danger"}
                      />
                      {hasCoords && mapsUrl ? (
                        <Pressable
                          onPress={() => void Linking.openURL(mapsUrl)}
                          accessibilityRole="link"
                          accessibilityLabel="Open sender location in maps"
                        >
                          <Chip
                            label={formatMessageCoordinatesLabel(item)}
                            active
                          />
                        </Pressable>
                      ) : (
                        <Chip
                          label={formatMessageCoordinatesLabel(item)}
                          tone="muted"
                        />
                      )}
                    </View>
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
                    {messageZoneLabel(item, {
                      viewerOwnerId: ownerId,
                      zoneNames,
                    })}
                  </Text>
                  {item.type === "WELLNESS_CHECK" &&
                  wellnessResponseTrackingEnabled(item) ? (
                    <WellnessAckInline
                      messageEventId={item.id}
                      selfOwnerId={ownerId}
                      senderId={item.sender_id ?? null}
                    />
                  ) : null}
                </Card>
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
