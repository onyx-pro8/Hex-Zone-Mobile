/**
 * Guest chat (pending + approved). Mirrors web `pages/guest/GuestMessages.tsx`.
 *
 * Guests chat with the network administrator only. PERMISSION rows from the
 * access workflow are shown read-only. Guests can only SEND the CHAT type.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, RefreshCw, Send, ShieldAlert } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import {
  GuestChatBubble,
  guestChatBubbleCluster,
  guestChatClusterRootId,
  guestChatDayLabel,
} from "@/components/messages/GuestChatBubble";
import { useInboxClusterWidths } from "@/components/messages/InboxMessageCard";
import { useGuestRealtime } from "@/hooks/useGuestRealtime";
import {
  fetchGuestMe,
  fetchGuestPeers,
  isOwnGuestChatMessage,
  listGuestThreadMessages,
  sendGuestMessage,
  type GuestMessage,
  type GuestPeer,
} from "@/api/guestSession";
import {
  exchangeGuestSession,
  pollGuestAccessSession,
} from "@/api/guestPublic";
import { useAuth } from "@/context/AuthContext";
import { isAdminGuestPeer } from "@/lib/chatGuestCompose";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
  setStoredGuestSession,
} from "@/lib/storage";
import { colors } from "@/theme/colors";

const POLL_MS = 4000;
const APPROVAL_POLL_MS = 2000;
const THREAD_LIMIT = 80;

function messageLooksApproved(item: GuestMessage): boolean {
  if (String(item.type ?? "").toUpperCase() !== "PERMISSION") return false;
  const text = String(item.text ?? "").toLowerCase();
  return text.includes("approved") || text.includes("access granted");
}

export default function GuestMessagesScreen() {
  const router = useRouter();
  const { token: memberToken } = useAuth();
  const params = useLocalSearchParams<{ zone?: string }>();
  const zoneFromParam = String(params.zone ?? "").trim();

  const [checking, setChecking] = useState(true);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState(zoneFromParam);
  const [allowedTypes, setAllowedTypes] = useState<string[]>(["CHAT"]);
  const [peers, setPeers] = useState<GuestPeer[]>([]);
  const [peersError, setPeersError] = useState<string | null>(null);
  const [loadingPeers, setLoadingPeers] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const promotingRef = useRef(false);
  const { clusterWidths, reportClusterWidth } = useInboxClusterWidths();

  const peerPresenceSeed = useMemo(() => {
    const map: Record<number, boolean> = {};
    for (const p of peers) {
      const id = Number(p.owner_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (typeof p.online === "boolean") map[id] = p.online;
    }
    return map;
  }, [peers]);

  const { isPeerOnline, lastMessage: guestWsMessage } = useGuestRealtime({
    token: guestToken,
    zoneIds: zones.length ? zones : zoneId ? [zoneId] : [],
    enabled: !checking && !!guestToken,
    seedPresence: peerPresenceSeed,
  });

  const leaveGuest = useCallback(async () => {
    await clearStoredGuestSession();
    router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
  }, [memberToken, router]);

  const promoteToApprovedGuest = useCallback(async (opts?: { force?: boolean }) => {
    if (promotingRef.current) return;
    const session = await getStoredGuestSession();
    // Only leave chat when we were still waiting — already-approved guests must stay on messages.
    if (!session?.pending_approval && approvalStatus !== "PENDING") {
      if (opts?.force) setApprovalStatus("APPROVED");
      return;
    }
    promotingRef.current = true;
    try {
      if (!session?.access_token) return;
      const guestId = session.guest_id?.trim() || "";
      const zone =
        zoneId.trim() ||
        session.zone_id?.trim() ||
        session.zone_ids?.[0]?.trim() ||
        "";
      if (!guestId || !zone) {
        if (!opts?.force) return;
        setApprovalStatus("APPROVED");
        await setStoredGuestSession({ ...session, pending_approval: false });
        router.replace("/guest/dashboard");
        return;
      }

      const poll = await pollGuestAccessSession(guestId, zone);
      if (poll.status === "REJECTED") {
        setApprovalStatus("REJECTED");
        return;
      }
      if (poll.status !== "APPROVED" && !opts?.force) return;

      if (poll.status === "APPROVED" && poll.exchange_code?.trim()) {
        const ex = await exchangeGuestSession({
          guest_id: guestId,
          zone_id: zone,
          exchange_code: poll.exchange_code.trim(),
        });
        if (ex.data?.access_token) {
          const allowed = ex.data.guest.allowed_message_types?.length
            ? ex.data.guest.allowed_message_types
            : ["CHAT"];
          const zoneIds = ex.data.guest.zone_ids?.length
            ? ex.data.guest.zone_ids
            : [zone];
          await setStoredGuestSession({
            access_token: ex.data.access_token,
            guest_id: ex.data.guest.guest_id,
            display_name: ex.data.guest.display_name || session.display_name,
            zone_id: zoneIds[0] || zone,
            zone_ids: zoneIds,
            allowed_message_types: allowed,
            pending_approval: false,
            saved_at: Date.now(),
          });
          setGuestToken(ex.data.access_token);
          setApprovalStatus("APPROVED");
          setAllowedTypes(allowed);
          setZones(zoneIds);
          setZoneId(zoneIds[0] || zone);
          if (ex.data.guest.display_name?.trim()) {
            setGuestDisplayName(ex.data.guest.display_name.trim());
          }
          router.replace("/guest/dashboard");
          return;
        }
      }

      if (poll.status === "APPROVED" || opts?.force) {
        setApprovalStatus("APPROVED");
        await setStoredGuestSession({ ...session, pending_approval: false });
        router.replace("/guest/dashboard");
      }
    } finally {
      const still = await getStoredGuestSession();
      if (still?.pending_approval) promotingRef.current = false;
    }
  }, [router, zoneId, approvalStatus]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const session = await getStoredGuestSession();
        if (!active) return;
        if (!session?.access_token) {
          router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
          return;
        }
        setGuestToken(session.access_token);
        const sessZones = session.zone_ids?.length
          ? session.zone_ids
          : [session.zone_id].filter(Boolean);
        setZones(sessZones);
        setAllowedTypes(
          session.allowed_message_types?.length
            ? session.allowed_message_types
            : ["CHAT"],
        );
        if (session.display_name?.trim()) {
          setGuestDisplayName(session.display_name.trim());
        }
        if (session.pending_approval) {
          setApprovalStatus("PENDING");
        } else {
          setApprovalStatus("APPROVED");
        }
        setZoneId(
          (prev) =>
            prev || zoneFromParam || session.zone_id || sessZones[0] || "",
        );
        setChecking(false);
      })();
      return () => {
        active = false;
      };
    }, [memberToken, router, zoneFromParam]),
  );

  useEffect(() => {
    if (checking) return;
    let active = true;
    const applyMe = async () => {
      const me = await fetchGuestMe();
      if (!active) return;
      if (me.unauthorized) {
        await leaveGuest();
        return;
      }
      if (me.data) {
        const approval = String(me.data.approval_status ?? "").toUpperCase();
        if (approval === "PENDING" || approval === "REJECTED") {
          setApprovalStatus(approval);
        }
        if (approval === "APPROVED") {
          const session = await getStoredGuestSession();
          if (session?.pending_approval || approvalStatus === "PENDING") {
            void promoteToApprovedGuest({ force: true });
            return;
          }
          setApprovalStatus("APPROVED");
        }
        if (me.data.display_name.trim()) {
          setGuestDisplayName(me.data.display_name.trim());
        }
        setAllowedTypes(
          me.data.allowed_message_types.length
            ? me.data.allowed_message_types
            : ["CHAT"],
        );
        if (me.data.zone_ids.length) {
          setZones(me.data.zone_ids);
          setZoneId((prev) =>
            prev && me.data!.zone_ids.includes(prev)
              ? prev
              : me.data!.zone_ids[0] ?? prev,
          );
        }
      }
    };
    void applyMe();
    const heartbeat = setInterval(
      () => void applyMe(),
      approvalStatus === "PENDING" ? APPROVAL_POLL_MS : 20000,
    );
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [checking, leaveGuest, approvalStatus, promoteToApprovedGuest]);

  useEffect(() => {
    if (checking || approvalStatus !== "PENDING") return;
    let active = true;
    const tick = async () => {
      const session = await getStoredGuestSession();
      if (!active || !session) return;
      const guestId = session.guest_id?.trim() || "";
      const zone =
        zoneId.trim() ||
        session.zone_id?.trim() ||
        session.zone_ids?.[0]?.trim() ||
        "";
      if (!guestId || !zone) return;
      const poll = await pollGuestAccessSession(guestId, zone);
      if (!active) return;
      if (poll.status === "APPROVED") {
        void promoteToApprovedGuest();
        return;
      }
      if (poll.status === "REJECTED") {
        setApprovalStatus("REJECTED");
      }
    };
    void tick();
    const handle = setInterval(() => void tick(), APPROVAL_POLL_MS);
    return () => {
      active = false;
      clearInterval(handle);
    };
  }, [checking, approvalStatus, zoneId, promoteToApprovedGuest]);

  const guestCanChat = useMemo(() => {
    if (!allowedTypes.length) return true;
    return allowedTypes.map((x) => x.toUpperCase()).includes("CHAT");
  }, [allowedTypes]);

  const loadPeers = useCallback(async () => {
    const z = zoneId.trim();
    if (!z) {
      setPeers([]);
      return;
    }
    setLoadingPeers(true);
    setPeersError(null);
    const res = await fetchGuestPeers(z);
    setLoadingPeers(false);
    if (res.unauthorized) {
      await leaveGuest();
      return;
    }
    if (res.error) {
      setPeersError(res.error);
      setPeers([]);
      return;
    }
    const raw = res.data ?? [];
    const adminPeers = raw.filter((p) => isAdminGuestPeer(p));
    const nextPeers = adminPeers.length ? adminPeers : raw.slice(0, 1);
    setPeers(nextPeers);
    setPeerId((prev) => {
      if (prev && nextPeers.some((p) => p.owner_id === prev)) return prev;
      return nextPeers[0]?.owner_id ?? "";
    });
  }, [zoneId, leaveGuest]);

  useEffect(() => {
    if (checking) return;
    void loadPeers();
  }, [checking, loadPeers]);

  const loadThread = useCallback(async () => {
    const z = zoneId.trim();
    const p = peerId.trim();
    if (!z || !p) {
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    setMsgError(null);
    const res = await listGuestThreadMessages({
      zone_id: z,
      with_owner_id: p,
      limit: THREAD_LIMIT,
    });
    setLoadingThread(false);
    if (res.unauthorized) {
      await leaveGuest();
      return;
    }
    if (res.error) {
      setMsgError(res.error);
      return;
    }
    setMessages(res.data ?? []);
    if (
      approvalStatus === "PENDING" &&
      (res.data ?? []).some((m) => messageLooksApproved(m))
    ) {
      void promoteToApprovedGuest();
    }
  }, [zoneId, peerId, leaveGuest, approvalStatus, promoteToApprovedGuest]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!peerId.trim()) return;
    const h = setInterval(() => void loadThread(), POLL_MS);
    return () => clearInterval(h);
  }, [peerId, loadThread]);

  useEffect(() => {
    if (!guestWsMessage) return;
    try {
      const parsed = JSON.parse(guestWsMessage) as { type?: string };
      if (parsed.type === "guest_zone_message" || parsed.type === "NEW_MESSAGE") {
        void loadThread();
      }
    } catch {
      /* ignore */
    }
  }, [guestWsMessage, loadThread]);

  const onSend = useCallback(async () => {
    const z = zoneId.trim();
    const to = peerId.trim();
    const body = text.trim();
    if (!z || !to || !body) return;
    if (!guestCanChat) {
      setMsgError("Guests can send chat messages only.");
      return;
    }
    setSending(true);
    setMsgError(null);
    const res = await sendGuestMessage({
      zone_id: z,
      text: body,
      to_owner_id: to,
    });
    setSending(false);
    if (res.unauthorized) {
      await leaveGuest();
      return;
    }
    if (res.error) {
      setMsgError(res.error);
      return;
    }
    setText("");
    void loadThread();
  }, [zoneId, peerId, text, guestCanChat, leaveGuest, loadThread]);

  if (checking) {
    return (
      <GradientBackground>
        <SafeAreaView
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.accent} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const selectedPeer = peers.find((p) => p.owner_id === peerId);

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScreenHeader
            title={
              approvalStatus === "PENDING"
                ? "Waiting for approval"
                : "Guest chat"
            }
            subtitle={
              approvalStatus === "PENDING"
                ? "Message the network administrator while you wait"
                : "Message the network administrator"
            }
            showBack={approvalStatus !== "PENDING"}
            onBack={
              approvalStatus === "PENDING"
                ? undefined
                : () => router.replace("/guest/dashboard")
            }
            right={
              approvalStatus === "PENDING" ? (
                <Pressable
                  onPress={() => void leaveGuest()}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                  })}
                >
                  <LogOut size={16} color={colors.textMuted} />
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    Leave
                  </Text>
                </Pressable>
              ) : undefined
            }
          />

          <View style={{ paddingHorizontal: 20, gap: 10, flex: 1 }}>
            {approvalStatus === "PENDING" ? (
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(224,153,42,0.45)",
                  backgroundColor: "rgba(251,239,216,0.9)",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ShieldAlert size={14} color={colors.warning} />
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 12,
                    lineHeight: 16,
                    flex: 1,
                    fontWeight: "600",
                  }}
                >
                  Waiting for approval — you can message the network administrator
                </Text>
              </View>
            ) : null}

            <Card style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    fontWeight: "700",
                  }}
                >
                  Network administrator
                </Text>
                <Pressable
                  onPress={() => void loadPeers()}
                  hitSlop={8}
                  disabled={loadingPeers}
                >
                  <RefreshCw size={14} color={colors.accent} />
                </Pressable>
              </View>
              {loadingPeers ? (
                <ActivityIndicator color={colors.accent} />
              ) : peersError ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {peersError}
                </Text>
              ) : selectedPeer ? (
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                  {selectedPeer.display_name || "Administrator"}
                </Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Connecting to the network administrator…
                </Text>
              )}
            </Card>

            <View style={{ flex: 1, minHeight: 160 }}>
              {!peerId ? (
                <View style={{ paddingTop: 24, alignItems: "center" }}>
                  <Text style={{ color: colors.textDim, fontSize: 13 }}>
                    Connecting to the network administrator…
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={messages}
                  keyExtractor={(m) => m.id}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
                  ListEmptyComponent={
                    loadingThread ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 12,
                          textAlign: "center",
                          marginTop: 16,
                        }}
                      >
                        No messages yet. Say hello to{" "}
                        {selectedPeer?.display_name || "your host"}.
                      </Text>
                    )
                  }
                  renderItem={({ item, index }) => {
                    const prev = messages[index - 1];
                    const next = messages[index + 1];
                    const isMine = isOwnGuestChatMessage(item);
                    const cluster = guestChatBubbleCluster(prev, item, next);
                    const clusterId = guestChatClusterRootId(messages, index);
                    const dayLabel = guestChatDayLabel(prev, item);
                    const peerName =
                      selectedPeer?.display_name?.trim() ||
                      item.from_owner_id ||
                      "Host";
                    const peerOwnerId = (
                      item.from_owner_id ??
                      peerId
                    ).trim();
                    return (
                      <GuestChatBubble
                        item={item}
                        userName={isMine ? "ME" : peerName}
                        avatarName={isMine ? guestDisplayName : peerName}
                        zoneLabel={item.zone_id || zoneId || "—"}
                        dayLabel={dayLabel}
                        cluster={cluster}
                        online={isMine || isPeerOnline(peerOwnerId)}
                        clusterMinWidth={
                          cluster === "single"
                            ? undefined
                            : clusterWidths[clusterId]
                        }
                        onBubbleWidth={
                          cluster === "single"
                            ? undefined
                            : (width) => reportClusterWidth(clusterId, width)
                        }
                      />
                    );
                  }}
                />
              )}
              {msgError ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {msgError}
                </Text>
              ) : null}
            </View>

            {peerId ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingBottom: 10,
                }}
              >
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Write a message…"
                  placeholderTextColor={colors.textDim}
                  style={{
                    flex: 1,
                    backgroundColor: colors.bgCard,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: colors.text,
                    fontSize: 14,
                  }}
                  onSubmitEditing={() => void onSend()}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={() => void onSend()}
                  disabled={sending || !text.trim() || !guestCanChat}
                  style={{
                    backgroundColor: colors.accent,
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: sending || !text.trim() || !guestCanChat ? 0.5 : 1,
                  }}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <Send size={18} color={colors.bg} />
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
