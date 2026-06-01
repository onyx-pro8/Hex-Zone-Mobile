import { isRunningInExpoGo } from "expo";
import * as Device from "expo-device";

/** Shown in UI when remote push cannot be registered. */
export const EXPO_GO_PUSH_MESSAGE =
  "Remote push is unavailable in Expo Go (SDK 53+). Build a dev client with `npx expo run:android` or EAS Build to test push notifications.";

export function isRunningExpoGo(): boolean {
  return isRunningInExpoGo();
}

/** True when the app can obtain an Expo push token (dev build or production). */
export function isRemotePushSupported(): boolean {
  if (isRunningInExpoGo()) return false;
  return Device.isDevice;
}
