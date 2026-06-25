import { API_BASE_URL } from "@/api/client";
import { normalizeMessage, type Message, type MessageFeaturePropagationResponse } from "@/api/messages";

type IncomingNewMessage = {
  type: "NEW_MESSAGE";
  data: Message;
};

export type MessageFeatureSocketEvent =
  | IncomingNewMessage
  | { type: "NEW_GEO_MESSAGE"; data: MessageFeaturePropagationResponse }
  | { type: "PERMISSION_MESSAGE"; data: Record<string, unknown> };

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
      t === "guest_is_here"
    );
  } catch {
    return false;
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
      if (normalized) return { type: "NEW_MESSAGE", data: normalized };
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
  } catch {
    /* ignore */
  }
  return null;
}
