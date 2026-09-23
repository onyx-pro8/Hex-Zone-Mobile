import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import {
  listMessages,
  messageFromGeoPropagation,
  type Message,
} from "@/api/messages";
import { shouldShowGeoPropagationInInbox } from "@/lib/messageSocket";
import { listMessageFeatureBlocks, type MessageFeatureBlock } from "@/api/messageFeature";
import { filterMessagesForBlocks } from "@/lib/messageBlocks";
import {
  handleWellnessAckFrame,
  parseBlocksChangedSocketEvent,
  parseMessageFeatureSocketEvent,
  parseMessageSocketPayload,
} from "@/lib/messageSocket";
import {
  notifyIncomingGeoPropagation,
  notifyIncomingInboxMessage,
} from "@/lib/incomingMessageNotify";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { toastSmartHomeWebhookOwnerResult } from "@/lib/smartHomeToast";
import { toast } from "@/lib/toast";
import { useWebSocket } from "./useWebSocket";

const POLL_INTERVAL_MS = 30_000;
/** First paint + each scroll page for Home / Incoming Alarms. */
export const INBOX_PAGE_SIZE = 10;

function sortByNewest(list: Message[]) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function mergeSortedInbox(batch: Message[]): Message[] {
  // Strict chronological order (newest first) across the whole merged feed —
  // PERMISSION, CHAT, alarms and member messages are interleaved purely by
  // created_at so the list matches the order events actually happened.
  return sortByNewest(batch);
}

function mergeUniqueById(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((row) => row.id));
  const appended = incoming.filter((row) => !seen.has(row.id));
  if (appended.length === 0) return existing;
  return mergeSortedInbox([...existing, ...appended]);
}

export function useMessagesFeed(options?: {
  limit?: number;
  pageSize?: number;
  zoneIds?: string[];
}) {
  const { user, token, ownerZoneId } = useAuth();
  const { lastNotification } = useNotifications();
  const pageSize = options?.pageSize ?? options?.limit ?? INBOX_PAGE_SIZE;
  const [messages, setMessages] = useState<Message[]>([]);
  const [blockRules, setBlockRules] = useState<MessageFeatureBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ownerId = useMemo(() => {
    const raw = user?.id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [user?.id]);

  const accountZoneId = useMemo(() => {
    const fromOwner = ownerZoneId?.trim();
    if (fromOwner) return fromOwner;
    const fromUser = user?.zoneId ?? user?.zone_id;
    return fromUser != null ? String(fromUser).trim() : "";
  }, [ownerZoneId, user?.zoneId, user?.zone_id]);

  const zoneIds = useMemo(() => {
    const base =
      options?.zoneIds?.filter((z) => z.trim().length > 0) ??
      (accountZoneId ? [accountZoneId] : []);
    const fromMessages = messages.map((m) => m.zone_id).filter(Boolean);
    return Array.from(new Set([...base, ...fromMessages]));
  }, [accountZoneId, options?.zoneIds, messages]);

  const blockRulesRef = useRef(blockRules);
  useEffect(() => {
    blockRulesRef.current = blockRules;
  }, [blockRules]);

  /** How many rows we last asked the API for in the loaded window (skip offset). */
  const fetchedCountRef = useRef(0);

  const inboxHydratedOnceRef = useRef(false);
  const seenInboxIdsRef = useRef<Set<string>>(new Set());
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreInFlightRef = useRef(false);

  const applyInboxBatch = useCallback((batch: Message[], blocks: MessageFeatureBlock[]) => {
    const visible = filterMessagesForBlocks(batch, blocks);
    setMessages(mergeSortedInbox(visible));
  }, []);

  const prependInboxMessage = useCallback((incoming: Message) => {
    seenInboxIdsRef.current.add(incoming.id);
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

  const fallbackZoneId = accountZoneId || null;

  const applyGeoPropagationToInbox = useCallback(
    (propagation: Parameters<typeof messageFromGeoPropagation>[0]) => {
      if (ownerId == null) return;
      if (!shouldShowGeoPropagationInInbox(propagation, ownerId)) return;
      void notifyIncomingGeoPropagation(propagation, ownerId);
      const row = messageFromGeoPropagation(propagation, {
        fallbackZoneId,
      });
      if (row) prependInboxMessage(row);
    },
    [ownerId, prependInboxMessage, fallbackZoneId],
  );

  const trackNewRowsForNotify = useCallback(
    (batch: Message[]) => {
      if (ownerId == null) return;
      for (const row of batch) {
        if (seenInboxIdsRef.current.has(row.id)) continue;
        seenInboxIdsRef.current.add(row.id);
        if (inboxHydratedOnceRef.current) {
          void notifyIncomingInboxMessage(row, ownerId);
        }
      }
      inboxHydratedOnceRef.current = true;
    },
    [ownerId],
  );

  /**
   * Reset or refresh the loaded window.
   * - `reset`: first page only (pull-to-refresh / owner change)
   * - `refresh`: re-fetch everything currently loaded (poll / socket reconcile)
   */
  const hydrateInbox = useCallback(
    async (mode: "reset" | "refresh" = "refresh") => {
      if (ownerId == null || !token) return;
      setLoading(true);
      setError(null);
      const limit =
        mode === "reset"
          ? pageSize
          : Math.max(pageSize, fetchedCountRef.current || pageSize);
      try {
        const [messagesResult, blocksResult] = await Promise.all([
          listMessages({
            owner_id: ownerId,
            skip: 0,
            limit,
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
          toast.error(messagesResult.error);
          return;
        }
        const batch = messagesResult.data ?? [];
        fetchedCountRef.current = batch.length;
        applyInboxBatch(batch, rules);
        setHasMore(batch.length >= limit);
        trackNewRowsForNotify(batch);
      } finally {
        setLoading(false);
      }
    },
    [ownerId, token, pageSize, applyInboxBatch, trackNewRowsForNotify],
  );

  const loadMore = useCallback(async () => {
    if (ownerId == null || !token) return;
    if (!hasMore || loading || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    const skip = fetchedCountRef.current;
    try {
      const messagesResult = await listMessages({
        owner_id: ownerId,
        skip,
        limit: pageSize,
      });
      if (messagesResult.unauthorized) return;
      if (messagesResult.error) {
        setError(messagesResult.error);
        toast.error(messagesResult.error);
        return;
      }
      const batch = messagesResult.data ?? [];
      fetchedCountRef.current = skip + batch.length;
      setHasMore(batch.length >= pageSize);
      if (batch.length === 0) return;
      const blocks = blockRulesRef.current;
      const visible = filterMessagesForBlocks(batch, blocks);
      trackNewRowsForNotify(batch);
      setMessages((prev) => mergeUniqueById(prev, visible));
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [ownerId, token, hasMore, loading, pageSize, trackNewRowsForNotify]);

  const scheduleInboxRefetchFromSocket = useCallback(() => {
    if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    refetchDebounceRef.current = setTimeout(() => {
      void hydrateInbox("refresh");
    }, 400);
  }, [hydrateInbox]);

  const wsEnabled = Boolean(token);
  const { lastMessage, status: wsStatus } = useWebSocket({
    token,
    zoneIds,
    enabled: wsEnabled,
  });

  useEffect(() => {
    if (!lastMessage) return;
    if (handleWellnessAckFrame(lastMessage)) return;
    if (parseBlocksChangedSocketEvent(lastMessage)) {
      scheduleInboxRefetchFromSocket();
      return;
    }
    const geoEvent = parseMessageFeatureSocketEvent(lastMessage);
    if (geoEvent?.type === "SMART_HOME_WEBHOOK") {
      toastSmartHomeWebhookOwnerResult(geoEvent.data);
      return;
    }
    if (geoEvent?.type === "NEW_GEO_MESSAGE") {
      applyGeoPropagationToInbox(geoEvent.data);
      return;
    }
    if (geoEvent?.type === "NEW_MESSAGE") {
      const row = geoEvent.data;
      if (geoEvent.memberJoinWelcome) {
        const text = (row.message ?? "").trim();
        if (text) {
          toast.info(text, { title: "Welcome", duration: 4500 });
        }
      }
      if (ownerId != null) void notifyIncomingInboxMessage(row, ownerId);
      prependInboxMessage(row);
      scheduleInboxRefetchFromSocket();
      return;
    }
    const row = parseMessageSocketPayload(lastMessage);
    if (row) {
      if (ownerId != null) void notifyIncomingInboxMessage(row, ownerId);
      prependInboxMessage(row);
      scheduleInboxRefetchFromSocket();
      return;
    }
    try {
      const parsed = JSON.parse(lastMessage) as { type?: string };
      if (
        parsed.type === "PERMISSION_MESSAGE" ||
        parsed.type === "unexpected_guest" ||
        parsed.type === "guest_is_here" ||
        parsed.type === "GUEST_REQUEST_CHANGED" ||
        parsed.type === "guest_zone_message" ||
        parsed.type === "GUEST_PRESENCE"
      ) {
        scheduleInboxRefetchFromSocket();
      }
    } catch {
      /* ignore */
    }
  }, [
    lastMessage,
    ownerId,
    applyGeoPropagationToInbox,
    prependInboxMessage,
    scheduleInboxRefetchFromSocket,
  ]);

  useEffect(() => {
    inboxHydratedOnceRef.current = false;
    seenInboxIdsRef.current.clear();
    setHasMore(true);
    fetchedCountRef.current = 0;
  }, [ownerId]);

  useEffect(() => {
    void hydrateInbox("reset");
  }, [hydrateInbox]);

  useEffect(() => {
    if (!lastNotification) return;
    void hydrateInbox("refresh");
  }, [lastNotification, hydrateInbox]);

  useEffect(() => {
    if (wsStatus === "open") void hydrateInbox("refresh");
  }, [wsStatus, hydrateInbox]);

  useEffect(() => {
    if (wsStatus === "open") return;
    if (ownerId == null || !token) return;
    const pollMs = isRunningExpoGo() ? 30_000 : POLL_INTERVAL_MS;
    const interval = setInterval(() => {
      void hydrateInbox("refresh");
    }, pollMs);
    return () => clearInterval(interval);
  }, [ownerId, token, hydrateInbox, wsStatus]);

  useEffect(() => {
    return () => {
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    };
  }, []);

  const refresh = useCallback(() => hydrateInbox("reset"), [hydrateInbox]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    applyGeoPropagationToInbox,
    ownerId,
    zoneId: accountZoneId || null,
    wsStatus: wsEnabled ? wsStatus : ("closed" as const),
    pageSize,
  };
}
