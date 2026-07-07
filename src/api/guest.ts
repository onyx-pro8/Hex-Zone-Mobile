import Constants from "expo-constants";
import { API_BASE_URL, request, type ApiResult } from "./client";

export type GuestPassStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED";

export type GuestPass = {
  id: string;
  zone_id: string;
  event_id: string;
  guest_name: string | null;
  notes: string | null;
  status: GuestPassStatus;
  requested_by: number;
  requested_by_name?: string;
  reviewed_by: number | null;
  used_by_guest_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  is_expired?: boolean;
};

export type CreateGuestPassBody = {
  zone_id: string;
  event_id: string;
  guest_name?: string;
  notes?: string;
  expires_at: string;
};

export type GuestRequest = {
  /** Session row id (preferred for approve/reject paths). */
  id: string;
  guest_id: string;
  zone_id: string;
  guest_name?: string;
  status: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "ARRIVED";
  expectation?: "expected" | "unexpected";
  created_at: string;
};

function normalizeGuestRequestRow(raw: unknown): GuestRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const guestId = String(r.guest_id ?? r.guestId ?? "").trim();
  const idRaw = r.id ?? r.request_id ?? r.permission_request_id;
  const id =
    idRaw != null && String(idRaw).trim()
      ? String(idRaw).trim()
      : guestId;
  if (!id && !guestId) return null;

  const statusRaw = String(
    r.approval_status ?? r.status ?? r.resolution ?? "",
  ).toUpperCase();
  let approval_status: GuestRequest["approval_status"] = "PENDING";
  if (statusRaw === "APPROVED" || statusRaw === "GRANTED") {
    approval_status = "APPROVED";
  } else if (statusRaw === "REJECTED" || statusRaw === "DENIED") {
    approval_status = "REJECTED";
  } else if (statusRaw === "ARRIVED") {
    approval_status = "ARRIVED";
  } else if (statusRaw === "PENDING" || statusRaw === "REVIEW") {
    approval_status = "PENDING";
  }

  const kind = String(r.kind ?? r.expectation ?? "").toLowerCase();
  const expectation: GuestRequest["expectation"] =
    kind.includes("unexpected") ||
    String(r.guest_status ?? "").toUpperCase() === "UNEXPECTED" ||
    r.unexpected === true
      ? "unexpected"
      : "expected";

  const created =
    r.created_at ?? r.arrived_at ?? r.time ?? new Date().toISOString();

  return {
    id: id || guestId,
    guest_id: guestId || id,
    zone_id: String(r.zone_id ?? r.zoneId ?? "").trim(),
    guest_name:
      typeof r.guest_name === "string" && r.guest_name.trim()
        ? r.guest_name.trim()
        : undefined,
    status: statusRaw || approval_status,
    approval_status,
    expectation,
    created_at: String(created),
  };
}

/** Whether approve/reject actions should show (aligned with web dashboard). */
export function guestRequestShowsApprovalActions(row: GuestRequest): boolean {
  if (row.expectation === "unexpected") {
    return row.approval_status === "PENDING" || row.approval_status === "ARRIVED";
  }
  return row.approval_status === "PENDING";
}

/* --------------------------- Member invite QR --------------------------- */

export type MemberInviteQrToken = {
  id: number;
  token: string;
  owner_id: number;
  used: boolean;
  expires_at: string;
  created_at: string;
};

export type MemberInviteQrResult = MemberInviteQrToken & {
  /** Composed deep link encoded inside the QR. Built locally because the
   *  `/utils/qr/generate` endpoint returns just the token. */
  url: string;
  base_url: string;
};

type ExtraConfig = { webAppBaseUrl?: string; apiBaseUrl?: string };
const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

/** Web app origin used when the QR must encode an absolute URL but the
 *  server-issued response only contained a relative `/access?...` path. */
export function webAppBaseUrl(): string {
  const explicit = expoExtra.webAppBaseUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return API_BASE_URL.replace(/\/+$/, "");
}

/** App URL scheme (registered in app.json `scheme`). */
export function appScheme(): string {
  const raw = Constants.expoConfig?.scheme;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const scheme = typeof value === "string" ? value.trim() : "";
  return scheme || "zoneweaver";
}

/** Build any deep link of the form `<scheme>:///<path>?<query>`. */
export function buildAppDeepLink(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const cleaned = (path || "").trim().replace(/^\/+/, "");
  const qs = Object.entries(query ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${appScheme()}:///${cleaned}${qs ? `?${qs}` : ""}`;
}

/** Member invite deep link encoded into the QR. */
export function buildMemberInviteUrl(token: string): string {
  return buildAppDeepLink("join", { token });
}

/**
 * Convert a server-provided `/access?...` path into an app deep link.
 * Example: `/access?gt=...&zid=...` → `zoneweaver:///access?gt=...&zid=...`
 */
export function toAccessDeepLink(pathWithQuery: string | null | undefined): string | null {
  const path = (pathWithQuery ?? "").trim();
  if (!path) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)) return path;
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return `${appScheme()}:///${cleaned}`;
}

export async function generateMemberInviteQr(payload?: {
  expires_in_hours?: number;
}): Promise<ApiResult<MemberInviteQrResult>> {
  const result = await request<MemberInviteQrToken>({
    method: "POST",
    url: "/utils/qr/generate",
    data: { expires_in_hours: payload?.expires_in_hours ?? 24 },
  });
  if (result.error || !result.data?.token) {
    return {
      ...result,
      data: null,
    };
  }
  const url = buildMemberInviteUrl(result.data.token);
  return {
    ...result,
    data: { ...result.data, url, base_url: webAppBaseUrl() },
  };
}

/* ------------------------- Guest access QR (zone) ----------------------- */

export type GuestAccessQrLink = {
  url: string | null;
  zone_id: string;
  path_with_query: string;
};

export async function getGuestAccessQrLink(params: {
  zone_id: string;
  event_id?: string;
}) {
  return request<GuestAccessQrLink>({
    method: "GET",
    url: "/api/access/qr-link",
    params: {
      zone_id: params.zone_id,
      ...(params.event_id ? { event_id: params.event_id } : {}),
    },
  });
}

/* ------------------ Guest access stored QR tokens (gt) ------------------ */

export type GuestAccessQrToken = {
  id: number;
  zone_id: string;
  event_id: string | null;
  label: string | null;
  expires_at: string | null;
  is_primary: boolean;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
  last_used_at: string | null;
  created_by_owner_id: number;
  token_suffix: string;
};

export type GuestAccessQrTokenCreated = GuestAccessQrToken & {
  token: string;
  url: string | null;
  path_with_query: string;
};

export type GuestAccessQrTokenLink = {
  id: number;
  url: string | null;
  path_with_query: string;
};

export type CreateGuestAccessQrTokenPayload = {
  zone_id: string;
  expires_in_hours?: number;
  expires_at?: string;
  event_id?: string;
  label?: string;
  max_uses?: number;
  is_primary?: boolean;
};

export async function createGuestAccessQrToken(
  payload: CreateGuestAccessQrTokenPayload,
) {
  return request<GuestAccessQrTokenCreated>({
    method: "POST",
    url: "/api/access/qr-tokens",
    data: payload,
  });
}

export async function listGuestAccessQrTokens(params: {
  zone_id: string;
  include_revoked?: boolean;
  limit?: number;
}) {
  return request<GuestAccessQrToken[]>({
    method: "GET",
    url: "/api/access/qr-tokens",
    params: {
      zone_id: params.zone_id,
      include_revoked: params.include_revoked ?? false,
      limit: params.limit ?? 50,
    },
  });
}

export async function revokeGuestAccessQrToken(
  qrTokenId: number,
  zoneId: string,
) {
  return request<GuestAccessQrToken>({
    method: "POST",
    url: `/api/access/qr-tokens/${qrTokenId}/revoke`,
    params: { zone_id: zoneId },
  });
}

export async function getGuestAccessQrTokenLink(
  qrTokenId: number,
  zoneId: string,
) {
  return request<GuestAccessQrTokenLink>({
    method: "GET",
    url: `/api/access/qr-tokens/${qrTokenId}/link`,
    params: { zone_id: zoneId },
  });
}

export async function fetchNetworkAccessQrToken(zoneId: string) {
  return request<{
    url: string | null;
    path_with_query: string;
    token_suffix?: string;
    zone_id: string;
  }>({
    method: "GET",
    url: "/api/access/qr-tokens/network",
    params: { zone_id: zoneId.trim() },
  });
}

export async function rotateNetworkAccessQrToken(zoneId: string) {
  return request<{
    url: string | null;
    path_with_query: string;
    token_suffix?: string;
    zone_id: string;
  }>({
    method: "POST",
    url: "/api/access/qr-tokens/network/rotate",
    params: { zone_id: zoneId.trim() },
    data: {},
  });
}

/** Backwards-compatible helper used by older callers (Messages compose etc.). */
export async function generateAccessQrToken(payload: {
  zone_id: string;
  expires_at?: string;
}): Promise<ApiResult<{ token: string; url?: string }>> {
  const result = await createGuestAccessQrToken(payload);
  if (result.error || !result.data) {
    return { ...result, data: null };
  }
  return {
    ...result,
    data: { token: result.data.token, url: result.data.url ?? undefined },
  };
}

/* --------------------------- Guest passes ------------------------------- */

export async function createGuestPass(body: CreateGuestPassBody) {
  return request<GuestPass>({
    method: "POST",
    url: "/api/access/guest-passes",
    data: body,
  });
}

export async function listGuestPasses(
  zoneId: string,
  statusFilter?: string,
): Promise<ApiResult<GuestPass[]>> {
  const params: Record<string, string> = { zone_id: zoneId };
  if (statusFilter && statusFilter !== "ALL") params.status = statusFilter;
  const result = await request<unknown>({
    method: "GET",
    url: "/api/access/guest-passes",
    params,
  });
  if (result.error) return { data: [], error: result.error, loading: false };
  const raw = result.data;
  const list = Array.isArray(raw)
    ? (raw as GuestPass[])
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).items)
      ? ((raw as { items: GuestPass[] }).items)
      : [];
  return { data: list, error: null, loading: false };
}

export async function acceptGuestPass(passId: string, zoneId: string) {
  return request<GuestPass>({
    method: "POST",
    url: `/api/access/guest-passes/${encodeURIComponent(passId)}/accept`,
    data: { zone_id: zoneId },
  });
}

export async function rejectGuestPass(passId: string, zoneId: string) {
  return request<GuestPass>({
    method: "POST",
    url: `/api/access/guest-passes/${encodeURIComponent(passId)}/reject`,
    data: { zone_id: zoneId },
  });
}

export async function revokeGuestPass(passId: string, zoneId: string) {
  return request<GuestPass>({
    method: "POST",
    url: `/api/access/guest-passes/${encodeURIComponent(passId)}/revoke`,
    data: { zone_id: zoneId },
  });
}

/* ------------------------ Guest requests / list ------------------------- */

export async function listGuestRequests(
  zoneId: string,
): Promise<ApiResult<GuestRequest[]>> {
  const result = await request<unknown>({
    method: "GET",
    url: "/api/access/guest-requests",
    params: { zone_id: zoneId },
  });
  if (result.error) {
    return { data: [], error: result.error, loading: false };
  }
  const raw = result.data;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : [];
  const rows = list
    .map((item) => normalizeGuestRequestRow(item))
    .filter((row): row is GuestRequest => row != null);
  return { data: rows, error: null, loading: false };
}

export async function approveGuestRequest(requestId: string, zoneId: string) {
  const id = requestId.trim();
  const zid = zoneId.trim();
  if (!id || !zid) {
    return {
      data: null,
      error: "Missing guest request or network id.",
      loading: false,
    };
  }
  return request<{ ok?: boolean }>({
    method: "POST",
    url: `/message-feature/access/guest-requests/${encodeURIComponent(id)}/approve`,
    params: { zone_id: zid },
  });
}

export async function rejectGuestRequest(requestId: string, zoneId: string) {
  const id = requestId.trim();
  const zid = zoneId.trim();
  if (!id || !zid) {
    return {
      data: null,
      error: "Missing guest request or network id.",
      loading: false,
    };
  }
  return request<{ ok?: boolean }>({
    method: "POST",
    url: `/message-feature/access/guest-requests/${encodeURIComponent(id)}/reject`,
    params: { zone_id: zid },
  });
}

/* --------------------------- Access schedules --------------------------- */

export type AccessSchedule = {
  id: number;
  zone_id: string;
  event_id: string | null;
  guest_id: string | null;
  guest_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notify_member_assist: boolean;
  active: boolean;
  created_by_owner_id: number | null;
  created_at: string;
};

export type CreateAccessSchedulePayload = {
  zone_id: string;
  event_id?: string;
  guest_id?: string;
  guest_name?: string;
  starts_at?: string;
  ends_at?: string;
  notify_member_assist?: boolean;
};

export async function listAccessSchedules(zoneId?: string) {
  return request<AccessSchedule[]>({
    method: "GET",
    url: "/message-feature/access/schedules",
    params: zoneId ? { zone_id: zoneId } : undefined,
  });
}

export async function createAccessSchedule(payload: CreateAccessSchedulePayload) {
  return request<AccessSchedule>({
    method: "POST",
    url: "/message-feature/access/schedules",
    data: {
      ...payload,
      notify_member_assist: payload.notify_member_assist ?? false,
    },
  });
}
