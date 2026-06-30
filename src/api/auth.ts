import { request } from "./client";
import { normalizeAccountType } from "@/lib/accountLimits";
import { normalizeMapCenter, type MapCenter } from "@/lib/mapCenter";

export type AccountType =
  | "PRIVATE"
  | "PRIVATE_PLUS"
  | "EXCLUSIVE"
  | "ENHANCED"
  | "ENHANCED_PLUS";

export type RegistrationType = "ADMINISTRATOR" | "USER";
export type UserRole = "administrator" | "user";

export type AuthUser = {
  id: string | number;
  name?: string;
  email?: string;
  accountType?: AccountType;
  registrationType?: RegistrationType;
  accountOwnerId?: number;
  role?: UserRole;
  zoneId?: string;
  first_name?: string;
  last_name?: string;
  zone_id?: string | number;
  account_type?: string;
  registration_type?: string;
  account_owner_id?: number;
  address?: string;
  phone?: string | null;
  active?: boolean;
  mapCenter?: MapCenter | null;
  map_center?: MapCenter | null;
};

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string; user: AuthUser };

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  accountType: AccountType;
  registrationType: RegistrationType;
  accountOwnerId?: number;
  zoneId?: string;
  phone?: string;
  address?: string;
  registrationCode?: string;
};

type LegacyLoginResponse = {
  access_token?: string;
  token?: string;
  user?: AuthUser;
};

type LegacyRegisterPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  account_type: string;
  zone_id?: string;
  role?: UserRole;
  account_owner_id?: number;
  phone?: string;
  address?: string;
  registration_code?: string;
};

function toLegacyAccountType(accountType: AccountType): string {
  return accountType.toLowerCase();
}

function mapLegacyRegisterPayload(p: RegisterPayload): LegacyRegisterPayload {
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const last = rest.join(" ");
  const code = p.registrationCode?.trim();
  return {
    email: p.email,
    password: p.password,
    first_name: first || p.name,
    last_name: last,
    account_type: toLegacyAccountType(p.accountType),
    zone_id: p.zoneId,
    role: p.registrationType === "USER" ? "user" : "administrator",
    account_owner_id: p.accountOwnerId,
    phone: p.phone,
    address: p.address,
    ...(code ? { registration_code: code } : {}),
  };
}

function normalizeLoginData(
  data: LoginResponse | LegacyLoginResponse | null,
): LoginResponse | null {
  if (!data) return null;
  const row = data as LoginResponse & LegacyLoginResponse;
  const token = row.token || row.access_token;
  if (!token) return null;
  return {
    token,
    user: row.user ?? ({ id: "" } as AuthUser),
  };
}

export async function loginRequest(payload: LoginPayload) {
  const primary = await request<LoginResponse>({
    method: "POST",
    url: "/login",
    data: payload,
  });
  const primaryData = normalizeLoginData(primary.data);
  if (primaryData?.token) {
    return { ...primary, data: primaryData };
  }
  const legacy = await request<LegacyLoginResponse>({
    method: "POST",
    url: "/owners/login",
    data: payload,
  });
  const legacyData = normalizeLoginData(legacy.data);
  if (legacyData?.token) {
    return { ...legacy, data: legacyData };
  }
  const combined = (primary.error || legacy.error || "Login failed").trim();
  return {
    data: null,
    error: /403|inactive|expired/i.test(combined)
      ? "Account is inactive or expired"
      : combined,
    loading: false,
  };
}

export async function registerRequest(payload: RegisterPayload) {
  if (
    payload.registrationType === "USER" &&
    payload.accountType === "EXCLUSIVE"
  ) {
    return {
      data: null,
      error: "Exclusive accounts cannot register users.",
      loading: false,
    };
  }
  const primary = await request<{ id?: string }>({
    method: "POST",
    url: "/register",
    data: payload,
  });
  if (!primary.error) return primary;
  return request<{ id?: string }>({
    method: "POST",
    url: "/owners/register",
    data: mapLegacyRegisterPayload(payload),
  });
}

function profileHasEmail(user: AuthUser | null | undefined): boolean {
  return Boolean(user && typeof user.email === "string" && user.email.trim());
}

export async function fetchProfile() {
  const primary = await request<AuthUser>({ method: "GET", url: "/me" });
  // Fall back to /owners/me when /me returns nothing OR when it returns a user
  // that is missing the email (the Settings header shows "—" otherwise). The
  // two endpoints can return slightly different shapes depending on the
  // account/role, so we merge to keep whatever fields each one provides.
  if (primary.data && profileHasEmail(primary.data)) return primary;
  const legacy = await request<AuthUser>({
    method: "GET",
    url: "/owners/me",
  });
  if (!legacy.data) return primary.data ? primary : legacy;
  if (!primary.data) return legacy;
  return {
    ...primary,
    data: { ...primary.data, ...mergeMissingFields(primary.data, legacy.data) },
  };
}

/** Returns only the fields from `fallback` that are absent/blank on `primary`. */
function mergeMissingFields(
  primary: AuthUser,
  fallback: AuthUser,
): Partial<AuthUser> {
  const out: Partial<AuthUser> = {};
  const isBlank = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  (Object.keys(fallback) as (keyof AuthUser)[]).forEach((key) => {
    if (isBlank(primary[key]) && !isBlank(fallback[key])) {
      // @ts-expect-error index assignment across union is safe here
      out[key] = fallback[key];
    }
  });
  return out;
}

/**
 * Returns the account owner's profile. Used to resolve the canonical
 * `zone_id` for the whole account (members on the same account share the
 * owner's zone).
 */
export async function fetchOwnerProfile(ownerId: number | string) {
  return request<AuthUser>({
    method: "GET",
    url: `/owners/${encodeURIComponent(String(ownerId))}`,
  });
}

export function extractZoneId(profile: AuthUser | null | undefined): string {
  if (!profile) return "";
  const raw =
    profile.zoneId ??
    (profile.zone_id != null ? String(profile.zone_id) : undefined);
  return raw ? String(raw).trim() : "";
}

function parseRegistrationCodePayload(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") {
    const t = data.trim();
    return t || null;
  }
  if (typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.data === "string") {
    const t = row.data.trim();
    return t || null;
  }
  const nested =
    row.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : null;
  const pick = (obj: Record<string, unknown> | null) => {
    if (!obj) return undefined;
    return obj.registration_code ?? obj.registrationCode ?? obj.code;
  };
  const raw = pick(row) ?? pick(nested);
  if (typeof raw === "string") {
    const t = raw.trim();
    return t || null;
  }
  return null;
}

export async function fetchRegistrationCode() {
  const primary = await request<unknown>({
    method: "GET",
    url: "/utils/registration-code",
  });
  const codePrimary =
    primary.data != null ? parseRegistrationCodePayload(primary.data) : null;
  if (!primary.error && codePrimary) {
    return { data: codePrimary, error: null, loading: false };
  }
  const legacy = await request<unknown>({
    method: "GET",
    url: "/owners/registration-code",
  });
  const codeLegacy =
    legacy.data != null ? parseRegistrationCodePayload(legacy.data) : null;
  if (!legacy.error && codeLegacy) {
    return { data: codeLegacy, error: null, loading: false };
  }
  return {
    data: null,
    error:
      primary.error ||
      legacy.error ||
      "Could not load registration code from the server.",
    loading: false,
  };
}

export function normalizeUser(raw: AuthUser | null): AuthUser | null {
  if (!raw) return null;
  const first = raw.first_name ?? "";
  const last = raw.last_name ?? "";
  const fullName =
    raw.name || `${first} ${last}`.trim() || raw.email || "Member";
  const normalizedAccountType: AccountType = normalizeAccountType(
    raw.accountType,
    raw.account_type,
  );
  const role =
    raw.role ??
    (String(
      raw.registrationType ?? raw.registration_type ?? "",
    ).toUpperCase() === "USER"
      ? "user"
      : "administrator");
  const registrationType: RegistrationType =
    String(
      raw.registrationType ?? raw.registration_type ?? "",
    ).toUpperCase() === "USER"
      ? "USER"
      : "ADMINISTRATOR";
  const accountOwnerId =
    raw.accountOwnerId ??
    raw.account_owner_id ??
    (raw.id != null && Number.isFinite(Number(raw.id))
      ? Number(raw.id)
      : undefined);
  const mapCenter = normalizeMapCenter(raw.mapCenter ?? raw.map_center ?? null);
  return {
    ...raw,
    name: fullName,
    accountType: normalizedAccountType,
    account_type: raw.account_type ?? normalizedAccountType.toLowerCase(),
    registrationType,
    registration_type:
      raw.registration_type ?? registrationType.toLowerCase(),
    role,
    accountOwnerId,
    account_owner_id: accountOwnerId,
    zoneId:
      raw.zoneId ?? (raw.zone_id != null ? String(raw.zone_id) : undefined),
    mapCenter,
    map_center: mapCenter,
    active: typeof raw.active === "boolean" ? raw.active : true,
  };
}
