/**
 * Authenticated guest API (post-approval).
 *
 * Uses the GUEST bearer token stored after `exchangeGuestSession` — NOT the
 * member token. Mirrors the web client's `services/api/guestMessages.ts`:
 *   GET  /api/guest/me
 *   GET  /api/guest/zones/{zone}/peers
 *   GET  /api/guest/messages?zone_id=&with_owner_id=&limit=
 *   POST /api/guest/messages   { zone_id, type: "CHAT", text, to_owner_id }
 *   GET  /api/guest/zones/{zone}/dashboard
 *
 * On 401 the stored guest session is cleared so the UI can send the guest back
 * to the check-in screen.
 */
import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "./client";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
} from "@/lib/storage";

const GUEST_API_BASE = "/api/guest";

const guestAxios: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

guestAxios.interceptors.request.use(async (config) => {
  const session = await getStoredGuestSession();
  if (session?.access_token && config.headers) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export type GuestApiResult<T> = {
  data: T | null;
  error: string | null;
  /** True when the guest token was rejected (revoked / expired). */
  unauthorized?: boolean;
  notFound?: boolean;
};

function unwrapEnvelope(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as { status?: string }).status === "success" &&
    "data" in raw
  ) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Like readString but coerces finite numbers (the backend sends owner ids as JSON numbers). */
function readIdString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  }
  return undefined;
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function errorFromBody(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    const detail = row.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (detail && typeof detail === "object") {
      const msg = readString(detail as Record<string, unknown>, [
        "message",
        "detail",
      ]);
      if (msg) return msg;
    }
    const msg = readString(row, ["message", "detail", "error"]);
    if (msg) return msg;
  }
  return status === 401
    ? "Your guest access was revoked or expired."
    : `Request failed (${status}).`;
}

async function guestRequest<T>(config: {
  method: "get" | "post";
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
  parse: (data: unknown) => T;
  treat404AsEmpty?: boolean;
}): Promise<GuestApiResult<T>> {
  try {
    const res = await guestAxios.request<unknown>({
      method: config.method,
      url: config.url,
      ...(config.params ? { params: config.params } : {}),
      ...(config.data != null ? { data: config.data } : {}),
      validateStatus: () => true,
    });
    if (res.status === 401) {
      await clearStoredGuestSession();
      return {
        data: null,
        error: errorFromBody(401, res.data),
        unauthorized: true,
      };
    }
    if (res.status === 404 && config.treat404AsEmpty) {
      return { data: null, error: null, notFound: true };
    }
    if (res.status >= 400) {
      return { data: null, error: errorFromBody(res.status, res.data) };
    }
    return { data: config.parse(unwrapEnvelope(res.data)), error: null };
  } catch (e) {
    const status = e instanceof AxiosError ? e.response?.status : undefined;
    if (status === 401) await clearStoredGuestSession();
    return {
      data: null,
      error: e instanceof Error ? e.message : "Request failed",
      ...(status === 401 ? { unauthorized: true } : {}),
    };
  }
}

/* ------------------------------------------------------------------ */
/*                                me                                  */
/* ------------------------------------------------------------------ */

export type GuestMe = {
  guest_id: string;
  display_name: string;
  zone_ids: string[];
  allowed_message_types: string[];
};

export async function fetchGuestMe(): Promise<GuestApiResult<GuestMe>> {
  return guestRequest<GuestMe>({
    method: "get",
    url: `${GUEST_API_BASE}/me`,
    parse: (data) => {
      const row =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      const allowed = readStringArray(
        row.allowed_message_types ?? row.allowedMessageTypes,
      ).map((s) => s.toUpperCase());
      return {
        guest_id: readString(row, ["guest_id", "guestId"]) ?? "",
        display_name: readString(row, ["display_name", "displayName"]) ?? "",
        zone_ids: readStringArray(row.zone_ids ?? row.zoneIds),
        allowed_message_types: allowed.length ? allowed : ["CHAT"],
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/*                               peers                                */
/* ------------------------------------------------------------------ */

export type GuestPeer = {
  owner_id: string;
  display_name?: string;
};

export async function fetchGuestPeers(
  zoneId: string,
): Promise<GuestApiResult<GuestPeer[]>> {
  const z = zoneId.trim();
  if (!z) return { data: [], error: null };
  return guestRequest<GuestPeer[]>({
    method: "get",
    url: `${GUEST_API_BASE}/zones/${encodeURIComponent(z)}/peers`,
    parse: (data) => {
      let arr: unknown[] = [];
      if (Array.isArray(data)) {
        arr = data;
      } else if (data && typeof data === "object") {
        const bag = data as Record<string, unknown>;
        for (const key of [
          "peers",
          "items",
          "hosts",
          "staff",
          "members",
          "zone_members",
          "admins",
          "contacts",
        ]) {
          if (Array.isArray(bag[key])) {
            arr = bag[key] as unknown[];
            break;
          }
        }
      }
      return arr
        .map((raw): GuestPeer | null => {
          if (!raw || typeof raw !== "object") return null;
          const row = raw as Record<string, unknown>;
          const owner_id =
            readIdString(row, [
              "owner_id",
              "ownerId",
              "user_id",
              "userId",
              "account_owner_id",
              "accountOwnerId",
              "id",
            ]) ?? "";
          if (!owner_id) return null;
          const display_name = readString(row, [
            "display_name",
            "displayName",
            "name",
            "label",
          ]);
          return { owner_id, ...(display_name ? { display_name } : {}) };
        })
        .filter((p): p is GuestPeer => p != null);
    },
  });
}

/* ------------------------------------------------------------------ */
/*                              messages                              */
/* ------------------------------------------------------------------ */

export type GuestMessage = {
  id: string;
  zone_id: string;
  type: string;
  text?: string;
  from_owner_id?: string;
  to_owner_id?: string;
  created_at?: string;
  permission_visibility?: string | null;
};

function readNestedOwnerId(value: unknown): string | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return readIdString(value as Record<string, unknown>, [
      "owner_id",
      "ownerId",
      "id",
    ]);
  }
  return undefined;
}

function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id =
    readString(row, ["id", "message_id", "messageId"]) ??
    (typeof row.id === "number" ? String(row.id) : "");
  if (!id) return null;
  const fromOwnerId =
    readIdString(row, ["from_owner_id", "fromOwnerId", "sender_id"]) ??
    readNestedOwnerId(row.from);
  const toOwnerId =
    readIdString(row, ["to_owner_id", "toOwnerId", "receiver_id"]) ??
    readNestedOwnerId(row.to);
  return {
    id,
    zone_id: readString(row, ["zone_id", "zoneId"]) ?? "",
    type: (readString(row, ["type", "message_type"]) ?? "CHAT").toUpperCase(),
    ...(readString(row, ["text", "msg", "description"])
      ? { text: readString(row, ["text", "msg", "description"]) }
      : {}),
    ...(fromOwnerId ? { from_owner_id: fromOwnerId } : {}),
    ...(toOwnerId ? { to_owner_id: toOwnerId } : {}),
    ...(readString(row, ["created_at", "createdAt"])
      ? { created_at: readString(row, ["created_at", "createdAt"]) }
      : {}),
    ...(typeof row.permission_visibility === "string"
      ? { permission_visibility: row.permission_visibility }
      : {}),
  };
}

export async function listGuestThreadMessages(params: {
  zone_id: string;
  with_owner_id: string;
  limit?: number;
}): Promise<GuestApiResult<GuestMessage[]>> {
  const z = params.zone_id.trim();
  const peer = params.with_owner_id.trim();
  if (!z || !peer) return { data: [], error: null };
  return guestRequest<GuestMessage[]>({
    method: "get",
    url: `${GUEST_API_BASE}/messages`,
    params: {
      zone_id: z,
      with_owner_id: peer,
      ...(params.limit ? { limit: params.limit } : {}),
    },
    parse: (data) => {
      // The backend wraps the thread in { items: [...], next_cursor }
      // (GuestMessagesListData). Older/alt shapes used `messages`. Accept a
      // bare array too, so the thread renders regardless of envelope shape.
      let arr: unknown[] = [];
      if (Array.isArray(data)) {
        arr = data;
      } else if (data && typeof data === "object") {
        const bag = data as Record<string, unknown>;
        for (const key of ["items", "messages", "data"]) {
          if (Array.isArray(bag[key])) {
            arr = bag[key] as unknown[];
            break;
          }
        }
      }
      return arr
        .map((m) => parseGuestMessage(m))
        .filter((m): m is GuestMessage => m != null)
        .sort((a, b) => {
          // Oldest → newest so the chat reads top-to-bottom (the screen scrolls
          // to the end). Fall back to id when timestamps are equal/missing.
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (ta !== tb) return ta - tb;
          return a.id.localeCompare(b.id);
        });
    },
  });
}

export async function sendGuestMessage(body: {
  zone_id: string;
  text: string;
  to_owner_id: string;
}): Promise<GuestApiResult<GuestMessage>> {
  return guestRequest<GuestMessage>({
    method: "post",
    url: `${GUEST_API_BASE}/messages`,
    data: {
      zone_id: body.zone_id.trim(),
      type: "CHAT",
      text: body.text,
      // Backend expects owners.id as an integer; coerce when numeric.
      to_owner_id: /^\d+$/.test(body.to_owner_id.trim())
        ? Number(body.to_owner_id.trim())
        : body.to_owner_id.trim(),
    },
    parse: (data) => parseGuestMessage(data) ?? {
      id: "",
      zone_id: body.zone_id.trim(),
      type: "CHAT",
      text: body.text,
    },
  });
}

/* ------------------------------------------------------------------ */
/*                             dashboard                              */
/* ------------------------------------------------------------------ */

export async function fetchGuestZoneDashboard(
  zoneId: string,
): Promise<GuestApiResult<unknown>> {
  const z = zoneId.trim();
  if (!z) return { data: null, error: null };
  return guestRequest<unknown>({
    method: "get",
    url: `${GUEST_API_BASE}/zones/${encodeURIComponent(z)}/dashboard`,
    parse: (data) => data,
    treat404AsEmpty: true,
  });
}
