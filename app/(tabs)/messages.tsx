import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import {
  BellRing,
  HeartPulse,
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
import { AlertBellButton } from "@/components/ui/AlertBellButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useZoneNameLookup } from "@/hooks/useZoneNameLookup";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { sendMessage, type Message } from "@/api/messages";
import {
  propagateMessageFeatureMessage,
  acknowledgeWellnessCheck,
  askWellnessSender,
  listWellnessAcknowledgements,
  replyToWellnessAsks,
  searchPrivateMessageRecipients,
  type PrivateSearchMember,
} from "@/api/messageFeature";
import { getMembers } from "@/api/members";
import { listGuestRequests } from "@/api/guest";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { presentLocalMessageNotification } from "@/lib/notifications";
import {
  privateLocationStatusMessage,
  type PrivateLocationStatus,
} from "@/lib/privateMessageLocation";
import { messagePositionSourceLabel, resolveMessagePropagationPositionForType } from "@/lib/messagePosition";
import { getOrCreateDeviceHid } from "@/lib/storage";
import { isRunningExpoGo } from "@/lib/pushSupport";
import {
  getMessageScopeForType,
  getMessageTypeCategory,
  groupMessageTypesForUI,
  isAccessGuestChannelType,
  isPrivateMessageType,
  toMessageType,
  toMessageTypeLabel,
  usesGeoPropagationMessageType,
  type MessageType,
} from "@/lib/messageTypes";
import {
  applyMessageInboxFilters,
  messageTypesForCategories,
} from "@/lib/messageInboxFilters";
import {
  resolveBroadcastName,
  useAppSettings,
  type QuickMessageType,
} from "@/lib/appSettings";
import { messageBroadcastLabel } from "@/lib/messageBroadcast";
import { messageZoneLabel, type ZoneNameLookup } from "@/lib/messageZoneLabel";
import {
  formatMessageCoordinatesLabel,
  messageCoordinatesMapsUrl,
} from "@/lib/messageCoordinates";
import { subscribeWellnessAck } from "@/lib/messageSocket";
import {
  getMessageWorkflow,
  isEmergencyMessageType,
  isUnknownMessageType,
  isServiceMessageType,
  SERVICE_MESSAGE_UI,
  UNKNOWN_MESSAGE_UI,
} from "@/lib/messageWorkflow";
import {
  SERVICE_PA_TOPICS,
  buildServicePaMsgPayload,
  getTopicOption,
  isServicePaMessageType,
  serviceTopicRequiresSubtopic,
  validateServicePaCompose,
  type ServicePaComposeFields,
} from "@/lib/servicePaTopics";
import { colors } from "@/theme/colors";

type OwnerNameMap = Record<number, string>;

function WellnessAckInline({
  messageEventId,
  selfOwnerId,
  senderId,
}: {
  messageEventId: string;
  selfOwnerId: number | null;
  senderId: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [canAck, setCanAck] = useState(false);
  const [acked, setAcked] = useState(false);
  const [canAskSender, setCanAskSender] = useState(false);
  const [waitingForSender, setWaitingForSender] = useState(false);
  const [canReplyAsSender, setCanReplyAsSender] = useState(false);
  const [senderReplyText, setSenderReplyText] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [pendingAskCount, setPendingAskCount] = useState(0);

  const load = useCallback(async () => {
    const res = await listWellnessAcknowledgements(messageEventId);
    if (res.error || !res.data) return;
    const data = res.data;
    setSummaryText(
      `${data.acknowledgements.length}/${data.expected_recipient_ids.length} responded`,
    );
    const mine = data.acknowledgements.some(
      (row) => row.owner_id === selfOwnerId,
    );
    setAcked(mine);
    const isExpected =
      selfOwnerId != null && data.expected_recipient_ids.includes(selfOwnerId);
    setCanAck(isExpected && !mine);
    const pendingAskFromMe =
      selfOwnerId != null &&
      data.pending_sender_asks.some((row) => row.asker_owner_id === selfOwnerId);
    setCanAskSender(isExpected && !pendingAskFromMe);
    setWaitingForSender(Boolean(pendingAskFromMe));
    const isSender = selfOwnerId != null && senderId === selfOwnerId;
    setCanReplyAsSender(isSender && data.pending_sender_asks.length > 0);
    setPendingAskCount(data.pending_sender_asks.length);
    const latestReply =
      selfOwnerId != null && !isSender
        ? [...data.sender_replies]
            .reverse()
            .find((row) => row.answered_asker_ids.includes(selfOwnerId))
        : null;
    setSenderReplyText(
      latestReply
        ? `Sender replied: ${latestReply.status === "need_help" ? "Needs help" : "OK"}`
        : null,
    );
  }, [messageEventId, selfOwnerId, senderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribeWellnessAck((id) => {
      if (id === messageEventId) void load();
    });
    return unsubscribe;
  }, [load, messageEventId]);

  const submit = async (status: "ok" | "need_help") => {
    setBusy(true);
    const res = await acknowledgeWellnessCheck(messageEventId, { status });
    setBusy(false);
    if (res.error || !res.data) return;
    await load();
  };

  const askSender = async () => {
    setBusy(true);
    const res = await askWellnessSender(messageEventId);
    setBusy(false);
    if (res.error || !res.data) return;
    await load();
  };

  const replyAsSender = async (status: "ok" | "need_help") => {
    setBusy(true);
    const res = await replyToWellnessAsks(messageEventId, { status });
    setBusy(false);
    if (res.error || !res.data) return;
    await load();
  };

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {summaryText ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {summaryText}
        </Text>
      ) : null}
      {canAck ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            disabled={busy}
            onPress={() => void submit("ok")}
            style={{
              backgroundColor: colors.success,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
              I&apos;m OK
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void submit("need_help")}
            style={{
              backgroundColor: colors.danger,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
              Need help
            </Text>
          </Pressable>
        </View>
      ) : null}
      {acked ? (
        <Text
          style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}
        >
          You acknowledged this wellness check.
        </Text>
      ) : null}
      {canAskSender ? (
        <Pressable
          disabled={busy}
          onPress={() => void askSender()}
          style={{
            alignSelf: "flex-start",
            borderWidth: 1,
            borderColor: colors.warning,
            backgroundColor: "#fff",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.warning, fontWeight: "700", fontSize: 12 }}>
            Ask sender to respond
          </Text>
        </Pressable>
      ) : null}
      {waitingForSender ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Waiting for the sender to respond to your ask.
        </Text>
      ) : null}
      {senderReplyText ? (
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
          {senderReplyText}
        </Text>
      ) : null}
      {canReplyAsSender ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {pendingAskCount} member(s) asked you to respond. One reply answers all
            pending asks.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              disabled={busy}
              onPress={() => void replyAsSender("ok")}
              style={{
                backgroundColor: colors.success,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                I&apos;m OK
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void replyAsSender("need_help")}
              style={{
                backgroundColor: colors.danger,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                Need help
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MessageRow({
  item,
  selfOwnerId,
  selfBroadcastName,
  ownerNames,
  zoneNames,
  highlighted = false,
}: {
  item: Message;
  selfOwnerId: number | null;
  selfBroadcastName: string;
  ownerNames: OwnerNameMap;
  zoneNames?: ZoneNameLookup;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const isUnknown = isUnknownMessageType(item.type);
  const isService = isServiceMessageType(item.type);
  const tone = isUnknown
    ? "critical"
    : isService
      ? "service"
      : item.category === "Alarm"
        ? "danger"
        : item.category === "Access"
          ? "warning"
          : "default";

  const broadcast = messageBroadcastLabel(item, {
    selfOwnerId,
    selfBroadcastName,
    resolveOwnerName: (id) => ownerNames[id] ?? null,
  });

  const privateCounterpartId =
    item.type === "PRIVATE" && selfOwnerId != null
      ? item.sender_id != null && item.sender_id !== selfOwnerId
        ? item.sender_id
        : item.receiver_id != null && item.receiver_id !== selfOwnerId
          ? item.receiver_id
          : null
      : null;

  return (
    <Card
      style={{
        marginBottom: 10,
        ...(highlighted
          ? {
              borderColor: colors.accent,
              borderWidth: 2,
            }
          : null),
        ...(isUnknown
          ? {
              borderColor: UNKNOWN_MESSAGE_UI.border,
              backgroundColor: UNKNOWN_MESSAGE_UI.surface,
            }
          : isService
            ? {
                borderColor: SERVICE_MESSAGE_UI.border,
                backgroundColor: SERVICE_MESSAGE_UI.surface,
              }
            : null),
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
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <Chip label={toMessageTypeLabel(item.type)} tone={tone} />
          {item.type !== "PA" && item.topic_label ? (
            <Chip label={item.topic_label} tone="warning" />
          ) : null}
          {(() => {
            const mapsUrl = messageCoordinatesMapsUrl(item);
            const label = formatMessageCoordinatesLabel(item);
            if (mapsUrl) {
              return (
                <Pressable
                  onPress={() => void Linking.openURL(mapsUrl)}
                  accessibilityRole="link"
                  accessibilityLabel="Open sender location in maps"
                >
                  <Chip label={label} active />
                </Pressable>
              );
            }
            return <Chip label={label} tone="muted" />;
          })()}
        </View>
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>
      <Text
        style={{
          color: isUnknown
            ? UNKNOWN_MESSAGE_UI.title
            : isService
              ? SERVICE_MESSAGE_UI.title
              : colors.text,
          fontSize: item.subject ? 17 : isUnknown || isService ? 18 : 16,
          fontWeight: "800",
          marginTop: 10,
        }}
      >
        {item.subject || broadcast}
      </Text>
      {item.subject ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
          {broadcast}
        </Text>
      ) : null}
      {item.message && item.message !== item.subject ? (
        <Text
          style={{
            color: isUnknown
              ? UNKNOWN_MESSAGE_UI.body
              : isService
                ? SERVICE_MESSAGE_UI.body
                : colors.text,
            fontSize: isUnknown || isService ? 17 : 15,
            fontWeight: isUnknown || isService ? "700" : "500",
            marginTop: 4,
            lineHeight: 22,
          }}
        >
          {item.message}
        </Text>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
        {messageZoneLabel(item, { viewerOwnerId: selfOwnerId, zoneNames })}
        {item.guest_id ? ` · guest ${String(item.guest_id).slice(0, 8)}…` : ""}
      </Text>
      {item.type === "WELLNESS_CHECK" ? (
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
            marginTop: 10,
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
  { type: "WELLNESS_CHECK", label: "WELLNESS CHECK", icon: HeartPulse, tone: "alarm" },
];

const MESSAGING_ACTIONS: QuickAction[] = [
  {
    type: "PRIVATE",
    label: "PRIVATE MESSAGE",
    icon: MessageSquare,
    tone: "messaging",
  },
  {
    type: "PA",
    label: "PUBLIC ANNOUNCEMENT",
    icon: Megaphone,
    tone: "messaging",
  },
  { type: "SERVICE", label: "SERVICES", icon: Wrench, tone: "messaging" },
];

function QuickActionButton({
  action,
  onPress,
  disabled,
  sending,
}: {
  action: QuickAction;
  onPress: () => void;
  disabled: boolean;
  sending: boolean;
}) {
  const Icon = action.icon;
  const isAlarm = action.tone === "alarm";
  const isUnknown = isUnknownMessageType(action.type as MessageType);
  const isService = isServiceMessageType(action.type as MessageType);
  const urgent = isEmergencyMessageType(action.type as MessageType);
  const bg = isUnknown
    ? UNKNOWN_MESSAGE_UI.badge
    : isService
      ? SERVICE_MESSAGE_UI.badge
      : urgent
        ? colors.danger
        : isAlarm
          ? "#FCE7EA"
          : "#FBEFD8";
  const border = isUnknown
    ? UNKNOWN_MESSAGE_UI.border
    : isService
      ? SERVICE_MESSAGE_UI.border
      : urgent
        ? colors.danger
        : isAlarm
          ? "#F3C2CA"
          : "#F0DBB0";
  const fg =
    isUnknown || isService || urgent
      ? "#fff"
      : isAlarm
        ? colors.danger
        : colors.warning;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
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
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {sending ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Icon size={28} color={fg} />
      )}
      <Text
        style={{
          color: fg,
          fontSize: 13,
          fontWeight: "800",
          letterSpacing: 0.5,
          textAlign: "center",
        }}
      >
        {sending ? "Sending…" : action.label}
      </Text>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ type?: string; message?: string }>();
  const isAdministrator = useIsAdmin();
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
  const { zoneNames } = useZoneNameLookup();
  const { pushToken, permissionError } = useNotifications();
  const [typeFilter, setTypeFilter] = useState<"all" | MessageType>("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<MessageType>("PA");
  const [composeReceiverId, setComposeReceiverId] = useState("");
  const [draft, setDraft] = useState("");
  const [composeServicePaFields, setComposeServicePaFields] =
    useState<ServicePaComposeFields>({ subject: "", topic: "", subtopic: "" });
  const [sending, setSending] = useState(false);
  const [composeStatus, setComposeStatus] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  const [quickBusy, setQuickBusy] = useState<QuickMessageType | null>(null);
  const [members, setMembers] = useState<
    { id: number; name: string; zoneId: string }[]
  >([]);
  const [privateSearchQuery, setPrivateSearchQuery] = useState("");
  const [privateSearchResults, setPrivateSearchResults] = useState<
    PrivateSearchMember[]
  >([]);
  const [privateSearchLoading, setPrivateSearchLoading] = useState(false);
  const [senderZoneIds, setSenderZoneIds] = useState<string[]>([]);
  const [privateLocationStatus, setPrivateLocationStatus] =
    useState<PrivateLocationStatus | null>(null);
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
  const visibleMessagingActions = MESSAGING_ACTIONS;
  const composeWorkflow = getMessageWorkflow(composeType);

  useEffect(() => {
    const typeParam =
      typeof searchParams.type === "string" ? searchParams.type.trim() : "";
    const messageParam =
      typeof searchParams.message === "string" ? searchParams.message.trim() : "";
    if (typeParam) {
      const resolved = toMessageType(typeParam);
      if (resolved && getMessageTypeCategory(resolved) !== "Alarm") {
        setTypeFilter(resolved);
      }
    }
    if (messageParam) setHighlightMessageId(messageParam);
  }, [searchParams.type, searchParams.message]);

  const confirmEmergencySend = useCallback(
    (type: MessageType): Promise<boolean> =>
      new Promise((resolve) => {
        if (!isEmergencyMessageType(type)) {
          resolve(true);
          return;
        }
        Alert.alert(
          "Emergency alert",
          `${toMessageTypeLabel(type)} uses your current location. Inside the admin primary zone, all invited members and the administrator are notified; outside the primary zone, no one receives it. Block filters are bypassed.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Send",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ],
        );
      }),
    [],
  );

  const inboxTypeOptions = useMemo(
    () => messageTypesForCategories(["Alert", "Access"]),
    [],
  );

  const allZoneIds = useMemo(() => {
    const fromMessages = messages
      .filter((m) => m.category !== "Alarm")
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
        zoneFilter,
        typeFilter,
        dateFrom,
        dateTo,
        search,
      }),
    [messages, zoneFilter, typeFilter, dateFrom, dateTo, search],
  );

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
    void (
      composeZoneId
        ? listGuestRequests(composeZoneId)
        : Promise.resolve({ data: [], error: null, loading: false })
    )
      .then((guestsRes) => {
        if (!active) return;
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
  }, [composeOpen, composeZoneId]);

  useEffect(() => {
    if (!composeOpen || !isPrivateMessageType(composeType)) {
      if (!isPrivateMessageType(composeType)) {
        setSenderZoneIds([]);
        setPrivateLocationStatus(null);
        setPrivateSearchResults([]);
      }
      return;
    }

    let active = true;
    setPrivateSearchLoading(true);
    const debounceMs = privateSearchQuery.trim().length >= 2 ? 300 : 0;
    const timer = setTimeout(() => {
      void (async () => {
        const resolved = await resolveMessagePropagationPositionForType(
          "PRIVATE",
          user?.mapCenter ?? user?.map_center ?? null,
        );
        const position = "error" in resolved ? undefined : resolved.position;
        const result = await searchPrivateMessageRecipients(
          privateSearchQuery,
          position,
        );
        if (!active) return;
        setPrivateSearchLoading(false);
        setSenderZoneIds(result.data?.zone_ids ?? []);
        setPrivateLocationStatus(result.data?.location_status ?? null);
        setPrivateSearchResults(result.data?.members ?? []);
      })();
    }, debounceMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    composeOpen,
    composeType,
    privateSearchQuery,
    user?.mapCenter,
    user?.map_center,
  ]);

  useEffect(() => {
    setComposeReceiverId("");
    setComposeStatus("");
    setPrivateSearchQuery("");
    setPrivateSearchResults([]);
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
      if (isPrivateMessageType(type as MessageType)) {
        setComposeType(type as MessageType);
        setDraft((settings.quickMessages[type] ?? "").trim());
        setComposeOpen(true);
        return;
      }
      if (!(await confirmEmergencySend(type as MessageType))) return;
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
        const resolved = await resolveMessagePropagationPositionForType(
          type as MessageType,
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
        setQuickStatus(
          `${toMessageTypeLabel(type as MessageType)} sent · ${messagePositionSourceLabel(resolved.source)}`,
        );
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
      confirmEmergencySend,
    ],
  );

  const openCompose = useCallback((type: MessageType) => {
    setComposeType(type);
    setDraft("");
    setComposeServicePaFields({ subject: "", topic: "", subtopic: "" });
    setComposeStatus("");
    setComposeOpen(true);
  }, []);

  const onSend = useCallback(async () => {
    if (sending) return;
    const text = draft.trim();
    const servicePaValidation = validateServicePaCompose(
      composeType,
      composeServicePaFields,
      text,
    );
    if (servicePaValidation) {
      setComposeStatus(servicePaValidation);
      return;
    }
    if (!text && !isServicePaMessageType(composeType)) return;

    if (!(await confirmEmergencySend(composeType))) return;

    const accessGuest = isAccessGuestChannelType(composeType);
    if (accessGuest && !composeReceiverId.trim()) {
      setComposeStatus("Select a guest for Access CHAT.");
      return;
    }
    if (
      !accessGuest &&
      isPrivateMessageType(composeType) &&
      !composeReceiverId
    ) {
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
      setComposeStatus("Your account has no network id; cannot message guests.");
      return;
    }

    setSending(true);
    setComposeStatus("Sending…");
    try {
      if (usesGeoPropagationMessageType(composeType)) {
        const resolved = await resolveMessagePropagationPositionForType(
          composeType,
          user?.mapCenter ?? user?.map_center ?? null,
        );
        if ("error" in resolved) throw new Error(resolved.error);
        const hid = await getOrCreateDeviceHid();
        const result = await propagateMessageFeatureMessage({
          type: composeType,
          hid,
          msg: isServicePaMessageType(composeType)
            ? buildServicePaMsgPayload(composeServicePaFields, text, {
                broadcast_name: selfBroadcastName,
              })
            : { description: text, broadcast_name: selfBroadcastName },
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
              body.zone_id ?? body.zone_ids?.[0] ?? composeZoneId ?? undefined,
          });
        }
        setDraft("");
        setComposeServicePaFields({ subject: "", topic: "", subtopic: "" });
        setComposeOpen(false);
        setComposeStatus(`Sent · ${messagePositionSourceLabel(resolved.source)}`);
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
    composeServicePaFields,
    confirmEmergencySend,
    sending,
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
              disabled={!!quickBusy}
              sending={quickBusy === action.type}
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
          {visibleMessagingActions.map((action) => (
            <QuickActionButton
              key={action.type}
              action={action}
              disabled={false}
              sending={false}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <AlertBellButton />
              {isAdministrator ? (
                <Pressable
                  onPress={() =>
                    router.push("/(tabs)/emergency-log" as unknown as Href)
                  }
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
                  <Siren size={20} color={colors.danger} />
                </Pressable>
              ) : null}
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
            </View>
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
                zoneNames={zoneNames}
                highlighted={highlightMessageId === item.id}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            ListHeaderComponent={
              <View>
                {renderQuickActions()}
                <Card style={{ marginBottom: 14, gap: 12 }}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search messages…"
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
                      {inboxTypeOptions.map((option) => (
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
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
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
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        to
                      </Text>
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

              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 420 }}
              >
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
                        onPress={() => {
                          setComposeType(opt.type);
                          setComposeServicePaFields({
                            subject: "",
                            topic: "",
                            subtopic: "",
                          });
                        }}
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
                {composeWorkflow ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bgCard,
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {toMessageTypeLabel(composeType)} workflow
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {composeWorkflow.description}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: 11 }}>
                      {composeWorkflow.delivery}
                    </Text>
                  </View>
                ) : null}

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
                      Same location send flow as PANIC or PA: search admin and
                      members reachable in this zone, then pick one recipient.
                      You cannot select yourself.
                    </Text>
                    {privateSearchLoading && privateLocationStatus === null ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : privateLocationStatusMessage(privateLocationStatus) ? (
                      <Text style={{ color: colors.textDim, fontSize: 12 }}>
                        {privateLocationStatusMessage(privateLocationStatus)}
                      </Text>
                    ) : (
                      <>
                        <TextInput
                          placeholder="Name or email"
                          placeholderTextColor={colors.textDim}
                          value={privateSearchQuery}
                          onChangeText={(text) => {
                            setPrivateSearchQuery(text);
                            setComposeReceiverId("");
                          }}
                          style={{
                            backgroundColor: colors.bgCard,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 12,
                            padding: 12,
                            color: colors.text,
                            fontSize: 15,
                          }}
                        />
                        {privateSearchLoading ? (
                          <ActivityIndicator color={colors.accent} />
                        ) : null}
                        {privateSearchResults.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() => {
                              setComposeReceiverId(String(m.id));
                              setPrivateSearchQuery(m.display_name);
                            }}
                          >
                            <Chip
                              label={`${m.display_name} — ${m.subtitle || m.email}`}
                              active={composeReceiverId === String(m.id)}
                              style={{ marginBottom: 6 }}
                            />
                          </Pressable>
                        ))}
                        {privateSearchQuery.trim().length >= 2 &&
                        !privateSearchLoading &&
                        privateSearchResults.length === 0 ? (
                          <Text style={{ color: colors.textDim, fontSize: 12 }}>
                            No members matched.
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}

                {isServicePaMessageType(composeType) ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {composeType === "SERVICE"
                        ? "Service listing"
                        : "Public announcement"}
                    </Text>
                    <TextInput
                      placeholder="Subject"
                      placeholderTextColor={colors.textDim}
                      value={composeServicePaFields.subject}
                      onChangeText={(subject) =>
                        setComposeServicePaFields((prev) => ({
                          ...prev,
                          subject,
                        }))
                      }
                      maxLength={200}
                      style={{
                        backgroundColor: colors.bgCard,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 12,
                        color: colors.text,
                        fontSize: 15,
                      }}
                    />
                    {composeType === "SERVICE" ? (
                      <>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          Topic
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          {SERVICE_PA_TOPICS.map((topic) => (
                            <Pressable
                              key={topic.id}
                              onPress={() =>
                                setComposeServicePaFields((prev) => ({
                                  ...prev,
                                  topic: topic.id,
                                  subtopic: "",
                                }))
                              }
                              style={{ marginRight: 8 }}
                            >
                              <Chip
                                label={topic.label}
                                active={composeServicePaFields.topic === topic.id}
                              />
                            </Pressable>
                          ))}
                        </ScrollView>
                        {serviceTopicRequiresSubtopic(
                          composeType,
                          composeServicePaFields.topic,
                        ) ? (
                          <>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              Products subtopic
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                            >
                              {(
                                getTopicOption(composeServicePaFields.topic)
                                  ?.subtopics ?? []
                              ).map((subtopic) => (
                                <Pressable
                                  key={subtopic.id}
                                  onPress={() =>
                                    setComposeServicePaFields((prev) => ({
                                      ...prev,
                                      subtopic: subtopic.id,
                                    }))
                                  }
                                  style={{ marginRight: 8 }}
                                >
                                  <Chip
                                    label={subtopic.label}
                                    active={
                                      composeServicePaFields.subtopic ===
                                      subtopic.id
                                    }
                                  />
                                </Pressable>
                              ))}
                            </ScrollView>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ) : null}

                <TextInput
                  placeholder={
                    isServicePaMessageType(composeType)
                      ? "Message body…"
                      : "Type your message…"
                  }
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
