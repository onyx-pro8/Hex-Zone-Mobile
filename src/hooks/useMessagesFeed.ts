import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { listMessages, type Message } from "@/api/messages";

export function useMessagesFeed(options?: { limit?: number }) {
  const { user } = useAuth();
  const { lastNotification } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerId = useMemo(() => {
    const raw = user?.accountOwnerId ?? user?.account_owner_id ?? user?.id;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [user]);

  const refresh = useCallback(async () => {
    if (ownerId == null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listMessages({
        owner_id: ownerId,
        skip: 0,
        limit: options?.limit ?? 100,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessages(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [ownerId, options?.limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!lastNotification) return;
    void refresh();
  }, [lastNotification, refresh]);

  return { messages, loading, error, refresh, ownerId };
}
