import { request } from "./client";

export type MessageType =
  | "ALARM"
  | "ALERT"
  | "SERVICE"
  | "PRIVATE"
  | "PERMISSION"
  | "CHAT"
  | "UNKNOWN";

export type MessageScope = "public" | "private";

export type Message = {
  id: string;
  zone_id: string;
  sender_id: number;
  receiver_id: number | null;
  type: MessageType;
  category: "Alarm" | "Alert" | "Access";
  scope: MessageScope;
  visibility: MessageScope;
  message: string;
  created_at: string;
  guest_id?: string | null;
  guest_sender_id?: string;
  raw_payload?: Record<string, unknown> | null;
};

export const GUEST_LOGICAL_SENDER_ID = 0;

function toMessageType(value: unknown): MessageType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  if (
    v === "ALARM" ||
    v === "ALERT" ||
    v === "SERVICE" ||
    v === "PRIVATE" ||
    v === "PERMISSION" ||
    v === "CHAT"
  )
    return v;
  return null;
}

function toLegacyTypeFromVisibility(visibility: unknown): MessageType | null {
  if (visibility === "private") return "PRIVATE";
  if (visibility === "public") return "SERVICE";
  return null;
}

function getCategoryForType(type: MessageType): Message["category"] {
  if (type === "ALARM") return "Alarm";
  if (type === "ALERT" || type === "SERVICE") return "Alert";
  return "Access";
}

function getScopeForType(type: MessageType): MessageScope {
  if (type === "PRIVATE" || type === "CHAT") return "private";
  return "public";
}

function normalizeOwnerId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row.id;
  const zoneId = row.zone_id ?? row.zoneId;
  const senderId = normalizeOwnerId(row.sender_id ?? row.owner_id);
  const createdAt = row.created_at;
  const directType = toMessageType(row.type ?? row.message_type);
  const fallbackType = toLegacyTypeFromVisibility(row.visibility);
  const type = directType ?? fallbackType ?? "UNKNOWN";

  const msgRecord =
    row.msg && typeof row.msg === "object" && !Array.isArray(row.msg)
      ? (row.msg as Record<string, unknown>)
      : null;

  let body =
    typeof row.message === "string"
      ? row.message
      : msgRecord && typeof msgRecord.text === "string"
        ? (msgRecord.text as string)
        : "";

  if (!body && (type === "PERMISSION" || type === "CHAT")) {
    body = type === "PERMISSION" ? "(Permission traffic)" : "(Chat)";
  }

  if (
    id == null ||
    !zoneId ||
    typeof createdAt !== "string" ||
    body.trim().length === 0
  )
    return null;

  const guestSender =
    typeof row.guest_id === "string"
      ? row.guest_id
      : typeof (msgRecord as Record<string, unknown> | null)?.guest_id ===
          "string"
        ? ((msgRecord as Record<string, unknown>).guest_id as string)
        : null;

  const resolvedSender =
    senderId ??
    (guestSender && (type === "CHAT" || type === "PERMISSION")
      ? GUEST_LOGICAL_SENDER_ID
      : null);

  if (resolvedSender == null) return null;

  return {
    id: String(id),
    zone_id: String(zoneId),
    sender_id: resolvedSender,
    receiver_id: normalizeOwnerId(row.receiver_id),
    type,
    category: getCategoryForType(type),
    scope: getScopeForType(type),
    visibility: getScopeForType(type),
    message: body,
    created_at: createdAt,
    raw_payload: msgRecord,
    ...(guestSender ? { guest_id: guestSender } : {}),
    ...(senderId == null && guestSender
      ? { guest_sender_id: guestSender }
      : {}),
  };
}

export type ListMessagesParams = {
  owner_id: number;
  other_owner_id?: number;
  skip?: number;
  limit?: number;
};

export async function listMessages(params: ListMessagesParams) {
  const result = await request<unknown[]>({
    method: "GET",
    url: "/messages/",
    params,
  });
  return {
    ...result,
    data: (result.data ?? [])
      .map(normalizeMessage)
      .filter((m): m is Message => Boolean(m)),
  };
}

export type SendMessagePayload = {
  message: string;
  type: MessageType;
  zone_id?: string;
  receiver_id?: number;
  guest_id?: string;
};

export async function sendMessage(payload: SendMessagePayload) {
  const data: Record<string, unknown> = {
    message: payload.message,
    message_type: payload.type,
    visibility: getScopeForType(payload.type),
    ...(payload.zone_id ? { zone_id: payload.zone_id } : {}),
  };
  if (payload.guest_id?.trim()) {
    data.guest_id = payload.guest_id.trim();
  } else if (payload.receiver_id != null) {
    data.receiver_id = payload.receiver_id;
  }
  const result = await request<unknown>({
    method: "POST",
    url: "/messages",
    data,
  });
  return { ...result, data: normalizeMessage(result.data) };
}
