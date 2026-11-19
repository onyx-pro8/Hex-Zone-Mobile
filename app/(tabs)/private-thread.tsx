import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { useBottomSafeInset } from "@/hooks/useBottomSafeInset";
import { useAuth } from "@/context/AuthContext";
import {
  getPrivateThread,
  propagateMessageFeatureMessage,
  type PrivateThreadMessage,
} from "@/api/messageFeature";
import { resolveMessagePropagationPositionForType } from "@/lib/messagePosition";
import { resolveBroadcastName } from "@/lib/appSettings";
import { getOrCreateDeviceHid } from "@/lib/storage";
import { formatServerDateTime } from "@/lib/serverDate";
import { parseMessageFeatureSocketEvent } from "@/lib/messageSocket";
import { useWebSocket } from "@/hooks/useWebSocket";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

export default function PrivateThreadScreen() {
  const router = useRouter();
  const { user, token, ownerZoneId } = useAuth();
  const bottomInset = useBottomSafeInset();
  const params = useLocalSearchParams<{
    otherOwnerId?: string;
    selfOwnerId?: string;
  }>();
  const otherOwnerId = Number(params.otherOwnerId);
  const selfOwnerId = Number(params.selfOwnerId);
  const selfRealName =
    (user?.name ?? "").trim() ||
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const selfBroadcastName = resolveBroadcastName(selfRealName || user?.name);

  const [messages, setMessages] = useState<PrivateThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(otherOwnerId) || otherOwnerId <= 0) {
      toast.error("Missing conversation participant.");
      return;
    }
    setLoading(true);
    const result = await getPrivateThread(otherOwnerId);
    if (result.error) {
      toast.error(result.error);
      setMessages([]);
    } else {
      setMessages(result.data ?? []);
    }
    setLoading(false);
  }, [otherOwnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const zoneId =
    ownerZoneId?.trim() || String(user?.zoneId ?? user?.zone_id ?? "").trim();
  const { lastMessage } = useWebSocket({
    token,
    zoneIds: zoneId ? [zoneId] : [],
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!lastMessage) return;
    const event = parseMessageFeatureSocketEvent(lastMessage);
    if (!event) return;
    if (event.type !== "NEW_GEO_MESSAGE" && event.type !== "NEW_MESSAGE") return;
    void load();
  }, [lastMessage, load]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!Number.isFinite(otherOwnerId) || otherOwnerId <= 0) {
      toast.error("Missing conversation participant.");
      return;
    }
    setSending(true);
    try {
      const resolved = await resolveMessagePropagationPositionForType(
        "PRIVATE",
        user?.mapCenter ?? user?.map_center ?? null,
      );
      const hid = await getOrCreateDeviceHid();
      const result = await propagateMessageFeatureMessage({
        type: "PRIVATE",
        hid,
        msg: {
          description: text,
          broadcast_name: selfBroadcastName,
          receiver_id: otherOwnerId,
        },
        ...("error" in resolved ? {} : { position: resolved.position }),
        receiver_owner_id: otherOwnerId,
      });
      if (result.error) throw new Error(result.error);
      if (result.data?.skipped) {
        throw new Error(result.data.reason || "Message was not delivered.");
      }
      setDraft("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, otherOwnerId, user, selfBroadcastName, load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScreenHeader
            title="Private thread"
            subtitle={
              Number.isFinite(otherOwnerId)
                ? `Conversation with member ${otherOwnerId}`
                : undefined
            }
            showBack
            onBack={() => router.back()}
          />

          {loading && messages.length === 0 ? (
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={() => void load()} />
              }
              ListEmptyComponent={
                <Card>
                  <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                    No private messages in this thread yet.
                  </Text>
                </Card>
              }
              renderItem={({ item }) => {
                const mine = item.senderId === selfOwnerId;
                return (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: mine ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        maxWidth: "82%",
                        backgroundColor: mine ? colors.accent : colors.bgCard,
                        borderWidth: mine ? 0 : 1,
                        borderColor: colors.border,
                        borderRadius: 16,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: mine ? "#fff" : colors.text,
                          fontSize: 14,
                          lineHeight: 19,
                        }}
                      >
                        {item.text}
                      </Text>
                      <Text
                        style={{
                          color: mine ? "rgba(255,255,255,0.7)" : colors.textDim,
                          fontSize: 10,
                          marginTop: 4,
                        }}
                      >
                        {formatServerDateTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: Math.max(bottomInset, 12),
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
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
              editable={!sending}
            />
            <Pressable
              onPress={() => void onSend()}
              disabled={sending || !draft.trim()}
              style={{
                backgroundColor: colors.accent,
                width: 46,
                height: 46,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                opacity: sending || !draft.trim() ? 0.5 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Send size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}
