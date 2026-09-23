import type { Message } from "@/api/messages";

/**
 * Read a broadcast name embedded in an outgoing message payload. Senders attach
 * `broadcast_name` to `msg`/`raw_payload` so receivers can display a friendly
 * identity instead of a numeric owner id.
 */
function pickDisplayName(
  o: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!o) return null;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function readMessageBroadcastName(
  message: Pick<Message, "raw_payload">,
): string | null {
  const rp = message.raw_payload;
  if (!rp || typeof rp !== "object") return null;
  const keys = ["broadcast_name", "broadcastName", "guest_name", "guestName"];
  const top = pickDisplayName(rp as Record<string, unknown>, keys);
  if (top) return top;
  const msg = (rp as Record<string, unknown>).msg;
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    return pickDisplayName(msg as Record<string, unknown>, keys);
  }
  return null;
}

export type BroadcastLabelOptions = {
  selfOwnerId?: number | null;
  selfBroadcastName?: string | null;
  selfRealName?: string | null;
  resolveOwnerName?: (ownerId: number) => string | null | undefined;
};

const GUEST_RECENT_ACTIVE_MS = 5 * 60 * 1000;

/** True when a guest-authored row is recent enough to treat the sender as online. */
export function isRecentGuestActivity(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t < GUEST_RECENT_ACTIVE_MS;
}

/** Guest session id to use for presence when the inbox row is guest-authored. */
export function guestInboxPresenceId(
  item: Pick<Message, "guest_sender_id" | "guest_id" | "sender_id">,
): string | null {
  const fromSender = (item.guest_sender_id ?? "").trim();
  if (fromSender) return fromSender;
  if (item.sender_id === 0) {
    const gid = (item.guest_id ?? "").trim();
    if (gid) return gid;
  }
  return null;
}

/** Inbox green-dot for a guest sender: live presence, last-seen flag, or a fresh message. */
export function isGuestInboxSenderOnline(
  item: Pick<Message, "guest_sender_id" | "guest_id" | "sender_id" | "created_at"> & {
    guest_online?: boolean;
  },
  isGuestOnline: (guestId: string | null | undefined) => boolean,
): boolean {
  const gid = guestInboxPresenceId(item);
  if (!gid) return false;
  return (
    item.guest_online === true ||
    isGuestOnline(gid) ||
    isRecentGuestActivity(item.created_at)
  );
}

function isOwnMessage(
  message: Pick<Message, "sender_id">,
  selfOwnerId?: number | null,
): boolean {
  return selfOwnerId != null && message.sender_id === selfOwnerId;
}

/** Best-effort display name (sender's broadcast name) for an inbox row. */
export function messageBroadcastLabel(
  message: Message,
  options: BroadcastLabelOptions = {},
): string {
  if (isOwnMessage(message, options.selfOwnerId)) {
    return "ME";
  }
  const embedded = readMessageBroadcastName(message);
  if (embedded) return embedded;
  if (message.guest_sender_id != null) return "Guest";
  const resolved = options.resolveOwnerName?.(message.sender_id);
  if (resolved && resolved.trim()) return resolved.trim();
  return `Member ${message.sender_id}`;
}

/**
 * Account name used for avatar initials when the sender has no photo.
 * Own messages use the settings name (never "ME"); other senders use their
 * member profile name.
 */
export function messageAvatarLabel(
  message: Message,
  options: BroadcastLabelOptions = {},
): string {
  if (isOwnMessage(message, options.selfOwnerId)) {
    const real = (options.selfRealName ?? "").trim();
    if (real) return real;
  }
  const resolved = options.resolveOwnerName?.(message.sender_id);
  if (resolved && resolved.trim()) return resolved.trim();
  const embedded = readMessageBroadcastName(message);
  if (embedded && embedded.toUpperCase() !== "ME") return embedded;
  if (message.guest_sender_id != null) return "Guest";
  return "";
}
