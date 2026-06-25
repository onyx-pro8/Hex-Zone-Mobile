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
import { registerPushToken } from "@/api/devices";
import { getRemoteAppSettings } from "@/api/settings";
import { updateAppSettings, type AppSettings } from "@/lib/appSettings";
import {
  clearToken,
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
  describeDeviceSyncFailure,
  setCurrentDeviceOffline,
  syncCurrentDevice,
} from "@/lib/deviceSync";

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
    try {
      await setCurrentDeviceOffline();
    } catch {
      /* proceed with local logout */
    }
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
      const result = await syncCurrentDevice(user, { platformLabel: "Mobile" });
      if (cancelled) return;
      if (result.status === "account-in-use" || result.status === "error") {
        const message = describeDeviceSyncFailure(result);
        devWarn("Auth: signing out — device session conflict", { message });
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

        const sync = await syncCurrentDevice(normalized, {
          platformLabel: "Mobile",
        });
        if (sync.status === "account-in-use" || sync.status === "error") {
          const message = describeDeviceSyncFailure(sync);
          devWarn("Login refused: device session conflict", { message });
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
