/**
 * Anonymous guest-facing API calls. Unlike `@/api/client` these endpoints
 * must NOT carry a member Bearer token (the guest is not signed in yet).
 * Mirrors the web client's `services/api/accessPermissions.ts` +
 * `services/api/guestSession.ts` flow.
 */
import axios, { AxiosError, type AxiosInstance } from "axios";
import { API_BASE_URL } from "./client";

const guestAxios: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

function unwrapEnvelope(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === "object" &&
    "status" in raw &&
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
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readZoneId(row: Record<string, unknown>): string | undefined {
  const direct = readString(row, ["zone_id", "zoneId"]);
  if (direct) return direct;
  const zones = row.zone_ids ?? row.zoneIds;
  if (Array.isArray(zones)) {
    const first = zones.find(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (first) return first.trim();
  }
  return undefined;
}

function readErrorBody(body: unknown): {
  code?: string;
  message: string;
} {
  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    const detail = row.detail;
    if (detail && typeof detail === "object") {
      const detailRow = detail as Record<string, unknown>;
      const code = readString(detailRow, ["error_code", "errorCode"]);
      const message =
        readString(detailRow, ["message", "detail"]) ??
        readString(row, ["message", "detail"]) ??
        "Request failed";
      return { ...(code ? { code } : {}), message };
    }
    const message =
      readString(row, ["detail", "message"]) ?? "Request failed";
    const code = readString(row, ["error_code", "errorCode"]);
    return { ...(code ? { code } : {}), message };
  }
  return { message: "Request failed" };
}

function mapGuestAccessErrorCode(code?: string, fallback?: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  if (c === "INVALID_GUEST_TOKEN" || c === "TOKEN_ZONE_MISMATCH") {
    return "This invite link is invalid. Ask your host for a new guest invite.";
  }
  if (c === "GUEST_NOT_AUTHORIZED_FOR_ZONE") {
    return "Access denied for this zone. Please choose an authorized zone.";
  }
  if (c === "PERMISSION_MANUAL_DISABLED") {
    return "Permission events are automatic from the guest access workflow.";
  }
  return fallback ?? "Request failed";
}

/* --------------------------------------------------------------------- */
/*                          1. Member invite join                        */
/* --------------------------------------------------------------------- */

export type QrJoinPayload = {
  token: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  address: string;
  phone?: string;
};

export type QrJoinResult = {
  data: {
    id: number | string;
    email: string;
    zone_id: string;
    first_name: string;
    last_name: string;
    account_type?: string;
    account_owner_id?: number | null;
  } | null;
  error: string | null;
  status?: number;
};

export async function joinWithQrToken(
  payload: QrJoinPayload,
): Promise<QrJoinResult> {
  try {
    const res = await guestAxios.post<unknown>("/utils/qr/join", payload, {
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const { message } = readErrorBody(res.data);
      return { data: null, error: message, status: res.status };
    }
    const data = unwrapEnvelope(res.data);
    return {
      data: (data as QrJoinResult["data"]) ?? null,
      error: null,
      status: res.status,
    };
  } catch (e) {
    const status = e instanceof AxiosError ? e.response?.status : undefined;
    const msg =
      e instanceof Error ? e.message : "Could not complete invite join.";
    return { data: null, error: msg, ...(status ? { status } : {}) };
  }
}

/* --------------------------------------------------------------------- */
/*                       2. Anonymous guest permission                   */
/* --------------------------------------------------------------------- */

export type AnonymousGuestPermissionBody = {
  guest_qr_token?: string;
  zone_id?: string;
  network_id?: string;
  guest_name: string;
  event_id?: string;
  device_id?: string;
  location?: { lat: number; lng: number };
  sig?: string;
};

export type AnonymousGuestPermissionResult =
  | {
      ok: true;
      status: "EXPECTED" | "UNEXPECTED";
      message: string;
      guestId?: string;
      zoneId?: string;
      exchange_code?: string;
      exchange_expires_at?: string;
    }
  | { ok: false; errorCode?: string; message: string };

export async function submitAnonymousGuestPermission(
  body: AnonymousGuestPermissionBody,
): Promise<AnonymousGuestPermissionResult> {
  const hasToken = Boolean(body.guest_qr_token?.trim());
  const hasZone = Boolean(body.zone_id?.trim());
  const hasNetwork = Boolean(body.network_id?.trim());
  if (!hasToken && !hasZone && !hasNetwork) {
    return { ok: false, message: "Missing zone, network id, or guest access token." };
  }
  try {
    const res = await guestAxios.post<unknown>(
      "/api/access/permission",
      body,
      { validateStatus: () => true },
    );
    if (res.status >= 400) {
      const { code, message } = readErrorBody(res.data);
      return {
        ok: false,
        ...(code ? { errorCode: code } : {}),
        message: mapGuestAccessErrorCode(code, message),
      };
    }
    const data = unwrapEnvelope(res.data);
    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const st = readString(row, ["status", "access_status"])?.toUpperCase();
    const message = readString(row, ["message", "detail", "msg"]) ?? "";
    const guestId = readString(row, ["guest_id", "guestId"]);
    const zoneId = readZoneId(row);
    const exchange_code = readString(row, ["exchange_code", "exchangeCode"]);
    const exchange_expires_at = readString(row, [
      "exchange_expires_at",
      "exchangeExpiresAt",
    ]);
    const exchangeFields =
      exchange_code && exchange_code.trim()
        ? {
            exchange_code: exchange_code.trim(),
            ...(exchange_expires_at?.trim()
              ? { exchange_expires_at: exchange_expires_at.trim() }
              : {}),
          }
        : {};

    if (st === "EXPECTED") {
      return {
        ok: true,
        status: "EXPECTED",
        message: message || "You are expected.",
        ...(guestId ? { guestId } : {}),
        ...(zoneId ? { zoneId } : {}),
        ...exchangeFields,
      };
    }
    return {
      ok: true,
      status: "UNEXPECTED",
      message: message || "Waiting for approval.",
      ...(guestId ? { guestId } : {}),
      ...(zoneId ? { zoneId } : {}),
      ...exchangeFields,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return { ok: false, message: msg };
  }
}

/* --------------------------------------------------------------------- */
/*                       3. Guest access session poll                    */
/* --------------------------------------------------------------------- */

export type GuestAccessSessionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "UNKNOWN";

export type GuestAccessSessionPollResult = {
  status: GuestAccessSessionStatus;
  message?: string;
  exchange_code?: string;
  exchange_expires_at?: string;
  error: string | null;
};

export async function pollGuestAccessSession(
  guestId: string,
  zoneId?: string,
): Promise<GuestAccessSessionPollResult> {
  const id = guestId.trim();
  const z = String(zoneId ?? "").trim();
  if (!id) return { status: "UNKNOWN", error: "Missing guest id." };
  const path = `/api/access/session/${encodeURIComponent(id)}`;
  try {
    const res = await guestAxios.get<unknown>(path, {
      ...(z ? { params: { zone_id: z } } : {}),
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const { code, message } = readErrorBody(res.data);
      return {
        status: "UNKNOWN",
        error: mapGuestAccessErrorCode(
          code,
          message || `Request failed (${res.status})`,
        ),
      };
    }
    const data = unwrapEnvelope(res.data);
    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const st = readString(row, [
      "status",
      "approval_status",
      "session_status",
    ])?.toUpperCase();
    const message = readString(row, ["message", "detail", "msg"]);
    if (st === "APPROVED" || st === "GRANTED") {
      const exchange_code = readString(row, ["exchange_code", "exchangeCode"]);
      const exchange_expires_at = readString(row, [
        "exchange_expires_at",
        "exchangeExpiresAt",
      ]);
      return {
        status: "APPROVED",
        ...(message ? { message } : {}),
        ...(exchange_code ? { exchange_code } : {}),
        ...(exchange_expires_at ? { exchange_expires_at } : {}),
        error: null,
      };
    }
    if (st === "REJECTED" || st === "DENIED") {
      return {
        status: "REJECTED",
        ...(message ? { message } : {}),
        error: null,
      };
    }
    if (st === "PENDING" || st === "REVIEW" || st === "WAITING") {
      return {
        status: "PENDING",
        ...(message ? { message } : {}),
        error: null,
      };
    }
    return {
      status: "UNKNOWN",
      ...(message ? { message } : {}),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return { status: "UNKNOWN", error: msg };
  }
}

/* --------------------------------------------------------------------- */
/*                4. Guest session exchange (anonymous bearer)           */
/* --------------------------------------------------------------------- */

export type GuestSessionExchangeRequest = {
  guest_id: string;
  zone_id: string;
  exchange_code: string;
  device_id?: string;
};

export type GuestSessionExchangeData = {
  access_token: string;
  token_type: string;
  expires_in: number;
  guest: {
    guest_id: string;
    display_name: string;
    zone_ids: string[];
    allowed_message_types: string[];
  };
};

export type GuestSessionExchangeResult = {
  data: GuestSessionExchangeData | null;
  error: string | null;
  status?: number;
};

export async function exchangeGuestSession(
  body: GuestSessionExchangeRequest,
): Promise<GuestSessionExchangeResult> {
  try {
    const res = await guestAxios.post<unknown>(
      "/api/access/guest-session",
      body,
      { validateStatus: () => true },
    );
    if (res.status === 404) {
      return {
        data: null,
        error:
          "Guest session API is not available yet (404). Ask your host to update the server.",
        status: 404,
      };
    }
    if (res.status >= 400) {
      const { message } = readErrorBody(res.data);
      return { data: null, error: message, status: res.status };
    }
    const data = unwrapEnvelope(res.data);
    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const access_token = readString(row, ["access_token", "accessToken"]);
    if (!access_token) {
      return {
        data: null,
        error: "Unexpected response from guest session exchange.",
        status: res.status,
      };
    }
    const token_type =
      readString(row, ["token_type", "tokenType"]) ?? "Bearer";
    const expires_in =
      typeof row.expires_in === "number" && Number.isFinite(row.expires_in)
        ? row.expires_in
        : typeof row.expiresIn === "number" && Number.isFinite(row.expiresIn)
          ? row.expiresIn
          : 3600;
    const g =
      row.guest && typeof row.guest === "object" && !Array.isArray(row.guest)
        ? (row.guest as Record<string, unknown>)
        : {};
    const guest_id = readString(g, ["guest_id", "guestId"]) ?? "";
    const display_name = readString(g, ["display_name", "displayName"]) ?? "";
    const zone_ids = Array.isArray(g.zone_ids)
      ? (g.zone_ids as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        )
      : [];
    const allowedRaw = g.allowed_message_types ?? g.allowedMessageTypes;
    const allowed_message_types: string[] = Array.isArray(allowedRaw)
      ? (allowedRaw as unknown[])
          .filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          )
          .map((s) => s.trim().toUpperCase())
      : ["PERMISSION", "CHAT"];

    return {
      data: {
        access_token,
        token_type,
        expires_in,
        guest: { guest_id, display_name, zone_ids, allowed_message_types },
      },
      error: null,
      status: res.status,
    };
  } catch (e) {
    const status = e instanceof AxiosError ? e.response?.status : undefined;
    const msg = e instanceof Error ? e.message : "Request failed";
    return { data: null, error: msg, ...(status ? { status } : {}) };
  }
}
