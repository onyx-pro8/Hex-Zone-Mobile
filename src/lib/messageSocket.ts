import { API_BASE_URL } from "@/api/client";
import { normalizeMessage, type Message, type MessageFeaturePropagationResponse } from "@/api/messages";

type IncomingNewMessage = {
  type: "NEW_MESSAGE";
  data: Message;
  memberJoinWelcome?: boolean;
};

export type MessageFeatureSocketEvent =
  | IncomingNewMessage
  | { type: "NEW_GEO_MESSAGE"; data: MessageFeaturePropagationResponse }
  | { type: "PERMISSION_MESSAGE"; data: Record<string, unknown> }
  | {
      type: "SMART_HOME_WEBHOOK";
      data: {
        ok?: boolean;
        hid?: string;
        title?: string;
        toast?: string;
      };
    };

type SocketEvent =
  | MessageFeatureSocketEvent
  | { type: string; data?: unknown };

function isPropagationResponse(
  value: unknown,
): value is MessageFeaturePropagationResponse {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.skipped === true) return false;
  return (
    row.id != null &&
    typeof row.type === "string" &&
    Array.isArray(row.delivered_owner_ids) &&
    Array.isArray(row.blocked_owner_ids) &&
    typeof row.created_at === "string"
  );
}

export function shouldShowGeoPropagationInInbox(
  propagation: MessageFeaturePropagationResponse,
  viewerOwnerId: number,
): boolean {
  if (!Number.isFinite(viewerOwnerId) || viewerOwnerId <= 0) return false;
  if (propagation.skipped) return false;
  const senderId = propagation.sender_id;
  if (typeof senderId === "number" && senderId === viewerOwnerId) return true;
  return (propagation.delivered_owner_ids ?? []).some(
    (id) => Number(id) === viewerOwnerId,
  );
}

export function defaultRealtimeWsBase(): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  try {
    const u = new URL(base);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/ws`;
  } catch {
    return "wss://safe-zone-patrol-server.onrender.com/ws";
  }
}

export function parseMessageSocketPayload(raw: string): Message | null {
  const event = parseMessageFeatureSocketEvent(raw);
  if (event?.type === "NEW_MESSAGE") {
    return event.data;
  }
  return null;
}

/** True when the NEW_MESSAGE frame is a member-join welcome toast. */
export function isMemberJoinWelcomeSocketEvent(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "NEW_MESSAGE" || !parsed.data || typeof parsed.data !== "object") {
      return false;
    }
    const data = parsed.data as Record<string, unknown>;
    return (
      data.member_join_welcome === true ||
      data.memberJoinWelcome === true
    );
  } catch {
    return false;
  }
}

export function parseInboxSocketRefetchSignal(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    const t = parsed.type;
    if (typeof t !== "string") return false;
    return (
      t === "NEW_MESSAGE" ||
      t === "PERMISSION_MESSAGE" ||
      t === "NEW_GEO_MESSAGE" ||
      t === "unexpected_guest" ||
      t === "guest_is_here" ||
      t === "BLOCKS_CHANGED" ||
      t === "GUEST_REQUEST_CHANGED" ||
      t === "guest_zone_message" ||
      t === "GUEST_PRESENCE"
    );
  } catch {
    return false;
  }
}

export type BlocksChangedSocketEvent = {
  action: "created" | "deleted" | string;
  block?: Record<string, unknown>;
  block_id?: number;
};

export function parseBlocksChangedSocketEvent(
  raw: string,
): BlocksChangedSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "BLOCKS_CHANGED") return null;
    const data =
      parsed.data != null && typeof parsed.data === "object" && !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : null;
    if (!data) return null;
    const action = typeof data.action === "string" ? data.action : "changed";
    const block_id =
      typeof data.block_id === "number"
        ? data.block_id
        : typeof data.blockId === "number"
          ? data.blockId
          : undefined;
    const block =
      data.block != null && typeof data.block === "object" && !Array.isArray(data.block)
        ? (data.block as Record<string, unknown>)
        : undefined;
    return { action, block, block_id };
  } catch {
    return null;
  }
}

export type GuestRequestChangedSocketEvent = {
  guest_id?: string;
  zone_id?: string;
  status?: string;
  request_id?: string;
};

export function parseGuestRequestChangedSocketEvent(
  raw: string,
): GuestRequestChangedSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "GUEST_REQUEST_CHANGED") return null;
    const data =
      parsed.data != null && typeof parsed.data === "object" && !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
    return {
      guest_id: typeof data.guest_id === "string" ? data.guest_id : undefined,
      zone_id: typeof data.zone_id === "string" ? data.zone_id : undefined,
      status: typeof data.status === "string" ? data.status : undefined,
      request_id:
        typeof data.request_id === "string"
          ? data.request_id
          : data.request_id != null
            ? String(data.request_id)
            : undefined,
    };
  } catch {
    return null;
  }
}

export type SessionRevokedSocketEvent = {
  kept_hid?: string | null;
  released_hids: string[];
  reason?: string;
};

export function parseSessionRevokedSocketEvent(
  raw: string,
): SessionRevokedSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "SESSION_REVOKED") return null;
    const data =
      parsed.data != null && typeof parsed.data === "object" && !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
    const releasedRaw = data.released_hids;
    const released_hids = Array.isArray(releasedRaw)
      ? releasedRaw
          .map((h) => (typeof h === "string" ? h.trim().toUpperCase() : ""))
          .filter(Boolean)
      : [];
    return {
      kept_hid:
        typeof data.kept_hid === "string" ? data.kept_hid.trim().toUpperCase() : null,
      released_hids,
      reason: typeof data.reason === "string" ? data.reason : undefined,
    };
  } catch {
    return null;
  }
}

export type GuestPresenceSocketEvent = {
  guestId: string;
  online: boolean;
};

export function parseGuestPresenceSocketEvent(
  raw: string,
): GuestPresenceSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "GUEST_PRESENCE") return null;
    const data =
      parsed.data != null &&
      typeof parsed.data === "object" &&
      !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
    const rawId = data.guest_id ?? data.guestId;
    const guestId = typeof rawId === "string" ? rawId.trim() : "";
    if (!guestId) return null;
    if (typeof data.online !== "boolean") return null;
    return { guestId, online: data.online };
  } catch {
    return null;
  }
}

export type MemberPresenceSocketEvent = {
  ownerId: number;
  online: boolean;
};

/** Parse MEMBER_PRESENCE frames used for realtime online/offline dots. */
export function parseMemberPresenceSocketEvent(
  raw: string,
): MemberPresenceSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "MEMBER_PRESENCE") return null;
    const data =
      parsed.data != null &&
      typeof parsed.data === "object" &&
      !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : {};
    const rawId = data.owner_id ?? data.ownerId;
    const ownerId =
      typeof rawId === "number"
        ? rawId
        : typeof rawId === "string" && rawId.trim()
          ? Number(rawId)
          : NaN;
    if (!Number.isFinite(ownerId) || ownerId <= 0) return null;
    if (typeof data.online !== "boolean") return null;
    return { ownerId, online: data.online };
  } catch {
    return null;
  }
}

/**
 * Lightweight pub/sub so mounted wellness panels can reload when a WELLNESS_ACK
 * realtime frame arrives, without each row owning a socket subscription.
 */
type WellnessAckListener = (messageEventId: string) => void;
const wellnessAckListeners = new Set<WellnessAckListener>();

export function subscribeWellnessAck(listener: WellnessAckListener): () => void {
  wellnessAckListeners.add(listener);
  return () => {
    wellnessAckListeners.delete(listener);
  };
}

export function emitWellnessAck(messageEventId: string): void {
  for (const listener of wellnessAckListeners) listener(messageEventId);
}

/** Detect a WELLNESS_ACK frame and emit it to subscribers; returns true if handled. */
export function handleWellnessAckFrame(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (parsed.type !== "WELLNESS_ACK") return false;
    const data = parsed.data as Record<string, unknown> | undefined;
    const id = data?.message_event_id;
    if (typeof id === "string" && id) {
      emitWellnessAck(id);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function parseMessageFeatureSocketEvent(
  raw: string,
): MessageFeatureSocketEvent | null {
  try {
    const parsed = JSON.parse(raw) as SocketEvent;
    if (parsed.type === "NEW_MESSAGE") {
      const normalized = normalizeMessage(parsed.data);
      if (normalized) {
        const data =
          parsed.data && typeof parsed.data === "object"
            ? (parsed.data as Record<string, unknown>)
            : {};
        const memberJoinWelcome =
          data.member_join_welcome === true || data.memberJoinWelcome === true;
        return {
          type: "NEW_MESSAGE",
          data: normalized,
          ...(memberJoinWelcome ? { memberJoinWelcome: true } : {}),
        };
      }
    }
    if (parsed.type === "NEW_GEO_MESSAGE" && isPropagationResponse(parsed.data)) {
      return { type: "NEW_GEO_MESSAGE", data: parsed.data };
    }
    if (parsed.type === "PERMISSION_MESSAGE" && parsed.data) {
      return {
        type: "PERMISSION_MESSAGE",
        data: parsed.data as Record<string, unknown>,
      };
    }
    if (parsed.type === "SMART_HOME_WEBHOOK" && parsed.data && typeof parsed.data === "object") {
      return {
        type: "SMART_HOME_WEBHOOK",
        data: parsed.data as {
          ok?: boolean;
          hid?: string;
          title?: string;
          toast?: string;
        },
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
