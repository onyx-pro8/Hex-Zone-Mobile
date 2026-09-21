import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { History } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { MessageInboxFilterBar } from "@/components/messages/MessageInboxFilterBar";
import { InboxMessageCard } from "@/components/messages/InboxMessageCard";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useAuth } from "@/context/AuthContext";
import { getMembers } from "@/api/members";
import { messageAvatarLabel, messageBroadcastLabel } from "@/lib/messageBroadcast";
import { resolveBroadcastName } from "@/lib/appSettings";
import { applyMessageInboxFilters } from "@/lib/messageInboxFilters";
import { sortInboxAccessMessages } from "@/api/messages";
import { useZoneNameLookup } from "@/hooks/useZoneNameLookup";
import { useEnsureFilteredInboxRows } from "@/hooks/useEnsureFilteredInboxRows";
import { useMemberPresence } from "@/hooks/useMemberPresence";
import { useFloatingTabBarInset } from "@/components/navigation/FloatingTabBar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;
type OwnerAvatarMap = Record<number, string>;

export default function AccessHistoryScreen() {
  const router = useRouter();
  const tabBarInset = useFloatingTabBarInset();
  const { user } = useAuth();
  const { isOnline } = useMemberPresence();
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
    pageSize,
  } = useMessagesFeed();
  const { zoneNames } = useZoneNameLookup();
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});
  const [ownerAvatars, setOwnerAvatars] = useState<OwnerAvatarMap>({});
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

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

  const allZoneIds = useMemo(() => {
    const fromMessages = messages
      .filter((m) => m.type === "PERMISSION")
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
        includeTypes: ["PERMISSION"],
        zoneFilter,
        dateFrom,
        dateTo,
        search,
      }),
    [messages, zoneFilter, dateFrom, dateTo, search],
  );

  const sorted = useMemo(() => sortInboxAccessMessages(filtered), [filtered]);

  useEnsureFilteredInboxRows({
    filteredCount: sorted.length,
    pageSize,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    filterKey: `${zoneFilter}|${dateFrom}|${dateTo}|${search}`,
  });

  const onEndReached = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    void loadMore();
  }, [hasMore, loading, loadingMore, loadMore]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Access history"
          subtitle="Guest access permission decisions"
          showBack
          onBack={() => router.replace("/(tabs)/settings")}
        />

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <History size={18} color={colors.accent} />
            <Text
              style={{
                color: colors.text,
                fontSize: 12,
                lineHeight: 18,
                flex: 1,
              }}
            >
              PERMISSION messages from guest access live here so they stay out of
              your Home inbox.
            </Text>
          </Card>
        </View>

        {loading && sorted.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: tabBarInset,
            }}
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
                typeFilter="all"
                onTypeFilterChange={() => undefined}
                typeOptions={[]}
                searchPlaceholder="Search access history…"
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
                  <Text
                    style={{ color: colors.textMuted, textAlign: "center" }}
                  >
                    No permission messages yet.
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
                />
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
