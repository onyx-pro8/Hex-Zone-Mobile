import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import {
  listMessages,
  messageFromGeoPropagation,
  sortInboxAccessMessages,
  type Message,
} from "@/api/messages";
import { shouldShowGeoPropagationInInbox } from "@/lib/messageSocket";
import { listMessageFeatureBlocks, type MessageFeatureBlock } from "@/api/messageFeature";
import { filterMessagesForBlocks } from "@/lib/messageBlocks";
import {
  parseMessageFeatureSocketEvent,
  parseMessageSocketPayload,
} from "@/lib/messageSocket";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { useWebSocket } from "./useWebSocket";

const POLL_INTERVAL_MS = 30_000;

function sortByNewest(list: Message[]) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function mergeSortedInbox(batch: Message[]): Message[] {
  const access = batch.filter((m) => m.category === "Access");
  const general = batch.filter((m) => m.category !== "Access");
  return [...sortInboxAccessMessages(access), ...sortByNewest(general)];
}

export function useMessagesFeed(options?: { limit?: number; zoneIds?: string[] }) {
  const { user, token } = useAuth();
  const { lastNotification } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [blockRules, setBlockRules] = useState<MessageFeatureBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerId = useMemo(() => {
    const raw = user?.id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [user?.id]);

  const zoneIds = useMemo(() => {
    const fromUser = user?.zoneId ?? user?.zone_id;
    const base =
      options?.zoneIds?.filter((z) => z.trim().length > 0) ??
      (fromUser ? [String(fromUser)] : []);
    const fromMessages = messages.map((m) => m.zone_id).filter(Boolean);
    return Array.from(new Set([...base, ...fromMessages]));
  }, [user?.zoneId, user?.zone_id, options?.zoneIds, messages]);

  const blockRulesRef = useRef(blockRules);
  useEffect(() => {
    blockRulesRef.current = blockRules;
  }, [blockRules]);

  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyInboxBatch = useCallback((batch: Message[], blocks: MessageFeatureBlock[]) => {
    const visible = filterMessagesForBlocks(batch, blocks);
    setMessages(mergeSortedInbox(visible));
  }, []);

  const prependInboxMessage = useCallback((incoming: Message) => {
    const blocks = blockRulesRef.current;
    setMessages((prev) => {
      const merged = mergeSortedInbox([
        incoming,
        ...prev.filter((row) => row.id !== incoming.id),
      ]);
      return filterMessagesForBlocks(merged, blocks);
    });
    setError(null);
  }, []);

  const applyGeoPropagationToInbox = useCallback(
    (propagation: Parameters<typeof messageFromGeoPropagation>[0]) => {
      if (ownerId == null) return;
      if (!shouldShowGeoPropagationInInbox(propagation, ownerId)) return;
      const row = messageFromGeoPropagation(propagation);
      if (row) prependInboxMessage(row);
    },
    [ownerId, prependInboxMessage],
  );

  const hydrateInbox = useCallback(async () => {
    if (ownerId == null || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [messagesResult, blocksResult] = await Promise.all([
        listMessages({
          owner_id: ownerId,
          skip: 0,
          limit: options?.limit ?? 100,
        }),
        listMessageFeatureBlocks(),
      ]);
      // Auth gone: AuthContext will redirect to login; do not surface error.
      if (messagesResult.unauthorized || blocksResult.unauthorized) return;
      const rules = blocksResult.error
        ? blockRulesRef.current
        : (blocksResult.data ?? []);
      if (!blocksResult.error) {
        setBlockRules(rules);
      }
      if (messagesResult.error) {
        setError(messagesResult.error);
        return;
      }
      applyInboxBatch(messagesResult.data ?? [], rules);
    } finally {
      setLoading(false);
    }
  }, [ownerId, token, options?.limit, applyInboxBatch]);

  const scheduleInboxRefetchFromSocket = useCallback(() => {
    if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    refetchDebounceRef.current = setTimeout(() => {
      void hydrateInbox();
    }, 400);
  }, [hydrateInbox]);

  const wsEnabled = Boolean(token) && !isRunningExpoGo();
  const { lastMessage, status: wsStatus } = useWebSocket({
    token,
    zoneIds,
    enabled: wsEnabled,
  });

  useEffect(() => {
    if (!lastMessage) return;
    const geoEvent = parseMessageFeatureSocketEvent(lastMessage);
    if (geoEvent?.type === "NEW_GEO_MESSAGE") {
      applyGeoPropagationToInbox(geoEvent.data);
      return;
    }
    const row = parseMessageSocketPayload(lastMessage);
    if (row) {
      prependInboxMessage(row);
      scheduleInboxRefetchFromSocket();
      return;
    }
    try {
      const parsed = JSON.parse(lastMessage) as { type?: string };
      if (
        parsed.type === "PERMISSION_MESSAGE" ||
        parsed.type === "unexpected_guest" ||
        parsed.type === "guest_is_here"
      ) {
        scheduleInboxRefetchFromSocket();
      }
    } catch {
      /* ignore */
    }
  }, [
    lastMessage,
    applyGeoPropagationToInbox,
    prependInboxMessage,
    scheduleInboxRefetchFromSocket,
  ]);

  useEffect(() => {
    void hydrateInbox();
  }, [hydrateInbox]);

  useEffect(() => {
    if (!lastNotification) return;
    void hydrateInbox();
  }, [lastNotification, hydrateInbox]);

  useEffect(() => {
    if (ownerId == null || !token) return;
    const pollMs = isRunningExpoGo() ? 30_000 : POLL_INTERVAL_MS;
    const interval = setInterval(() => {
      void hydrateInbox();
    }, pollMs);
    return () => clearInterval(interval);
  }, [ownerId, token, hydrateInbox]);

  useEffect(() => {
    return () => {
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    };
  }, []);

  return {
    messages,
    loading,
    error,
    refresh: hydrateInbox,
    ownerId,
    zoneId: user?.zoneId ?? (user?.zone_id != null ? String(user.zone_id) : null),
    wsStatus: wsEnabled ? wsStatus : ("closed" as const),
  };
}
