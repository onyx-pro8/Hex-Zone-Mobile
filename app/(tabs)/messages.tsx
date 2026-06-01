import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
import { sendMessage, type Message } from "@/api/messages";
import { presentLocalMessageNotification } from "@/lib/notifications";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { colors } from "@/theme/colors";

type Filter = "All" | "Alarm" | "Alert" | "Access";

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
        Zone {item.zone_id}
        {item.guest_sender_id ? " · Guest" : ""}
      </Text>
    </Card>
  );
}

export default function MessagesScreen() {
  const { messages, loading, error, refresh, ownerId } = useMessagesFeed();
  const { pushToken, permissionError, lastNotification } = useNotifications();
  const [filter, setFilter] = useState<Filter>("All");
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastNotifiedId = useRef<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "All") return messages;
    return messages.filter((m) => m.category === filter);
  }, [messages, filter]);

  useEffect(() => {
    if (!lastNotification) return;
    const notifId = String(
      lastNotification.data?.message_id ??
        lastNotification.data?.id ??
        lastNotification.receivedAt,
    );
    if (lastNotifiedId.current === notifId) return;
    lastNotifiedId.current = notifId;
    void refresh();
  }, [lastNotification, refresh]);

  useEffect(() => {
    const pollMs = isRunningExpoGo() ? 30000 : 45000;
    const interval = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(interval);
  }, [refresh]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const result = await sendMessage({
        message: text,
        type: "CHAT",
      });
      if (result.error) throw new Error(result.error);
      setDraft("");
      setComposeOpen(false);
      await refresh();
      await presentLocalMessageNotification({
        title: "Message sent",
        body: text.slice(0, 120),
        data: { type: "CHAT" },
      });
    } catch (err) {
      await presentLocalMessageNotification({
        title: "Send failed",
        body:
          err instanceof Error ? err.message : "Could not send your message.",
        data: { type: "error" },
      });
    } finally {
      setSending(false);
    }
  }, [draft, refresh]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Messages"
          subtitle={
            pushToken
              ? "Push notifications enabled"
              : permissionError ?? "Connecting…"
          }
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
                  {isRunningExpoGo()
                    ? "Polling inbox (Expo Go)"
                    : "Real-time via push"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {isRunningExpoGo()
                    ? "Expo Go cannot receive remote push on Android. Messages refresh every 30s here; use a development build for push alerts."
                    : "New alarms, alerts and access events arrive as push notifications."}
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
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
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
                  No messages yet. You'll be notified when zone activity
                  arrives.
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
                gap: 16,
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                New message
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                }}
              >
                Message
              </Text>
              <TextInput
                placeholder="Type your message…"
                placeholderTextColor={colors.textDim}
                value={draft}
                onChangeText={setDraft}
                multiline
                style={{
                  marginTop: 8,
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
              <View style={{ flexDirection: "row", gap: 12 }}>
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
