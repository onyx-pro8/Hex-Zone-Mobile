import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { MessageInboxFilterBar } from "@/components/messages/MessageInboxFilterBar";
import {
  formatInboxDayLabel,
  InboxMessageCard,
  inboxBubbleCluster,
  inboxClusterRootId,
  inboxDayKey,
  useInboxClusterWidths,
  type InboxBubbleCluster,
} from "@/components/messages/InboxMessageCard";
import { WellnessAckInline } from "@/components/messages/WellnessAckInline";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useEnsureFilteredInboxRows } from "@/hooks/useEnsureFilteredInboxRows";
import { useZoneNameLookup } from "@/hooks/useZoneNameLookup";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { type Message } from "@/api/messages";
import { getMembers } from "@/api/members";
import { useMemberPresence } from "@/hooks/useMemberPresence";
import { isRunningExpoGo } from "@/lib/pushSupport";
import {
  getMessageTypeCategory,
  toMessageType,
  type MessageType,
} from "@/lib/messageTypes";
import {
  applyMessageInboxFilters,
  messageTypesForCategories,
} from "@/lib/messageInboxFilters";
import { resolveBroadcastName } from "@/lib/appSettings";
import {
  guestInboxPresenceId,
  isGuestInboxSenderOnline,
  messageAvatarLabel,
  messageBroadcastLabel,
} from "@/lib/messageBroadcast";
import type { ZoneNameLookup } from "@/lib/messageZoneLabel";
import { wellnessResponseTrackingEnabled } from "@/lib/messageWorkflow";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;
type OwnerAvatarMap = Record<number, string>;

function MessageRow({
  item,
  selfOwnerId,
  selfBroadcastName,
  selfRealName,
  selfEmail,
  selfAvatarUrl,
  ownerNames,
  ownerAvatars,
  senderOnline = false,
  zoneNames,
  highlighted = false,
  dayLabel = null,
  cluster = "single",
  clusterMinWidth,
  onBubbleWidth,
}: {
  item: Message;
  selfOwnerId: number | null;
  selfBroadcastName: string;
  selfRealName?: string | null;
  selfEmail?: string | null;
  selfAvatarUrl?: string | null;
  ownerNames: OwnerNameMap;
  ownerAvatars: OwnerAvatarMap;
  senderOnline?: boolean;
  zoneNames?: ZoneNameLookup;
  highlighted?: boolean;
  dayLabel?: string | null;
  cluster?: InboxBubbleCluster;
  clusterMinWidth?: number;
  onBubbleWidth?: (width: number) => void;
}) {
  const router = useRouter();

  const broadcast = messageBroadcastLabel(item, {
    selfOwnerId,
    selfBroadcastName,
    resolveOwnerName: (id) => ownerNames[id] ?? null,
  });
  const avatarName = messageAvatarLabel(item, {
    selfOwnerId,
    selfRealName,
    resolveOwnerName: (id) => ownerNames[id] ?? null,
  });
  const isSelf =
    selfOwnerId != null &&
    typeof item.sender_id === "number" &&
    item.sender_id === selfOwnerId;

  const senderId =
    typeof item.sender_id === "number" && item.sender_id > 0
      ? item.sender_id
      : null;
  const thinAvatar =
    senderId != null ? `/owners/${senderId}/avatar` : null;
  const avatarUrl =
    senderId != null && selfOwnerId != null && senderId === selfOwnerId
      ? selfAvatarUrl ?? ownerAvatars[senderId] ?? thinAvatar
      : senderId != null
        ? ownerAvatars[senderId] ?? thinAvatar
        : null;

  const privateCounterpartId =
    item.type === "PRIVATE" && selfOwnerId != null
      ? item.sender_id != null && item.sender_id !== selfOwnerId
        ? item.sender_id
        : item.receiver_id != null && item.receiver_id !== selfOwnerId
          ? item.receiver_id
          : null
      : null;

  return (
    <InboxMessageCard
      item={item}
      userName={broadcast}
      avatarName={avatarName}
      avatarEmail={isSelf ? selfEmail : null}
      avatarUrl={avatarUrl}
      online={senderOnline}
      selfOwnerId={selfOwnerId}
      zoneNames={zoneNames}
      highlighted={highlighted}
      dayLabel={dayLabel}
      cluster={cluster}
      clusterMinWidth={clusterMinWidth}
      onBubbleWidth={onBubbleWidth}
      footerExtra={
        <>
          {item.type === "WELLNESS_CHECK" &&
          wellnessResponseTrackingEnabled(item) ? (
            <WellnessAckInline
              messageEventId={item.id}
              selfOwnerId={selfOwnerId}
              senderId={item.sender_id ?? null}
            />
          ) : null}
          {privateCounterpartId != null ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/private-thread",
                  params: {
                    otherOwnerId: String(privateCounterpartId),
                    selfOwnerId: String(selfOwnerId ?? ""),
                  },
                } as unknown as Href)
              }
              style={{
                marginTop: 4,
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <MessageSquare size={14} color={colors.accent} />
              <Text
                style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}
              >
                View private thread
              </Text>
            </Pressable>
          ) : null}
        </>
      }
    />
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const { isOnline, isGuestOnline, seedGuestPresence } = useMemberPresence();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    type?: string;
    message?: string;
  }>();
  const selfRealName =
    (user?.name ?? "").trim() ||
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const selfBroadcastName = resolveBroadcastName(selfRealName || user?.name);
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    ownerId,
    wsStatus,
    pageSize,
  } = useMessagesFeed();
  const { zoneNames } = useZoneNameLookup();
  const { pushToken, permissionError } = useNotifications();
  const [typeFilter, setTypeFilter] = useState<"all" | MessageType>("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null,
  );
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});
  const [ownerAvatars, setOwnerAvatars] = useState<OwnerAvatarMap>({});
  const { clusterWidths, reportClusterWidth } = useInboxClusterWidths();

  useEffect(() => {
    for (const item of messages) {
      const gid = guestInboxPresenceId(item);
      if (gid && item.guest_online === true) {
        seedGuestPresence(gid, true);
      }
    }
  }, [messages, seedGuestPresence]);

  useEffect(() => {
    const typeParam =
      typeof searchParams.type === "string" ? searchParams.type.trim() : "";
    const messageParam =
      typeof searchParams.message === "string"
        ? searchParams.message.trim()
        : "";
    if (typeParam) {
      const resolved = toMessageType(typeParam);
      if (resolved === "PERMISSION") {
        router.replace({
          pathname: "/(tabs)/access-history",
          params: messageParam ? { message: messageParam } : undefined,
        } as unknown as Href);
        return;
      }
      if (resolved && getMessageTypeCategory(resolved) !== "Alarm") {
        setTypeFilter(resolved);
      }
    }
    if (messageParam) setHighlightMessageId(messageParam);
  }, [
    searchParams.type,
    searchParams.message,
    router,
  ]);

  const inboxTypeOptions = useMemo(
    () =>
      messageTypesForCategories(["Alert", "Access"]).filter(
        (option) => option.type !== "PERMISSION",
      ),
    [],
  );

  const allZoneIds = useMemo(() => {
    const fromMessages = messages
      .filter((m) => m.category !== "Alarm" && m.type !== "PERMISSION")
      .map((m) => String(m.zone_id ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(fromMessages)).sort();
  }, [messages]);

  useEffect(() => {
    if (zoneFilter !== "all" && !allZoneIds.includes(zoneFilter)) {
      setZoneFilter("all");
    }
  }, [allZoneIds, zoneFilter]);

  const filtered = useMemo(
    () =>
      applyMessageInboxFilters(messages, {
        excludeCategories: ["Alarm"],
        excludeTypes: ["PERMISSION"],
        zoneFilter,
        typeFilter,
        dateFrom,
        dateTo,
        search,
      }),
    [messages, zoneFilter, typeFilter, dateFrom, dateTo, search],
  );

  useEnsureFilteredInboxRows({
    filteredCount: filtered.length,
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

  // Load members once so inbox rows can resolve a friendly name / avatar for
  // senders that did not embed a broadcast name.
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

  const realtimeHint = useMemo(() => {
    if (isRunningExpoGo()) {
      return "Polling inbox every 30s (Expo Go has no remote push on Android)";
    }
    if (pushToken) {
      const ws =
        wsStatus === "open"
          ? " · live socket"
          : wsStatus === "connecting"
            ? " · connecting socket"
            : "";
      return "";
    }
    return permissionError ?? "Enable notifications in a dev build for alarms";
  }, [pushToken, permissionError, wsStatus]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <AppHeader title="Home" subtitle={realtimeHint} />

        {loading && messages.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const prev = filtered[index - 1];
              const next = filtered[index + 1];
              const dayLabel =
                !prev || inboxDayKey(prev.created_at) !== inboxDayKey(item.created_at)
                  ? formatInboxDayLabel(item.created_at)
                  : null;
              const cluster = inboxBubbleCluster(prev, item, next);
              const clusterId = inboxClusterRootId(filtered, index);
              return (
              <MessageRow
                item={item}
                selfOwnerId={ownerId}
                selfBroadcastName={selfBroadcastName}
                selfRealName={selfRealName}
                selfEmail={user?.email}
                selfAvatarUrl={user?.avatar_url}
                ownerNames={ownerNames}
                ownerAvatars={ownerAvatars}
                senderOnline={
                  guestInboxPresenceId(item)
                    ? isGuestInboxSenderOnline(item, isGuestOnline)
                    : typeof item.sender_id === "number" && item.sender_id > 0
                      ? isOnline(item.sender_id)
                      : false
                }
                zoneNames={zoneNames}
                highlighted={highlightMessageId === item.id}
                dayLabel={dayLabel}
                cluster={cluster}
                clusterMinWidth={
                  cluster === "single" ? undefined : clusterWidths[clusterId]
                }
                onBubbleWidth={
                  cluster === "single"
                    ? undefined
                    : (width) => reportClusterWidth(clusterId, width)
                }
              />
              );
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 130,
            }}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View>
                <MessageInboxFilterBar
                  search={search}
                  onSearchChange={setSearch}
                  zoneFilter={zoneFilter}
                  onZoneFilterChange={setZoneFilter}
                  zoneIds={allZoneIds}
                  zoneNames={zoneNames}
                  typeFilter={typeFilter}
                  onTypeFilterChange={setTypeFilter}
                  typeOptions={inboxTypeOptions}
                  searchPlaceholder="Search messages…"
                  dateFrom={dateFrom}
                  onDateFromChange={setDateFrom}
                  dateTo={dateTo}
                  onDateToChange={setDateTo}
                />
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={loading && !loadingMore}
                onRefresh={() => void refresh()}
                tintColor={colors.accent}
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
                    No messages yet. Tap + to compose a message.
                  </Text>
                </Card>
              )
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
