import { request } from "./client";

export type Member = {
  id: string;
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  zone_id?: string;
  account_type?: string;
  location?: { latitude: number; longitude: number } | null;
  zones?: string[];
  role?: "administrator" | "user" | string;
  active?: boolean;
  online?: boolean;
  avatar_url?: string | null;
  lastSeen?: string | null;
};

function normalizeMember(raw: unknown): Member | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row.id;
  const name = row.name ?? row.first_name ?? row.email;
  if (id == null || (typeof name !== "string" && name == null)) return null;

  let location: Member["location"] = null;
  const rawLocation = row.location;
  if (rawLocation && typeof rawLocation === "object") {
    const lat = (rawLocation as Record<string, unknown>).latitude;
    const lng = (rawLocation as Record<string, unknown>).longitude;
    if (typeof lat === "number" && typeof lng === "number") {
      location = { latitude: lat, longitude: lng };
    }
  }

  const rawZoneId = row.zone_id ?? row.zoneId;
  return {
    id: String(id),
    name:
      typeof name === "string"
        ? name
        : `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
          String(row.email ?? "Member"),
    email: typeof row.email === "string" ? row.email : undefined,
    first_name:
      typeof row.first_name === "string" ? row.first_name : undefined,
    last_name: typeof row.last_name === "string" ? row.last_name : undefined,
    address: typeof row.address === "string" ? row.address : undefined,
    zone_id:
      typeof rawZoneId === "string"
        ? rawZoneId
        : rawZoneId != null
          ? String(rawZoneId)
          : undefined,
    account_type:
      typeof row.account_type === "string"
        ? row.account_type
        : typeof row.accountType === "string"
          ? row.accountType
          : undefined,
    location,
    zones: Array.isArray(row.zones)
      ? row.zones.filter((z): z is string => typeof z === "string")
      : [],
    role: typeof row.role === "string" ? row.role : undefined,
    active: typeof row.active === "boolean" ? row.active : true,
    online: typeof row.online === "boolean" ? row.online : false,
    avatar_url:
      typeof row.avatar_url === "string"
        ? row.avatar_url
        : typeof row.avatarUrl === "string"
          ? row.avatarUrl
          : null,
    lastSeen:
      typeof row.lastSeen === "string"
        ? row.lastSeen
        : typeof row.last_seen === "string"
          ? row.last_seen
          : null,
  };
}

export async function getMembers() {
  const result = await request<unknown[]>({ method: "GET", url: "/members" });
  return {
    ...result,
    data: (result.data ?? [])
      .map(normalizeMember)
      .filter((m): m is Member => Boolean(m)),
  };
}

export async function updateLocation(payload: {
  latitude: number;
  longitude: number;
}) {
  return request<{ success: boolean }>({
    method: "POST",
    url: "/members/location",
    data: payload,
  });
}

/**
 * Admin-only: activate or deactivate a member. The server (PATCH /owners/{id})
 * rejects non-admin callers with 403, and a subsequent login by an inactive
 * member is refused with 403 "Account is inactive or expired".
 */
export async function setMemberActive(
  memberId: string | number,
  active: boolean,
) {
  return request<unknown>({
    method: "PATCH",
    url: `/owners/${encodeURIComponent(String(memberId))}`,
    data: { active },
  });
}

/** System-admin only: assign a pricing tier. */
export async function setMemberAccountType(
  memberId: string | number,
  accountType: string,
) {
  return request<unknown>({
    method: "PATCH",
    url: `/owners/${encodeURIComponent(String(memberId))}`,
    data: { account_type: accountType },
  });
}

/** System-admin only: assign administrator or user role. */
export async function setMemberRole(
  memberId: string | number,
  role: "administrator" | "user",
) {
  return request<unknown>({
    method: "PATCH",
    url: `/owners/${encodeURIComponent(String(memberId))}`,
    data: { role },
  });
}

export type OwnerProfileUpdate = {
  first_name?: string;
  last_name?: string;
  email?: string;
  /** Pricing tier (private, private_plus, exclusive, enhanced, enhanced_plus). */
  account_type?: string;
  /** Pass empty string to clear a stored avatar. */
  avatar_url?: string | null;
};

/** PATCH /owners/{id} — update the caller's (or an admin-managed) profile. */
export async function updateOwnerProfile(
  ownerId: string | number,
  payload: OwnerProfileUpdate,
) {
  return request<Member>({
    method: "PATCH",
    url: `/owners/${encodeURIComponent(String(ownerId))}`,
    data: payload,
  });
}
