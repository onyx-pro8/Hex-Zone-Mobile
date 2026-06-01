import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { setStoredPushToken } from "@/lib/storage";
import { registerPushToken } from "@/api/devices";
import {
  EXPO_GO_PUSH_MESSAGE,
  isRemotePushSupported,
  isRunningExpoGo,
} from "@/lib/pushSupport";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult = {
  token: string | null;
  error?: string;
};

const FCM_SETUP_URL =
  "https://docs.expo.dev/push-notifications/fcm-credentials/";

function formatPushRegistrationError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : "Push registration failed.";
  if (/FirebaseApp is not initialized/i.test(raw)) {
    const androidPackage =
      Constants.expoConfig?.android?.package ?? "com.zoneweaver.mobile";
    return [
      "Firebase (FCM) is not configured in this Android build.",
      `Add google-services.json for package ${androidPackage}, upload an FCM service account to EAS (eas credentials), then rebuild with expo run:android or EAS Build.`,
      FCM_SETUP_URL,
    ].join(" ");
  }
  if (/fcm-credentials/i.test(raw)) {
    return `${raw} ${FCM_SETUP_URL}`;
  }
  return raw;
}

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
    if (!isRemotePushSupported()) {
      return {
        token: null,
        error: isRunningExpoGo()
          ? EXPO_GO_PUSH_MESSAGE
          : "Push notifications require a physical device.",
      };
    }

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
    return { token: null, error: formatPushRegistrationError(err) };
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
  /** Android notification channel (`messages` or `alarms`). */
  channelId?: "messages" | "alarms";
}) {
  try {
    await ensureAndroidChannels();
    const channelId = payload.channelId ?? "messages";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}
