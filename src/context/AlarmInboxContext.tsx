import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";
import { useAuth } from "@/context/AuthContext";
import { countUnreadAlarms, unreadAlarmIds } from "@/lib/alarmRead";
import { markAlarmsRead } from "@/api/messageFeature";
import type { Message } from "@/api/messages";

type AlarmInboxContextValue = {
  alarmMessages: Message[];
  alarmCount: number;
  unreadAlarmCount: number;
  markAlarmsSeen: () => Promise<void>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AlarmInboxContext = createContext<AlarmInboxContextValue | undefined>(
  undefined,
);

export function AlarmInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const ownerId = user?.id;
  const { messages, loading, error, refresh } = useMessagesFeed();

  const alarmMessages = useMemo(
    () => messages.filter((m) => m.category === "Alarm"),
    [messages],
  );

  const unreadAlarmCount = useMemo(
    () => (ownerId != null ? countUnreadAlarms(alarmMessages, ownerId) : 0),
    [alarmMessages, ownerId],
  );

  const markAlarmsSeen = useCallback(async () => {
    if (ownerId == null) return;
    const ids = unreadAlarmIds(alarmMessages, ownerId);
    if (ids.length === 0) return;
    await markAlarmsRead(ids);
    await refresh();
  }, [alarmMessages, ownerId, refresh]);

  const value = useMemo<AlarmInboxContextValue>(
    () => ({
      alarmMessages,
      alarmCount: alarmMessages.length,
      unreadAlarmCount,
      markAlarmsSeen,
      loading,
      error,
      refresh,
    }),
    [
      alarmMessages,
      unreadAlarmCount,
      markAlarmsSeen,
      loading,
      error,
      refresh,
    ],
  );

  return (
    <AlarmInboxContext.Provider value={value}>
      {children}
    </AlarmInboxContext.Provider>
  );
}

export function useAlarmInbox(): AlarmInboxContextValue {
  const ctx = useContext(AlarmInboxContext);
  if (!ctx) {
    throw new Error("useAlarmInbox must be used within AlarmInboxProvider");
  }
  return ctx;
}
