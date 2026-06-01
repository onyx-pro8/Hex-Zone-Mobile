import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BellRing, Plus, Send } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import {
  formatMessageSenderLabel,
  sendMessage,
  type Message,
} from "@/api/messages";
import { propagateMessageFeatureMessage } from "@/api/messageFeature";
import { getMembers } from "@/api/members";
import { listGuestRequests } from "@/api/guest";
import { presentLocalMessageNotification } from "@/lib/notifications";
import { resolveMessagePropagationPosition } from "@/lib/messagePosition";
import { getOrCreateDeviceHid } from "@/lib/storage";
import { isRunningExpoGo } from "@/lib/pushSupport";
import {
  getMessageScopeForType,
  getMessageTypeCategory,
  groupMessageTypesForUI,
  isAccessGuestChannelType,
  isPrivateMessageType,
  toMessageTypeLabel,
  usesGeoPropagationMessageType,
  type MessageCategory,
  type MessageType,
} from "@/lib/messageTypes";
import { colors } from "@/theme/colors";

type Filter = "All" | MessageCategory;

function MessageRow({ item }: { item: Message }) {
  const tone =
    item.category === "Alarm"
      ? "danger"
      : item.category === "Access"
        ? "warning"
        : "default";

  return (
    <Card style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Chip label={item.type} tone={tone} />
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "600",
          marginTop: 10,
          lineHeight: 22,
        }}
      >
        {item.message}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
        Zone {item.zone_id} · {formatMessageSenderLabel(item)}
        {item.guest_id ? ` · guest ${String(item.guest_id).slice(0, 8)}…` : ""}
      </Text>
    </Card>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const {
    messages,
    loading,
    error,
    refresh,
    applyGeoPropagationToInbox,
    ownerId,
    zoneId,
    wsStatus,
  } = useMessagesFeed();
  const { pushToken, permissionError, lastNotification } = useNotifications();
  const [filter, setFilter] = useState<Filter>("All");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<MessageType>("SERVICE");
  const [composeReceiverId, setComposeReceiverId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [composeStatus, setComposeStatus] = useState("");
  const [members, setMembers] = useState<
    { id: number; name: string; zoneId: string }[]
  >([]);
  const [guestOptions, setGuestOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingComposeMeta, setLoadingComposeMeta] = useState(false);

  const composeZoneId = useMemo(
    () => (zoneId?.trim() ? zoneId.trim() : null),
    [zoneId],
  );

  const groupedTypeOptions = useMemo(() => groupMessageTypesForUI(), []);
  const composeTypeOptions = useMemo(
    () =>
      groupedTypeOptions
        .map((group) => ({
          ...group,
          options: group.options.filter((o) => o.type !== "PERMISSION"),
        }))
        .filter((group) => group.options.length > 0),
    [groupedTypeOptions],
  );

  const filtered = useMemo(() => {
    if (filter === "All") return messages;
    return messages.filter((m) => m.category === filter);
  }, [messages, filter]);

  useEffect(() => {
    if (!composeOpen) return;
    let active = true;
    setLoadingComposeMeta(true);
    void Promise.all([
      getMembers(),
      composeZoneId
        ? listGuestRequests(composeZoneId)
        : Promise.resolve({ data: [], error: null, loading: false }),
    ])
      .then(([membersRes, guestsRes]) => {
        if (!active) return;
        const list = membersRes.data ?? [];
        const receivers = list
          .map((row) => {
            const id = Number(row.id);
            if (!Number.isFinite(id) || id <= 0 || id === ownerId) return null;
            const name =
              row.name ||
              `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
              "Member";
            const z = String(row.zone_id ?? "").trim();
            if (composeZoneId && z && z !== composeZoneId) return null;
            return { id, name, zoneId: z };
          })
          .filter((r): r is { id: number; name: string; zoneId: string } =>
            Boolean(r),
          );
        setMembers(receivers);

        const guestRows = guestsRes.data ?? [];
        setGuestOptions(
          guestRows
            .filter((g) => g.approval_status !== "REJECTED")
            .map((g) => ({
              id: g.guest_id,
              label: `${g.guest_name?.trim() || "Guest"} — ${g.guest_id.slice(0, 10)}…`,
            })),
        );
      })
      .finally(() => {
        if (active) setLoadingComposeMeta(false);
      });
    return () => {
      active = false;
    };
  }, [composeOpen, composeZoneId, ownerId]);

  useEffect(() => {
    setComposeReceiverId("");
    setComposeStatus("");
  }, [composeType]);

  useEffect(() => {
    if (composeType !== "PERMISSION") return;
    setComposeType("CHAT");
    setComposeStatus(
      "PERMISSION is system-generated; switched to CHAT for guest messaging.",
    );
  }, [composeType]);

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
      return `Push + inbox sync${ws}`;
    }
    return permissionError ?? "Enable notifications in a dev build for alarms";
  }, [pushToken, permissionError, wsStatus]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    const accessGuest = isAccessGuestChannelType(composeType);
    if (accessGuest && !composeReceiverId.trim()) {
      setComposeStatus("Select a guest for Access CHAT.");
      return;
    }
    if (!accessGuest && isPrivateMessageType(composeType) && !composeReceiverId) {
      setComposeStatus("Select a receiver for private messages.");
      return;
    }

    const parsedReceiverId = Number(composeReceiverId);
    if (
      !accessGuest &&
      isPrivateMessageType(composeType) &&
      (!Number.isFinite(parsedReceiverId) || parsedReceiverId <= 0)
    ) {
      setComposeStatus("Receiver must be a valid member id.");
      return;
    }

    if (accessGuest && !composeZoneId) {
      setComposeStatus("Your account has no zone id; cannot message guests.");
      return;
    }

    setSending(true);
    setComposeStatus("Sending…");
    try {
      if (usesGeoPropagationMessageType(composeType)) {
        const resolved = await resolveMessagePropagationPosition(
          user?.mapCenter ?? user?.map_center ?? null,
        );
        if ("error" in resolved) throw new Error(resolved.error);
        const hid = await getOrCreateDeviceHid();
        const result = await propagateMessageFeatureMessage({
          type: composeType,
          hid,
          msg: { description: text },
          position: resolved.position,
          ...(isPrivateMessageType(composeType)
            ? { receiver_owner_id: parsedReceiverId }
            : {}),
        });
        if (result.error) throw new Error(result.error);
        const body = result.data;
        if (body && !body.skipped && ownerId != null) {
          applyGeoPropagationToInbox({
            ...body,
            sender_id: body.sender_id ?? ownerId,
            zone_id:
              body.zone_id ??
              body.zone_ids?.[0] ??
              composeZoneId ??
              undefined,
          });
        }
        const sourceLabel =
          resolved.source === "gps"
            ? "live GPS"
            : resolved.source === "profile"
              ? "account address"
              : "last map center";
        setDraft("");
        setComposeOpen(false);
        setComposeStatus(`Sent · ${sourceLabel}`);
        await refresh();
        return;
      }

      const result = await sendMessage({
        message: text,
        type: composeType,
        ...(composeZoneId ? { zone_id: composeZoneId } : {}),
        ...(accessGuest && composeReceiverId.trim()
          ? { guest_id: composeReceiverId.trim() }
          : {}),
        ...(!accessGuest && isPrivateMessageType(composeType)
          ? { receiver_id: parsedReceiverId }
          : {}),
      });
      if (result.error) throw new Error(result.error);
      setDraft("");
      setComposeOpen(false);
      await refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not send your message.";
      setComposeStatus(msg);
      await presentLocalMessageNotification({
        title: "Send failed",
        body: msg.slice(0, 120),
        data: { type: "error" },
      });
    } finally {
      setSending(false);
    }
  }, [
    draft,
    composeType,
    composeReceiverId,
    composeZoneId,
    refresh,
    user?.mapCenter,
    user?.map_center,
    applyGeoPropagationToInbox,
    ownerId,
    composeZoneId,
  ]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Messages"
          subtitle={realtimeHint}
          right={
            <Pressable
              onPress={() => setComposeOpen(true)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={22} color="#fff" />
            </Pressable>
          }
        />

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 20,
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          {(["All", "Alarm", "Alert", "Access"] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)}>
              <Chip
                label={f}
                active={filter === f}
                style={{ paddingHorizontal: 14, paddingVertical: 8 }}
              />
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Pressable onPress={() => void refresh()}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <BellRing size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {lastNotification
                    ? "Tap to refresh after notification"
                    : "Pull to refresh inbox"}
                </Text>
                <Text
                  style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}
                >
                  Merged feed: alarms, alerts, access PERMISSION/CHAT, and member
                  messages from GET /messages/
                </Text>
              </View>
            </Card>
          </Pressable>
        </View>

        {error ? (
          <Text
            style={{
              color: colors.danger,
              paddingHorizontal: 20,
              marginBottom: 8,
            }}
          >
            {error}
          </Text>
        ) : null}

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
            renderItem={({ item }) => <MessageRow item={item} />}
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
                  No messages yet. System PERMISSION lines and guest CHAT appear
                  when the server mirrors them into your inbox.
                </Text>
              </Card>
            }
          />
        )}

        <Modal visible={composeOpen} animationType="slide" transparent>
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.65)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: colors.bgElevated,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                gap: 12,
                borderTopWidth: 1,
                borderColor: colors.border,
                maxHeight: "88%",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                Compose message
              </Text>

              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                  }}
                >
                  Message type
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 8, marginBottom: 8 }}
                >
                  {composeTypeOptions.flatMap((group) =>
                    group.options.map((opt) => (
                      <Pressable
                        key={opt.type}
                        onPress={() => setComposeType(opt.type)}
                        style={{ marginRight: 8 }}
                      >
                        <Chip
                          label={opt.label}
                          active={composeType === opt.type}
                        />
                      </Pressable>
                    )),
                  )}
                </ScrollView>

                <Text style={{ color: colors.textDim, fontSize: 12 }}>
                  {getMessageTypeCategory(composeType)} ·{" "}
                  {getMessageScopeForType(composeType)} scope
                  {usesGeoPropagationMessageType(composeType)
                    ? " · uses location propagation"
                    : ""}
                </Text>

                {isAccessGuestChannelType(composeType) ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Guest (zone {composeZoneId ?? "—"})
                    </Text>
                    {loadingComposeMeta ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : guestOptions.length === 0 ? (
                      <Text style={{ color: colors.textDim, fontSize: 12 }}>
                        No active guest requests in this zone.
                      </Text>
                    ) : (
                      guestOptions.map((g) => (
                        <Pressable
                          key={g.id}
                          onPress={() => setComposeReceiverId(g.id)}
                        >
                          <Chip
                            label={g.label}
                            active={composeReceiverId === g.id}
                            style={{ marginBottom: 6 }}
                          />
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}

                {!isAccessGuestChannelType(composeType) &&
                isPrivateMessageType(composeType) ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Receiver (member)
                    </Text>
                    {loadingComposeMeta ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : members.length === 0 ? (
                      <Text style={{ color: colors.textDim, fontSize: 12 }}>
                        No other members in your zone.
                      </Text>
                    ) : (
                      members.map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() => setComposeReceiverId(String(m.id))}
                        >
                          <Chip
                            label={`${m.id} — ${m.name}`}
                            active={composeReceiverId === String(m.id)}
                            style={{ marginBottom: 6 }}
                          />
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}

                <TextInput
                  placeholder="Type your message…"
                  placeholderTextColor={colors.textDim}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  style={{
                    marginTop: 16,
                    minHeight: 100,
                    backgroundColor: colors.bgCard,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                    padding: 14,
                    color: colors.text,
                    fontSize: 15,
                    textAlignVertical: "top",
                  }}
                />

                {composeStatus ? (
                  <Text
                    style={{
                      color: composeStatus.startsWith("Sending")
                        ? colors.textMuted
                        : colors.danger,
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    {composeStatus}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setComposeOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Send"
                  onPress={() => void onSend()}
                  loading={sending}
                  leftIcon={<Send size={16} color="#fff" />}
                  style={{ flex: 1 }}
                  disabled={ownerId == null}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}
