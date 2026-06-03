/**
 * Guest chat (post-approval). Mirrors web `pages/guest/GuestMessages.tsx`.
 *
 * The guest picks a host/admin (peer) in their zone and exchanges CHAT
 * messages. PERMISSION rows from the access workflow are shown read-only.
 * Guests can only SEND the CHAT type. Runs on the stored guest token.
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
import { RefreshCw, Send } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  fetchGuestMe,
  fetchGuestPeers,
  listGuestThreadMessages,
  sendGuestMessage,
  type GuestMessage,
  type GuestPeer,
} from "@/api/guestSession";
import { useAuth } from "@/context/AuthContext";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
} from "@/lib/storage";
import { colors } from "@/theme/colors";

const POLL_MS = 4000;
const THREAD_LIMIT = 80;

export default function GuestMessagesScreen() {
  const router = useRouter();
  const { token: memberToken } = useAuth();
  const params = useLocalSearchParams<{ zone?: string }>();
  const zoneFromParam = String(params.zone ?? "").trim();

  const [checking, setChecking] = useState(true);
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
  const listRef = useRef<FlatList<GuestMessage>>(null);

  const leaveGuest = useCallback(async () => {
    await clearStoredGuestSession();
    router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
  }, [memberToken, router]);

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
        const sessZones = session.zone_ids?.length
          ? session.zone_ids
          : [session.zone_id].filter(Boolean);
        setZones(sessZones);
        setAllowedTypes(
          session.allowed_message_types?.length
            ? session.allowed_message_types
            : ["CHAT"],
        );
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
    void (async () => {
      const me = await fetchGuestMe();
      if (!active) return;
      if (me.unauthorized) {
        await leaveGuest();
        return;
      }
      if (me.data) {
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
    })();
    return () => {
      active = false;
    };
  }, [checking, leaveGuest]);

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
    setPeers(res.data ?? []);
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
  }, [zoneId, peerId, leaveGuest]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!peerId.trim()) return;
    const h = setInterval(() => void loadThread(), POLL_MS);
    return () => clearInterval(h);
  }, [peerId, loadThread]);

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
            title="Guest chat"
            subtitle="Message the zone hosts"
            showBack
            onBack={() => router.replace("/guest/dashboard")}
          />

          <View style={{ paddingHorizontal: 20, gap: 10, flex: 1 }}>
            {zones.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {zones.map((z) => (
                  <Pressable
                    key={z}
                    onPress={() => {
                      setZoneId(z);
                      setPeerId("");
                      setMessages([]);
                    }}
                  >
                    <Chip label={z} active={z === zoneId} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Card style={{ gap: 8 }}>
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
                  Hosts in this zone
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
              ) : peers.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  No hosts are available to chat in this zone yet.
                </Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {peers.map((p) => (
                    <Pressable
                      key={p.owner_id}
                      onPress={() => setPeerId(p.owner_id)}
                    >
                      <Chip
                        label={p.display_name || p.owner_id}
                        active={p.owner_id === peerId}
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>

            <View style={{ flex: 1 }}>
              {!peerId ? (
                <View style={{ paddingTop: 24, alignItems: "center" }}>
                  <Text style={{ color: colors.textDim, fontSize: 13 }}>
                    Select a host to start chatting.
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={messages}
                  keyExtractor={(m) => m.id}
                  contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
                  onContentSizeChange={() =>
                    listRef.current?.scrollToEnd({ animated: true })
                  }
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
                  renderItem={({ item }) => {
                    const isPermission =
                      String(item.type).toUpperCase() === "PERMISSION";
                    return (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: isPermission
                            ? colors.warning
                            : colors.border,
                          backgroundColor: isPermission
                            ? "rgba(245,180,80,0.08)"
                            : colors.bgCard,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textDim,
                            fontSize: 10,
                            letterSpacing: 0.6,
                            textTransform: "uppercase",
                            marginBottom: 2,
                          }}
                        >
                          {item.type}
                          {isPermission ? " · read-only" : ""}
                          {item.created_at ? ` · ${item.created_at}` : ""}
                        </Text>
                        <Text
                          style={{
                            color: isPermission ? colors.warning : colors.text,
                            fontSize: 14,
                          }}
                        >
                          {item.text ?? "—"}
                        </Text>
                      </View>
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
                  paddingVertical: 10,
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
