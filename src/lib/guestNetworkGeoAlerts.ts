import { getMessageWorkflow, isEmergencyMessageType } from "./messageWorkflow";
import type { MessageType } from "./messageTypes";

export const GUEST_NETWORK_GEO_TYPES = [
  "PANIC",
  "NS_PANIC",
  "UNKNOWN",
  "PRIVATE",
  "PA",
  "SERVICE",
] as const;

export type GuestNetworkGeoType = (typeof GUEST_NETWORK_GEO_TYPES)[number];

function normType(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

export function guestHasNetworkGeoMessaging(input: {
  network_geo_messaging?: boolean;
  allowed_message_types?: string[];
}): boolean {
  if (input.network_geo_messaging) return true;
  const allowed = input.allowed_message_types ?? [];
  return allowed.some((t) =>
    GUEST_NETWORK_GEO_TYPES.some((g) => normType(g) === normType(t)),
  );
}

export function guestAllowedNetworkGeoTypes(
  allowed_message_types?: string[],
): GuestNetworkGeoType[] {
  const set = new Set((allowed_message_types ?? []).map(normType));
  return GUEST_NETWORK_GEO_TYPES.filter((t) => set.has(normType(t)));
}

export function guestGeoAlertLabel(type: GuestNetworkGeoType): string {
  if (type === "NS_PANIC") return "NS PANIC";
  return type.replace(/_/g, " ");
}

export function guestGeoAlertConfirmPrompt(type: GuestNetworkGeoType): string | null {
  const workflow = getMessageWorkflow(type as MessageType);
  if (!workflow?.confirmBeforeSend && !isEmergencyMessageType(type as MessageType)) {
    return null;
  }
  return `Send ${guestGeoAlertLabel(type)} to network members using your current location?`;
}

export function guestGeoAlertButtonTone(
  type: GuestNetworkGeoType,
): "danger" | "warning" | "default" | "muted" {
  const workflow = getMessageWorkflow(type as MessageType);
  const p = workflow?.priority ?? "MEDIUM";
  if (p === "MAX" || p === "CRITICAL") return "danger";
  if (p === "HIGH") return "warning";
  if (p === "LOW") return "muted";
  return "default";
}
