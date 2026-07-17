import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  acknowledgeWellnessCheck,
  askWellnessSender,
  listWellnessAcknowledgements,
  replyToWellnessAsks,
} from "@/api/messageFeature";
import { subscribeWellnessAck } from "@/lib/messageSocket";
import { colors } from "@/theme/colors";

export function WellnessAckInline({
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
