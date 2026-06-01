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
