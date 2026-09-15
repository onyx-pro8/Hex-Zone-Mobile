import { toast } from "@/lib/toast";

/** Success toast after Account settings → Smart-home integration save. */
export function toastSmartHomeSettingsSaved(options?: {
  webhook?: string | null;
  hid?: string | null;
}): void {
  const webhook = (options?.webhook ?? "").trim();
  const hid = (options?.hid ?? "").trim();
  if (webhook) {
    toast.success(
      hid
        ? `Saved for ${hid}. Alarm/Alert messages on your network will POST to your hub.`
        : "Webhook saved. Alarm/Alert messages on your network will POST to your hub.",
      { title: "Smart-home integration" },
    );
    return;
  }
  toast.success(
    "Settings saved. Add a public webhook URL to push Alarm/Alert messages to your hub.",
    { title: "Smart-home integration" },
  );
}

export type SmartHomeWebhookSocketPayload = {
  ok?: boolean | null;
  hid?: string | null;
  title?: string | null;
  toast?: string | null;
};

/**
 * Toast for the hub owner after server POSTs (or fails) their webhook.
 * Driven by WebSocket ``SMART_HOME_WEBHOOK`` — not the sender HTTP response.
 */
export function toastSmartHomeWebhookOwnerResult(
  payload: SmartHomeWebhookSocketPayload | null | undefined,
): void {
  if (!payload || typeof payload !== "object") return;
  const ok = payload.ok === true;
  const text =
    (typeof payload.toast === "string" && payload.toast.trim()) ||
    (ok ? "Hub notified." : "Hub webhook failed.");
  if (ok) {
    toast.success(text, { title: "Smart-home" });
  } else {
    toast.warning(text, { title: "Smart-home", duration: 4500 });
  }
}

/** @deprecated Sender-side webhook toasts removed — hub owners get WS toasts. */
export function toastSmartHomeWebhookDelivery(
  _stats: unknown,
): void {
  // Intentionally no-op: only the hub owner should see success/failure.
}
