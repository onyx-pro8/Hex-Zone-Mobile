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
import {
  BellRing,
  HelpCircle,
  Megaphone,
  MessageSquare,
  Plus,
  Radar,
  Send,
  Siren,
  Wrench,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { sendMessage, type Message } from "@/api/messages";
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
import {
  resolveBroadcastName,
  useAppSettings,
  type QuickMessageType,
} from "@/lib/appSettings";
import { messageBroadcastLabel } from "@/lib/messageBroadcast";
import { colors } from "@/theme/colors";

type Filter = "All" | MessageCategory;

type OwnerNameMap = Record<number, string>;

function MessageRow({
  item,
  selfOwnerId,
  selfBroadcastName,
  ownerNames,
}: {
  item: Message;
  selfOwnerId: number | null;
  selfBroadcastName: string;
  ownerNames: OwnerNameMap;
}) {
  const tone =
    item.category === "Alarm"
      ? "danger"
      : item.category === "Access"
        ? "warning"
        : "default";

  const broadcast = messageBroadcastLabel(item, {
    selfOwnerId,
    selfBroadcastName,
    resolveOwnerName: (id) => ownerNames[id] ?? null,
  });

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
        <Chip label={toMessageTypeLabel(item.type)} tone={tone} />
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 16,
          fontWeight: "800",
          marginTop: 10,
        }}
      >
        {broadcast}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "500",
          marginTop: 4,
          lineHeight: 22,
        }}
      >
        {item.message}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
        Zone {item.zone_id}
        {item.guest_id ? ` · guest ${String(item.guest_id).slice(0, 8)}…` : ""}
      </Text>
    </Card>
  );
}

type QuickAction = {
  type: QuickMessageType;
  label: string;
  icon: typeof BellRing;
  tone: "alarm" | "messaging";
};

const ALARM_ACTIONS: QuickAction[] = [
  { type: "PANIC", label: "PANIC", icon: BellRing, tone: "alarm" },
  { type: "SENSOR", label: "SENSOR", icon: Radar, tone: "alarm" },
  { type: "NS_PANIC", label: "NS PANIC", icon: Siren, tone: "alarm" },
  { type: "UNKNOWN", label: "UNKNOWN", icon: HelpCircle, tone: "alarm" },
];

const MESSAGING_ACTIONS: QuickAction[] = [
  { type: "PRIVATE", label: "PRIVATE MESSAGE", icon: MessageSquare, tone: "messaging" },
  { type: "PA", label: "PUBLIC ANNOUNCEMENT", icon: Megaphone, tone: "messaging" },
  { type: "SERVICE", label: "SERVICES", icon: Wrench, tone: "messaging" },
];

function QuickActionButton({
  action,
  onPress,
  busy,
}: {
  action: QuickAction;
  onPress: () => void;
  busy: boolean;
}) {
  const Icon = action.icon;
  const isAlarm = action.tone === "alarm";
  const bg = isAlarm ? "#FCE7EA" : "#FBEFD8";
  const border = isAlarm ? "#F3C2CA" : "#F0DBB0";
  const fg = isAlarm ? colors.danger : colors.warning;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon size={28} color={fg} />
      <Text
        style={{
          color: fg,
          fontSize: 13,
          fontWeight: "800",
          letterSpacing: 0.5,
          textAlign: "center",
        }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const settings = useAppSettings();
  const selfBroadcastName = resolveBroadcastName(user?.name);
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
  const { pushToken, permissionError } = useNotifications();
  const [filter, setFilter] = useState<Filter>("All");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<MessageType>("SERVICE");
  const [composeReceiverId, setComposeReceiverId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [composeStatus, setComposeStatus] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  const [quickBusy, setQuickBusy] = useState<QuickMessageType | null>(null);
  const [members, setMembers] = useState<
    { id: number; name: string; zoneId: string }[]
  >([]);
  const [ownerNames, setOwnerNames] = useState<OwnerNameMap>({});
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

  // Load members once so inbox rows can resolve a friendly name for senders
  // that did not embed a broadcast name.
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

  // One-tap quick alert: sends a pre-programmed message via geo propagation.
  const sendQuickAlert = useCallback(
    async (type: QuickMessageType) => {
      if (quickBusy) return;
      const presetText = (settings.quickMessages[type] ?? "").trim();
      if (!presetText) {
        // Types without a preset (e.g. PRIVATE) open the composer instead.
        setComposeType(type as MessageType);
        setDraft("");
        setComposeOpen(true);
        return;
      }
      setQuickBusy(type);
      setQuickStatus(`Sending ${toMessageTypeLabel(type as MessageType)}…`);
      try {
        const resolved = await resolveMessagePropagationPosition(
          user?.mapCenter ?? user?.map_center ?? null,
        );
        if ("error" in resolved) throw new Error(resolved.error);
        const hid = await getOrCreateDeviceHid();
        const result = await propagateMessageFeatureMessage({
          type: type as MessageType,
          hid,
          msg: { description: presetText, broadcast_name: selfBroadcastName },
          position: resolved.position,
        });
        if (result.error) throw new Error(result.error);
        const body = result.data;
        if (body && !body.skipped && ownerId != null) {
          applyGeoPropagationToInbox({
            ...body,
            sender_id: body.sender_id ?? ownerId,
            zone_id:
              body.zone_id ?? body.zone_ids?.[0] ?? composeZoneId ?? undefined,
          });
        }
        setQuickStatus(`${toMessageTypeLabel(type as MessageType)} sent`);
        void refresh();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not send the alert.";
        setQuickStatus(msg);
        await presentLocalMessageNotification({
          title: "Send failed",
          body: msg.slice(0, 120),
          data: { type: "error" },
        });
      } finally {
        setQuickBusy(null);
      }
    },
    [
      quickBusy,
      settings.quickMessages,
      user?.mapCenter,
      user?.map_center,
      selfBroadcastName,
      ownerId,
      applyGeoPropagationToInbox,
      composeZoneId,
      refresh,
    ],
  );

  const openCompose = useCallback((type: MessageType) => {
    setComposeType(type);
    setDraft("");
    setComposeStatus("");
    setComposeOpen(true);
  }, []);

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
          msg: { description: text, broadcast_name: selfBroadcastName },
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
        void refresh();
        return;
      }

      const result = await sendMessage({
        message: text,
        type: composeType,
        broadcast_name: selfBroadcastName,
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
      setComposeStatus("Sent");
      void refresh();
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
    selfBroadcastName,
    applyGeoPropagationToInbox,
    ownerId,
  ]);

  const renderQuickActions = () => (
    <View style={{ paddingHorizontal: 20, marginBottom: 12, gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <BellRing size={18} color={colors.danger} />
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>
            Quick alerts
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {ALARM_ACTIONS.map((action) => (
            <QuickActionButton
              key={action.type}
              action={action}
              busy={quickBusy === action.type}
              onPress={() => void sendQuickAlert(action.type)}
            />
          ))}
        </View>
      </Card>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Megaphone size={18} color={colors.warning} />
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>
            Messaging
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {MESSAGING_ACTIONS.map((action) => (
            <QuickActionButton
              key={action.type}
              action={action}
              busy={false}
              onPress={() => openCompose(action.type as MessageType)}
            />
          ))}
        </View>
        {quickStatus ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {quickStatus}
          </Text>
        ) : null}
      </Card>
    </View>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Messages"
          subtitle={realtimeHint}
          right={
            <Pressable
              onPress={() => openCompose("SERVICE")}
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
            renderItem={({ item }) => (
              <MessageRow
                item={item}
                selfOwnerId={ownerId}
                selfBroadcastName={selfBroadcastName}
                ownerNames={ownerNames}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            ListHeaderComponent={
              <View>
                {renderQuickActions()}
                <View
                  style={{
                    flexDirection: "row",
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
                {error ? (
                  <Text style={{ color: colors.danger, marginBottom: 8 }}>
                    {error}
                  </Text>
                ) : null}
              </View>
            }
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
                  No messages yet. Use a quick alert above or compose a message.
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
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Sending as {selfBroadcastName}
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
