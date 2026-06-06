import type { Message, MessageFeaturePropagationResponse } from "@/api/messages";
import { getMessageTypeCategory, toMessageType, toMessageTypeLabel } from "@/lib/messageTypes";
import { presentLocalMessageNotification } from "@/lib/notifications";
import { shouldShowGeoPropagationInInbox } from "@/lib/messageSocket";

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

function androidChannelForCategory(
  category: string | undefined,
): "messages" | "alarms" {
  return category === "Alarm" ? "alarms" : "messages";
}

function isIncomingForViewer(
  senderId: number | null | undefined,
  viewerOwnerId: number,
): boolean {
  if (!Number.isFinite(viewerOwnerId) || viewerOwnerId <= 0) return false;
  if (typeof senderId === "number" && senderId === viewerOwnerId) return false;
  return true;
}

export async function notifyIncomingGeoPropagation(
  propagation: MessageFeaturePropagationResponse,
  viewerOwnerId: number,
): Promise<void> {
  if (!shouldShowGeoPropagationInInbox(propagation, viewerOwnerId)) return;
  if (!isIncomingForViewer(propagation.sender_id, viewerOwnerId)) return;

  const id = propagation.id != null ? String(propagation.id) : "";
  if (!id || !markNotified(`geo:${id}`)) return;

  const type = toMessageType(propagation.type) ?? "UNKNOWN";
  const category =
    propagation.category ?? getMessageTypeCategory(type);
  const text =
    (typeof propagation.text === "string" && propagation.text.trim()) ||
    String(propagation.type ?? "Message");

  await presentLocalMessageNotification({
    title: `Safe Zone Patrol ${toMessageTypeLabel(type)}`,
    body: text.slice(0, 240),
    channelId: androidChannelForCategory(category),
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
  if (!isIncomingForViewer(message.sender_id, viewerOwnerId)) return;
  if (!markNotified(`msg:${message.id}`)) return;

  await presentLocalMessageNotification({
    title: `Safe Zone Patrol ${toMessageTypeLabel(message.type)}`,
    body: message.message.slice(0, 240),
    channelId: androidChannelForCategory(message.category),
    data: {
      event: "NEW_MESSAGE",
      type: message.type,
      id: message.id,
    },
  });
}
