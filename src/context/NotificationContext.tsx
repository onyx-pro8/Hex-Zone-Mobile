import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  addForegroundMessageListener,
  addNotificationResponseListener,
  registerForPushNotificationsAsync,
} from "@/lib/notifications";
import { EXPO_GO_PUSH_MESSAGE, isRunningExpoGo } from "@/lib/pushSupport";
import { useAuth } from "./AuthContext";

export type ZoneNotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  receivedAt: number;
};

type NotificationContextValue = {
  pushToken: string | null;
  permissionError: string | null;
  lastNotification: ZoneNotificationPayload | null;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

function toPayload(
  notification: Notifications.Notification,
): ZoneNotificationPayload {
  const content = notification.request.content;
  return {
    title: content.title ?? "Safe Zone Patrol",
    body: content.body ?? "",
    data: (content.data as Record<string, unknown>) ?? {},
    receivedAt: Date.now(),
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(() =>
    isRunningExpoGo() ? EXPO_GO_PUSH_MESSAGE : null,
  );
  const [lastNotification, setLastNotification] =
    useState<ZoneNotificationPayload | null>(null);

  useEffect(() => {
    if (!token) return;
    if (isRunningExpoGo()) return;
    let cancelled = false;
    (async () => {
      const result = await registerForPushNotificationsAsync();
      if (cancelled) return;
      if (result.token) setPushToken(result.token);
      if (result.error) setPermissionError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const recvSub = addForegroundMessageListener((notification) => {
      setLastNotification(toPayload(notification));
    });
    const respSub = addNotificationResponseListener((response) => {
      setLastNotification(toPayload(response.notification));
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const event = String(data?.event ?? "");
      const channelId = response.notification.request.content
        .channelId as string | undefined;
      const isAlarm =
        channelId === "alarms" ||
        channelId === "ns_panic" ||
        event === "NEW_GEO_MESSAGE" ||
        /PANIC|SENSOR|UNKNOWN|NS_PANIC/i.test(String(data?.type ?? ""));
      if (isAlarm && token) {
        router.push("/(tabs)/alerts" as unknown as Href);
      }
    });
    return () => {
      recvSub.remove();
      respSub.remove();
    };
  }, [router, token]);

  const value = useMemo<NotificationContextValue>(
    () => ({ pushToken, permissionError, lastNotification }),
    [pushToken, permissionError, lastNotification],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
