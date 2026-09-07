import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { MessageInboxFilterBar } from "@/components/messages/MessageInboxFilterBar";
import { InboxMessageCard } from "@/components/messages/InboxMessageCard";
import { useAlarmInbox } from "@/context/AlarmInboxContext";
import { useAuth } from "@/context/AuthContext";
import { getMembers } from "@/api/members";
import { messageAvatarLabel, messageBroadcastLabel } from "@/lib/messageBroadcast";
import { resolveBroadcastName } from "@/lib/appSettings";
import { type MessageType } from "@/lib/messageTypes";
import {
  applyMessageInboxFilters,
  messageTypesForCategories,
} from "@/lib/messageInboxFilters";
import { wellnessResponseTrackingEnabled } from "@/lib/messageWorkflow";
import { WellnessAckInline } from "@/components/messages/WellnessAckInline";
import { useZoneNameLookup } from "@/hooks/useZoneNameLookup";
import { useEnsureFilteredInboxRows } from "@/hooks/useEnsureFilteredInboxRows";
import { useMemberPresence } from "@/hooks/useMemberPresence";
import { useCallback, useEffect, useMemo, useState } from "react";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;
type OwnerAvatarMap = Record<number, string>;

export default function AlertsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useMemberPresence();
  const selfRealName =
    (user?.name ?? "").trim() ||
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const selfBroadcastName = resolveBroadcastName(selfRealName || user?.name);
  const ownerId = user?.id != null ? Number(user.id) : null;
  const {
    alarmMessages,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    markAlarmsSeen,
    pageSize,
  } = useAlarmInbox();
  const { zoneNames } = useZoneNameLookup();
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});
  const [ownerAvatars, setOwnerAvatars] = useState<OwnerAvatarMap>({});
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
      const names: OwnerNameMap = {};
      const avatars: OwnerAvatarMap = {};
      (res.data ?? []).forEach((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const name =
          row.name ||
          `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
          row.email ||
          "";
        if (name) names[id] = name;
        const avatar =
          typeof row.avatar_url === "string" ? row.avatar_url.trim() : "";
        if (avatar) avatars[id] = avatar;
      });
      setOwnerNames(names);
      setOwnerAvatars(avatars);
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

  useEnsureFilteredInboxRows({
    filteredCount: sorted.length,
    pageSize,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    filterKey: `${zoneFilter}|${typeFilter}|${dateFrom}|${dateTo}|${search}`,
  });

  const onEndReached = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    void loadMore();
  }, [hasMore, loading, loadingMore, loadMore]);

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

        {loading && sorted.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={loading && !loadingMore}
                onRefresh={() => void refresh()}
                tintColor={colors.accent}
              />
            }
            ListHeaderComponent={
              <MessageInboxFilterBar
                search={search}
                onSearchChange={setSearch}
                zoneFilter={zoneFilter}
                onZoneFilterChange={setZoneFilter}
                zoneIds={allZoneIds}
                zoneNames={zoneNames}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                typeOptions={alarmTypeOptions}
                typeAllLabel="All alarms"
                searchPlaceholder="Search alarms…"
                dateFrom={dateFrom}
                onDateFromChange={setDateFrom}
                dateTo={dateTo}
                onDateToChange={setDateTo}
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              loading || loadingMore ? null : (
                <Card>
                  <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                    No incoming alarms.
                  </Text>
                </Card>
              )
            }
            renderItem={({ item }) => {
              const broadcast = messageBroadcastLabel(item, {
                selfOwnerId: ownerId,
                selfBroadcastName,
                resolveOwnerName: (id) => ownerNames[id] ?? null,
              });
              const avatarName = messageAvatarLabel(item, {
                selfOwnerId: ownerId,
                selfRealName,
                resolveOwnerName: (id) => ownerNames[id] ?? null,
              });
              const senderId =
                typeof item.sender_id === "number" && item.sender_id > 0
                  ? item.sender_id
                  : null;
              const thinAvatar =
                senderId != null ? `/owners/${senderId}/avatar` : null;
              const isSelf =
                senderId != null && ownerId != null && senderId === ownerId;
              const avatarUrl = isSelf
                ? user?.avatar_url ?? ownerAvatars[senderId] ?? thinAvatar
                : senderId != null
                  ? ownerAvatars[senderId] ?? thinAvatar
                  : null;
              return (
                <InboxMessageCard
                  item={item}
                  userName={broadcast}
                  avatarName={avatarName}
                  avatarEmail={isSelf ? user?.email : null}
                  avatarUrl={avatarUrl}
                  online={senderId != null ? isOnline(senderId) : false}
                  selfOwnerId={ownerId}
                  zoneNames={zoneNames}
                  style={{
                    borderColor: "rgba(226,59,78,0.35)",
                  }}
                  footerExtra={
                    item.type === "WELLNESS_CHECK" &&
                    wellnessResponseTrackingEnabled(item) ? (
                      <WellnessAckInline
                        messageEventId={item.id}
                        selfOwnerId={ownerId}
                        senderId={item.sender_id ?? null}
                      />
                    ) : null
                  }
                />
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
