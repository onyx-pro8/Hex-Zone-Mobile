import axios, { AxiosError } from "axios";
import { API_BASE_URL, type ApiResult } from "./client";
import { clearStoredGuestSession, getStoredGuestSession } from "@/lib/storage";

export type GuestGeoPropagationPayload = {
  type: string;
  hid: string;
  tt?: string;
  msg: Record<string, unknown>;
  position: { latitude: number; longitude: number };
  city?: string;
  province?: string;
  country?: string;
  to?: string;
  co?: string;
  receiver_owner_id?: number;
};

export type GuestGeoPropagationResponse = {
  id?: string | null;
  skipped?: boolean;
  delivered_owner_ids?: number[];
};

function parsePropagateResponse(raw: unknown): GuestGeoPropagationResponse {
  const body =
    raw && typeof raw === "object" && "data" in raw
      ? (raw as { data: unknown }).data
      : raw;
  if (!body || typeof body !== "object") return {};
  return body as GuestGeoPropagationResponse;
}

function errorFromBody(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    const detail = row.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (detail && typeof detail === "object") {
      const msg = (detail as { message?: string }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    const msg = row.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return status === 401
    ? "Your guest access was revoked or expired."
    : `Request failed (${status}).`;
}

export async function propagateNetworkGuestMessage(
  payload: GuestGeoPropagationPayload,
): Promise<ApiResult<GuestGeoPropagationResponse>> {
  const session = await getStoredGuestSession();
  if (!session?.access_token) {
    return { data: null, error: "Guest session expired." };
  }
  try {
    const res = await axios.post<unknown>(
      `${API_BASE_URL}/api/guest/messages/propagate`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
        timeout: 20000,
      },
    );
    if (res.status === 401) {
      await clearStoredGuestSession();
      return {
        data: null,
        error: errorFromBody(401, res.data),
        unauthorized: true,
      };
    }
    if (res.status >= 400) {
      return { data: null, error: errorFromBody(res.status, res.data) };
    }
    return { data: parsePropagateResponse(res.data), error: null };
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

export type GuestPrivateSearchResponse = {
  zone_ids: string[];
  members: {
    id: number;
    display_name: string;
    email: string;
    zone_id: string | null;
    subtitle: string;
  }[];
  location_status?: "inside_zone" | "outside_zone" | "no_coordinates" | "not_in_network";
};

export async function searchNetworkGuestPrivateRecipients(
  query: string,
  position?: { latitude: number; longitude: number },
): Promise<ApiResult<GuestPrivateSearchResponse>> {
  const session = await getStoredGuestSession();
  if (!session?.access_token) {
    return { data: null, error: "Guest session expired." };
  }
  try {
    const res = await axios.get<GuestPrivateSearchResponse>(
      `${API_BASE_URL}/api/guest/messages/members/search`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        params: {
          q: query.trim(),
          ...(position
            ? { latitude: position.latitude, longitude: position.longitude }
            : {}),
        },
        validateStatus: () => true,
        timeout: 20000,
      },
    );
    if (res.status === 401) {
      await clearStoredGuestSession();
      return {
        data: null,
        error: errorFromBody(401, res.data),
        unauthorized: true,
      };
    }
    if (res.status >= 400) {
      return { data: null, error: errorFromBody(res.status, res.data) };
    }
    return { data: res.data, error: null };
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
