import type { Message } from "@/api/messages";
import { GUEST_LOGICAL_SENDER_ID } from "@/api/messages";
import type { MessageFeatureBlock } from "@/api/messageFeature";

function coerceOwnerId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function isMessageHiddenByBlocks(
  message: Pick<Message, "sender_id" | "type" | "guest_sender_id">,
  blocks: MessageFeatureBlock[],
): boolean {
  if (blocks.length === 0) return false;

  const senderId =
    message.guest_sender_id != null || message.sender_id === GUEST_LOGICAL_SENDER_ID
      ? null
      : coerceOwnerId(message.sender_id);
  const msgType = String(message.type ?? "").toUpperCase();

  for (const row of blocks) {
    const blockedMember = coerceOwnerId(row.blocked_owner_id);
    const blockedType = row.blocked_message_type
      ? String(row.blocked_message_type).toUpperCase()
      : null;

    const memberMatch =
      blockedMember == null || (senderId != null && blockedMember === senderId);
    const typeMatch = blockedType == null || blockedType === msgType;
    if (memberMatch && typeMatch) return true;
  }
  return false;
}

export function filterMessagesForBlocks<T extends Pick<Message, "sender_id" | "type" | "guest_sender_id">>(
  messages: T[],
  blocks: MessageFeatureBlock[],
): T[] {
  if (blocks.length === 0) return messages;
  return messages.filter((m) => !isMessageHiddenByBlocks(m, blocks));
}
