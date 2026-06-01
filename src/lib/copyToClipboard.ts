import { Alert, Platform, Share } from "react-native";

export type CopyToClipboardResult =
  | { ok: true; method: "clipboard" | "share" }
  | { ok: false; reason: "unavailable" | "failed" | "cancelled"; message: string };

/** Copy/share link without expo-clipboard (works in dev client without a rebuild). */
export async function copyToClipboard(text: string): Promise<CopyToClipboardResult> {
  const value = text.trim();
  if (!value) {
    return { ok: false, reason: "failed", message: "Nothing to copy." };
  }

  if (Platform.OS === "web") {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return { ok: true, method: "clipboard" };
      }
    } catch {
      /* fall through */
    }
    return {
      ok: false,
      reason: "unavailable",
      message: "Clipboard is not available in this browser.",
    };
  }

  try {
    const result = await Share.share(
      Platform.OS === "ios"
        ? { message: value, url: value }
        : { message: value },
    );
    if (result.action === Share.dismissedAction) {
      return { ok: false, reason: "cancelled", message: "Share cancelled." };
    }
    return { ok: true, method: "share" };
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "Could not open the share sheet.",
    };
  }
}

export function alertCopyResult(
  result: CopyToClipboardResult,
  fallbackText?: string,
): void {
  if (result.ok) {
    if (result.method === "clipboard") {
      Alert.alert("Copied", "Link copied to clipboard.");
    } else {
      Alert.alert("Share", 'Choose "Copy" (or similar) in the share menu to copy the link.');
    }
    return;
  }
  if (result.reason === "cancelled") {
    return;
  }
  if (fallbackText) {
    Alert.alert("Copy unavailable", `${result.message}\n\n${fallbackText}`);
    return;
  }
  Alert.alert("Copy unavailable", result.message);
}
