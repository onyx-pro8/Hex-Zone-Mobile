import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { setStoredPushToken } from "@/lib/storage";
import { registerPushToken } from "@/api/devices";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult = {
  token: string | null;
  error?: string;
};

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Zone messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF2DAA",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("alarms", {
      name: "Alarms & alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 350, 200, 350],
      lightColor: "#FF4D6D",
      sound: "default",
    });
  } catch {
    /* ignore */
  }
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  try {
    await ensureAndroidChannels();

    if (!Device.isDevice) {
      return {
        token: null,
        error: "Push notifications require a physical device.",
      };
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return { token: null, error: "Notification permissions not granted." };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    if (token) {
      await setStoredPushToken(token);
      try {
        await registerPushToken({ token, platform: "EXPO" });
      } catch {
        // server may return 401 before login - retry after login flow.
      }
    }
    return { token };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Push registration failed.";
    return { token: null, error: message };
  }
}

export function addForegroundMessageListener(
  handler: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export async function presentLocalMessageNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}
