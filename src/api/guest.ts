import { request, type ApiResult } from "./client";

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
  guest_id: string;
  zone_id: string;
  guest_name?: string;
  status: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
};

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

export async function listGuestRequests(zoneId: string) {
  return request<GuestRequest[]>({
    method: "GET",
    url: "/api/access/guest-requests",
    params: { zone_id: zoneId },
  });
}

export async function approveGuestRequest(guestId: string) {
  return request<{ ok?: boolean }>({
    method: "POST",
    url: `/message-feature/access/guest-requests/${encodeURIComponent(guestId)}/approve`,
  });
}

export async function rejectGuestRequest(guestId: string) {
  return request<{ ok?: boolean }>({
    method: "POST",
    url: `/message-feature/access/guest-requests/${encodeURIComponent(guestId)}/reject`,
  });
}

export async function generateMemberInviteQr(payload: {
  account_owner_id?: number;
  zone_id?: string;
}) {
  return request<{ token: string; url?: string }>({
    method: "POST",
    url: "/utils/qr/generate",
    data: payload,
  });
}

export async function generateAccessQrToken(payload: {
  zone_id: string;
  expires_at?: string;
}) {
  return request<{ token: string; url?: string }>({
    method: "POST",
    url: "/api/access/qr-tokens",
    data: payload,
  });
}
