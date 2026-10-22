import { request } from "./client";

export type UniversalAccessZone = {
  id: number;
  name: string;
  zone_type: string;
  is_primary?: boolean;
  communal?: boolean;
  network_id?: string;
  owner_id?: number;
};

export type UniversalAccessInvitee = {
  id: number;
  name: string;
  email: string;
  network_id?: string;
};

export type UniversalAccessRequestRow = {
  id: number;
  request_kind: "invite" | "place_access" | string;
  member_id: number;
  member_name: string;
  email: string;
  address?: string;
  country?: string;
  region?: string;
  city?: string;
  place: string;
  zone_ids: number[];
  zones: UniversalAccessZone[];
  candidate_zones?: UniversalAccessZone[];
  note: string;
  status: "pending" | "approved" | "rejected" | string;
  reject_reason: string;
  network_id: string;
  network_admin_name: string;
  created_at?: string | null;
  code?: string | null;
  credential_id?: number | null;
  enabled?: boolean | null;
  photo_id?: string;
  business_document?: string;
};

export async function listShareableUniversalZones() {
  return request<UniversalAccessZone[]>({
    method: "GET",
    url: "/universal-access/shareable-zones",
  });
}

export async function searchUniversalAccessInvitees(query: string) {
  return request<UniversalAccessInvitee[]>({
    method: "GET",
    url: "/universal-access/invitees",
    params: { q: query },
  });
}

export async function listUniversalAccessRequests() {
  return request<UniversalAccessRequestRow[]>({
    method: "GET",
    url: "/universal-access/requests",
  });
}

export async function getUniversalAccessRequest(id: number) {
  return request<UniversalAccessRequestRow>({
    method: "GET",
    url: `/universal-access/requests/${id}`,
  });
}

export async function createInviteUniversalAccessRequest(payload: {
  invitee_email: string;
  zone_ids: number[];
  note?: string;
}) {
  return request<UniversalAccessRequestRow>({
    method: "POST",
    url: "/universal-access/requests/invite",
    data: payload,
  });
}

export async function createPlaceAccessUniversalRequest(payload: {
  country?: string;
  region?: string;
  city?: string;
  photo_id: string;
  business_document: string;
  note?: string;
}) {
  return request<UniversalAccessRequestRow>({
    method: "POST",
    url: "/universal-access/requests/place-access",
    data: payload,
  });
}

export async function approveUniversalAccessRequest(id: number, zoneIds?: number[]) {
  return request<UniversalAccessRequestRow>({
    method: "POST",
    url: `/universal-access/requests/${id}/approve`,
    data: { zone_ids: zoneIds ?? [] },
  });
}

export async function rejectUniversalAccessRequest(id: number, reason: string) {
  return request<UniversalAccessRequestRow>({
    method: "POST",
    url: `/universal-access/requests/${id}/reject`,
    data: { reason },
  });
}

export async function setUniversalAccessEnabled(
  credentialId: number,
  enabled: boolean,
) {
  return request<UniversalAccessRequestRow>({
    method: "POST",
    url: `/universal-access/credentials/${credentialId}/enabled`,
    data: { enabled },
  });
}
