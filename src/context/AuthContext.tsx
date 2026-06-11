import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  extractZoneId,
  fetchOwnerProfile,
  fetchProfile,
  loginRequest,
  normalizeUser,
  registerRequest,
  type AuthUser,
  type RegisterPayload,
} from "@/api/auth";
import {
  createDevice,
  getDevices,
  registerPushToken,
  sendDeviceHeartbeat,
} from "@/api/devices";
import { getRemoteAppSettings } from "@/api/settings";
import { updateAppSettings, type AppSettings } from "@/lib/appSettings";
import {
  clearToken,
  getOrCreateDeviceHid,
  getStoredPushToken,
  getToken,
  setRememberMe as persistRememberMe,
  setToken,
  setStoredMapCenter,
} from "@/lib/storage";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { onUnauthorized } from "@/lib/authEvents";
import { devLog, devWarn } from "@/lib/devConsole";
import {
  accountTypeLabel,
  getDeviceLimit,
  normalizeAccountType,
  type NormalizedAccountType,
} from "@/lib/accountLimits";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  initializing: boolean;
  authError: string | null;
  /**
   * Canonical account zone id (the value stored in `owners.zone_id` for the
   * account owner). Administrators: equals `user.zoneId`. Member users:
   * resolved from `GET /owners/{accountOwnerId}` so they create/list zones
   * under the same id as the admin who invited them.
   */
  ownerZoneId: string;
  clearAuthError: () => void;
  login: (
    email: string,
    password: string,
    options?: { rememberMe?: boolean },
  ) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseJwtExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part + "===".slice(0, (4 - (part.length % 4)) % 4);
    const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof globalThis.atob === "function"
        ? globalThis.atob(normalized)
        : null;
    if (!decoded) return null;
    const obj = JSON.parse(decoded) as { exp?: number };
    return obj.exp ?? null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = parseJwtExp(token);
  if (!exp) return false;
  return Date.now() >= exp * 1000;
}

type DeviceSyncResult =
  | { status: "ok"; deviceId?: number | string }
  | {
      status: "limit-reached";
      limit: number;
      accountType: NormalizedAccountType;
      existingHids: string[];
    }
  | { status: "error"; message: string };

function describeLimitRefusal(
  accountType: NormalizedAccountType,
  limit: number,
): string {
  const label = accountTypeLabel(accountType);
  const count = Number.isFinite(limit)
    ? `${limit} device${limit === 1 ? "" : "s"}`
    : "the configured number of devices";
  return (
    `Your ${label} account already has ${count} registered. ` +
    `To use this phone, sign in on the web (or the existing device) and remove the previous device first.`
  );
}

async function syncCurrentDevice(
  user: AuthUser | null,
): Promise<DeviceSyncResult> {
  if (!user) return { status: "ok" };
  try {
    const localHid = await getOrCreateDeviceHid();
    const display = user.name?.trim() || user.email?.trim() || "Mobile";
    const ownerId = String(user.id ?? user.accountOwnerId ?? "").trim();
    const accountType = normalizeAccountType(
      user.accountType,
      user.account_type,
    );
    const limit = getDeviceLimit(accountType);
    const devices = await getDevices();
    const list = devices.data ?? [];

    // 1. If THIS phone is already registered (HID matches what we stored
    //    locally), just heartbeat it. This is the normal re-open / restore
    //    path on the same physical device.
    const byLocalHid = list.find(
      (d) => String(d.hid).toUpperCase() === localHid.toUpperCase(),
    );
    if (byLocalHid?.id != null) {
      devLog("Device sync: matched stored HID", {
        hid: localHid,
        deviceId: byLocalHid.id,
      });
      await sendDeviceHeartbeat(byLocalHid.id);
      return { status: "ok", deviceId: byLocalHid.id };
    }

    // 2. This phone is NOT yet registered. Count how many devices the
    //    account already has (server-side truth, scoped to the owner).
    const ownerDevices = ownerId
      ? list.filter((d) => String(d.owner_id ?? "") === ownerId)
      : list;

    // 3. If the account is at its device limit, refuse outright. Previously
    //    we silently "adopted" the first existing device, which let any
    //    second phone impersonate the registered one — that is the bug
    //    the user just reported on PRIVATE / EXCLUSIVE / ENHANCED accounts.
    if (ownerDevices.length >= limit) {
      devWarn("Device sync: limit reached, refusing this phone", {
        accountType,
        limit,
        ownerDeviceCount: ownerDevices.length,
        existingHids: ownerDevices.map((d) => String(d.hid)),
      });
      return {
        status: "limit-reached",
        limit,
        accountType,
        existingHids: ownerDevices.map((d) => String(d.hid)),
      };
    }

    // 4. Under the limit → create a fresh device entry tied to this phone.
    devLog("Device sync: creating new device", { hid: localHid });
    const created = await createDevice({
      hid: localHid,
      name: `${display} (Mobile)`,
      enable_notification: true,
      propagate_enabled: true,
      is_online: true,
    });
    if (created.error) {
      // The server itself may reject with 403 if the limit calculation
      // disagrees with ours (e.g. devices we couldn't see). Surface that
      // as a limit-reached refusal so the user gets a clear message.
      if (/limit|forbidden|max|403/i.test(created.error)) {
        devWarn("Device sync: server refused create as limit reached", {
          error: created.error,
        });
        return {
          status: "limit-reached",
          limit,
          accountType,
          existingHids: ownerDevices.map((d) => String(d.hid)),
        };
      }
      devWarn("Device sync: create failed", { error: created.error });
      return { status: "error", message: created.error };
    }
    if (created.data?.id != null) {
      await sendDeviceHeartbeat(created.data.id);
      return { status: "ok", deviceId: created.data.id };
    }
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    devWarn("Device sync: unexpected error", { message });
    return { status: "error", message };
  }
}

async function syncPushTokenToServer() {
  if (isRunningExpoGo()) return;
  try {
    const token = await getStoredPushToken();
    if (!token) {
      const result = await registerForPushNotificationsAsync();
      if (!result.token) return;
      await registerPushToken({ token: result.token, platform: "EXPO" });
      return;
    }
    await registerPushToken({ token, platform: "EXPO" });
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownerZoneId, setOwnerZoneId] = useState<string>("");

  const performLogout = useCallback(async () => {
    setUser(null);
    setTokenState(null);
    setOwnerZoneId("");
    await clearToken();
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getToken();
      if (cancelled) return;
      if (!stored) {
        setInitializing(false);
        return;
      }
      if (isExpired(stored)) {
        await clearToken();
        setInitializing(false);
        return;
      }
      setTokenState(stored);
      try {
        const profile = await fetchProfile();
        if (!cancelled && profile.data) {
          setUser(normalizeUser(profile.data));
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const center = user?.mapCenter ?? user?.map_center;
    if (center) void setStoredMapCenter(center);
  }, [user?.mapCenter, user?.map_center]);

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    void (async () => {
      const result = await syncCurrentDevice(user);
      if (cancelled) return;
      if (result.status === "limit-reached") {
        const message = describeLimitRefusal(result.accountType, result.limit);
        devWarn("Auth: signing out — device slot held elsewhere", {
          message,
          existingHids: result.existingHids,
        });
        setAuthError(message);
        await performLogout();
      }
    })();
    void syncPushTokenToServer();
    return () => {
      cancelled = true;
    };
  }, [token, user, performLogout]);

  // Pull the owner's saved settings (broadcast name, address, shared
  // notification, quick messages) into the local store after login so message
  // composition uses the account's broadcast name on any device, not just
  // after visiting the Settings screen.
  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    void (async () => {
      const res = await getRemoteAppSettings();
      if (cancelled || !res.data) return;
      await updateAppSettings(res.data as Partial<AppSettings>);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  // Resolve the account-level `zone_id` (owners.zone_id) for the signed-in
  // user. Admins use their own value; invited members look up their owner.
  useEffect(() => {
    if (!user) {
      setOwnerZoneId("");
      return;
    }
    const own = extractZoneId(user);
    const role = String(user.role ?? "").toLowerCase();
    if (role !== "user") {
      setOwnerZoneId(own);
      return;
    }
    const ownerId = user.accountOwnerId ?? user.account_owner_id;
    if (!ownerId) {
      setOwnerZoneId(own);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await fetchOwnerProfile(ownerId);
      if (cancelled) return;
      const resolved = extractZoneId(result.data ?? null) || own;
      devLog("Auth: resolved owner zone id", {
        accountOwnerId: ownerId,
        ownerZoneId: resolved,
        memberZoneId: own,
      });
      setOwnerZoneId(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    return onUnauthorized(() => {
      void performLogout();
    });
  }, [performLogout]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const profile = await fetchProfile();
      if (profile.data) setUser(normalizeUser(profile.data));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: { rememberMe?: boolean },
    ) => {
      setLoading(true);
      setAuthError(null);
      try {
        const remember = options?.rememberMe ?? true;
        const result = await loginRequest({ email, password });
        if (!result.data) {
          throw new Error(result.error ?? "Login failed");
        }
        await setToken(result.data.token);
        await persistRememberMe(remember);
        let normalized: AuthUser | null = null;
        const loginUser = result.data.user;
        // The login payload often omits email (or returns a thin user). Always
        // hydrate from the profile endpoints when email is missing so the
        // Settings header doesn't show "—". Fall back to the login user only
        // if the profile fetch fails entirely.
        const loginHasEmail =
          typeof loginUser?.email === "string" && loginUser.email.trim() !== "";
        if (loginUser?.id != null && loginHasEmail) {
          normalized = normalizeUser(loginUser);
        } else {
          const me = await fetchProfile();
          if (me.data) {
            normalized = normalizeUser(me.data);
          } else if (loginUser?.id != null) {
            normalized = normalizeUser(loginUser);
          } else {
            throw new Error(me.error ?? "Could not load profile");
          }
        }

        // Gate the session on device sync. If the account already has its
        // maximum devices on file (e.g. PRIVATE = 1) AND this phone isn't
        // one of them, refuse the login.
        const sync = await syncCurrentDevice(normalized);
        if (sync.status === "limit-reached") {
          const message = describeLimitRefusal(sync.accountType, sync.limit);
          devWarn("Login refused: device limit reached", {
            message,
            existingHids: sync.existingHids,
          });
          await clearToken();
          throw new Error(message);
        }

        setTokenState(result.data.token);
        setUser(normalized);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const result = await registerRequest(payload);
      if (result.error) throw new Error(result.error);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await performLogout();
  }, [performLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      initializing,
      authError,
      ownerZoneId,
      clearAuthError,
      login,
      register,
      logout,
      refreshUser,
    }),
    [
      user,
      token,
      loading,
      initializing,
      authError,
      ownerZoneId,
      clearAuthError,
      login,
      register,
      logout,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
