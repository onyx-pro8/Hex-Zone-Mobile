import type { Message, MessageFeaturePropagationResponse } from "@/api/messages";
import { GUEST_LOGICAL_SENDER_ID } from "@/api/messages";
import { getMessageTypeCategory, toMessageType, toMessageTypeLabel } from "@/lib/messageTypes";
import { presentLocalMessageNotification } from "@/lib/notifications";
import { shouldShowGeoPropagationInInbox } from "@/lib/messageSocket";
import { readMessageBroadcastName } from "@/lib/messageBroadcast";
import { isPermissionZonePendingBroadcastVisibility } from "@/lib/permissionVisibility";

function broadcastNameFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const pick = (o: Record<string, unknown>): string | null => {
    const v = o.broadcast_name ?? o.broadcastName;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const top = pick(metadata);
  if (top) return top;
  const msg = metadata.msg;
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    return pick(msg as Record<string, unknown>);
  }
  return null;
}

const notifiedIds = new Set<string>();
const MAX_NOTIFIED_IDS = 200;

function markNotified(id: string): boolean {
  if (notifiedIds.has(id)) return false;
  notifiedIds.add(id);
  if (notifiedIds.size > MAX_NOTIFIED_IDS) {
    const keep = [...notifiedIds].slice(-100);
    notifiedIds.clear();
    for (const key of keep) notifiedIds.add(key);
  }
  return true;
}

function androidChannelForMessage(
  category: string | undefined,
  type: string | undefined,
): "messages" | "alarms" | "ns_panic" {
  const normalizedType = String(type ?? "").trim().toUpperCase().replace("-", "_");
  if (normalizedType === "NS_PANIC") return "ns_panic";
  return category === "Alarm" ? "alarms" : "messages";
}

function isOwnOutboundMessage(
  senderId: number | null | undefined,
  viewerOwnerId: number,
): boolean {
  if (!Number.isFinite(viewerOwnerId) || viewerOwnerId <= 0) return true;
  if (typeof senderId !== "number") return false;
  if (senderId === GUEST_LOGICAL_SENDER_ID) return false;
  return senderId === viewerOwnerId;
}

/**
 * Unexpected guest arrivals persist a PERMISSION row attributed to the zone admin
 * (`sender_id` = admin) so it appears in Access history. Those still need a
 * notification for the admin. Guest-authored CHAT uses `guest_sender_id`.
 */
function shouldNotifyInboxMessage(
  message: Message,
  viewerOwnerId: number,
): boolean {
  if (!Number.isFinite(viewerOwnerId) || viewerOwnerId <= 0) return false;
  if (message.guest_sender_id) return true;
  if (isPermissionZonePendingBroadcastVisibility(message.permission_visibility)) {
    return true;
  }
  return !isOwnOutboundMessage(message.sender_id, viewerOwnerId);
}

export async function notifyIncomingGeoPropagation(
  propagation: MessageFeaturePropagationResponse,
  viewerOwnerId: number,
): Promise<void> {
  if (!shouldShowGeoPropagationInInbox(propagation, viewerOwnerId)) return;
  if (isOwnOutboundMessage(propagation.sender_id, viewerOwnerId)) return;

  const id = propagation.id != null ? String(propagation.id) : "";
  if (!id || !markNotified(`geo:${id}`)) return;

  const type = toMessageType(propagation.type) ?? "UNKNOWN";
  const category =
    propagation.category ?? getMessageTypeCategory(type);
  const text =
    (typeof propagation.text === "string" && propagation.text.trim()) ||
    String(propagation.type ?? "Message");
  const broadcastName = broadcastNameFromMetadata(propagation.metadata);

  await presentLocalMessageNotification({
    title: broadcastName
      ? `${broadcastName} · ${toMessageTypeLabel(type)}`
      : `Safe Zone Patrol ${toMessageTypeLabel(type)}`,
    body: text.slice(0, 240),
    channelId: androidChannelForMessage(category, propagation.type),
    data: {
      event: "NEW_GEO_MESSAGE",
      type: propagation.type,
      id: propagation.id,
    },
  });
}

export async function notifyIncomingInboxMessage(
  message: Message,
  viewerOwnerId: number,
): Promise<void> {
  if (!shouldNotifyInboxMessage(message, viewerOwnerId)) return;

  const guestId = String(message.guest_id ?? "").trim();
  if (guestId && notifiedIds.has(`guest-arrival:${guestId}`)) {
    markNotified(`msg:${message.id}`);
    return;
  }
  if (!markNotified(`msg:${message.id}`)) return;
  if (guestId) markNotified(`guest-arrival:${guestId}`);

  const broadcastName = readMessageBroadcastName(message);

  await presentLocalMessageNotification({
    title: broadcastName
      ? `${broadcastName} · ${toMessageTypeLabel(message.type)}`
      : `Safe Zone Patrol ${toMessageTypeLabel(message.type)}`,
    body: message.message.slice(0, 240),
    channelId: androidChannelForMessage(message.category, message.type),
    data: {
      event: "NEW_MESSAGE",
      type: message.type,
      id: message.id,
    },
  });
}

export async function notifyGuestArrivalSocketEvent(raw: string): Promise<void> {
  let parsed: {
    type?: string;
    guest_name?: string;
    guest_id?: string;
    zone_id?: string;
    data?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return;
  }

  const type = String(parsed.type ?? "").trim();
  if (type !== "unexpected_guest" && type !== "guest_is_here") return;

  const nested =
    parsed.data != null && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? parsed.data
      : null;
  const guestId = String(
    nested?.guest_id ?? parsed.guest_id ?? "",
  ).trim();
  const guestName = String(
    nested?.guest_name ?? parsed.guest_name ?? "Guest",
  ).trim() || "Guest";
  const zoneId = String(nested?.zone_id ?? parsed.zone_id ?? "").trim();

  const dedupeKey = guestId
    ? `guest-arrival:${guestId}`
    : `guest-arrival:${type}:${guestName}:${zoneId}`;
  if (!markNotified(dedupeKey)) return;

  const isUnexpected = type === "unexpected_guest";
  await presentLocalMessageNotification({
    title: zoneId
      ? `${zoneId} · ${isUnexpected ? "Guest access request" : "Expected guest"}`
      : isUnexpected
        ? "Guest access request"
        : "Expected guest arrived",
    body: isUnexpected
      ? `${guestName} is requesting access and awaiting approval.`
      : `${guestName} has arrived.`,
    channelId: "messages",
    data: {
      event: type,
      type: "PERMISSION",
      guest_id: guestId,
      zone_id: zoneId,
    },
  });
}
