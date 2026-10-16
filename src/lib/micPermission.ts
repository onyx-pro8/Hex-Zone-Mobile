import { PermissionsAndroid, Platform } from "react-native";
import { primeCallAudio, startAndWaitForCallMic } from "@/lib/callAudioBridge";

export type MicPermissionResult = "granted" | "denied" | "blocked";

async function androidMicStatus(): Promise<MicPermissionResult> {
  try {
    // The small system Allow / Deny dialog. If the mic is already allowed,
    // Android returns granted and does not show the dialog again.
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Microphone for voice calls",
        message:
          "Safe Zone Patrol needs the microphone so the other person can hear you during a call.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
        buttonNeutral: "Ask later",
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return "blocked";
    return "denied";
  } catch {
    return "denied";
  }
}

/** System permission dialog (Android). Returns whether capture may start. */
export async function requestMicPermission(): Promise<MicPermissionResult> {
  if (Platform.OS === "web") return "granted";
  if (Platform.OS === "android") return androidMicStatus();
  return "granted";
}

export function micDeniedMessage(
  result: MicPermissionResult,
  who: "caller" | "receiver",
): string {
  if (who === "receiver") {
    return "Allow the microphone to answer. This call is still ringing.";
  }
  if (result === "blocked") {
    return "Allow the microphone on the system dialog to place the call.";
  }
  return "Allow the microphone to place the call.";
}

/**
 * Show only the system Allow / Deny dialog.
 * Deny stops the call. An already-allowed microphone continues the call.
 */
export async function ensureMicrophoneForCall(
  who: "caller" | "receiver",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const permission = await requestMicPermission();
  if (permission !== "granted") {
    return { ok: false, message: micDeniedMessage(permission, who) };
  }
  primeCallAudio();
  void startAndWaitForCallMic(10000);
  return { ok: true };
}
