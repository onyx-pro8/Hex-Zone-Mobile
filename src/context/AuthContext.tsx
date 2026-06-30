import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, AppState } from "react-native";
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
  getRememberMe,
  getStoredPushToken,
  getToken,
  setRememberMe as persistRememberMe,
  setToken,
  setStoredMapCenter,
} from "@/lib/storage";
import {
  clearSecureCredentials,
  getSecureCredentials,
  setSecureCredentials,
} from "@/lib/secureCredentials";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { onUnauthorized } from "@/lib/authEvents";
import { devLog, devWarn } from "@/lib/devConsole";
import {
  describeDeviceSyncFailure,
  DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE,
  DeviceSessionConflictError,
  isLocalDeviceSessionActive,
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
    options?: { rememberMe?: boolean; forceDeviceTakeover?: boolean },
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
  const reauthInProgress = useRef(false);
  const sessionInProgress = useRef(false);

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

  const establishSession = useCallback(
    async (
      email: string,
      password: string,
      remember: boolean,
      options?: { forceDeviceTakeover?: boolean },
    ): Promise<AuthUser> => {
      sessionInProgress.current = true;
      try {
        const result = await loginRequest({ email, password });
        if (!result.data) {
          throw new Error(result.error ?? "Login failed");
        }
        // Keep token in storage for API calls during device sync, but do not
        // expose it in React state until sync succeeds — otherwise the root
        // layout navigates away from login before the conflict modal can show.
        await setToken(result.data.token);
        await persistRememberMe(remember);
        if (remember) {
          await setSecureCredentials(email, password);
        } else {
          await clearSecureCredentials();
        }

        const loginUser = result.data.user;
        const loginHasEmail =
          typeof loginUser?.email === "string" && loginUser.email.trim() !== "";
        let normalized: AuthUser;
        if (loginUser?.id != null && loginHasEmail) {
          const user = normalizeUser(loginUser);
          if (!user) throw new Error("Could not load profile");
          normalized = user;
        } else {
          const me = await fetchProfile();
          if (me.data) {
            const user = normalizeUser(me.data);
            if (!user) throw new Error("Could not load profile");
            normalized = user;
          } else if (loginUser?.id != null) {
            const user = normalizeUser(loginUser);
            if (!user) throw new Error("Could not load profile");
            normalized = user;
          } else {
            throw new Error(me.error ?? "Could not load profile");
          }
        }

        const sync = await syncCurrentDevice(normalized, {
          platformLabel: "Mobile",
          forceTakeover: options?.forceDeviceTakeover,
        });
        if (sync.status === "account-in-use") {
          devWarn("Login refused: device session conflict");
          await clearToken();
          setTokenState(null);
          throw new DeviceSessionConflictError();
        }
        if (sync.status === "error") {
          const message = describeDeviceSyncFailure(sync);
          devWarn("Login refused: device sync error", { message });
          await clearToken();
          setTokenState(null);
          throw new Error(message);
        }

        setTokenState(result.data.token);
        setUser(normalized);
        return normalized;
      } finally {
        sessionInProgress.current = false;
      }
    },
    [],
  );

  const trySilentReauth = useCallback(async (): Promise<boolean> => {
    if (reauthInProgress.current) return false;
    const remember = await getRememberMe();
    if (!remember) return false;
    const creds = await getSecureCredentials();
    if (!creds) return false;

    reauthInProgress.current = true;
    try {
      await establishSession(creds.email, creds.password, true);
      return true;
    } catch (err) {
      devWarn("Silent re-auth failed", { err });
      return false;
    } finally {
      reauthInProgress.current = false;
    }
  }, [establishSession]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getToken();
        if (cancelled) return;

        if (stored && !isExpired(stored)) {
          setTokenState(stored);
          const profile = await fetchProfile();
          if (!cancelled && profile.data) {
            setUser(normalizeUser(profile.data));
            return;
          }
          if (!cancelled && profile.unauthorized) {
            await clearToken();
            setTokenState(null);
            const restored = await trySilentReauth();
            if (cancelled || restored) return;
          }
          return;
        }

        if (stored) await clearToken();

        const restored = await trySilentReauth();
        if (cancelled || restored) return;
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trySilentReauth]);

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

  // Sign out this phone when another device takes over the account session.
  useEffect(() => {
    if (!token || !user?.id) return;
    const ownerId = String(user.id);
    let cancelled = false;
    let alerted = false;

    const checkRemoteSignOut = async () => {
      const active = await isLocalDeviceSessionActive(ownerId);
      if (cancelled || active) return;
      if (!alerted) {
        alerted = true;
        Alert.alert("Signed out", DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE);
      }
      setAuthError(DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE);
      await performLogout();
    };

    const interval = setInterval(() => {
      void checkRemoteSignOut();
    }, 30_000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkRemoteSignOut();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
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
      void (async () => {
        if (sessionInProgress.current || reauthInProgress.current) return;
        const restored = await trySilentReauth();
        if (!restored) {
          await performLogout();
        }
      })();
    });
  }, [performLogout, trySilentReauth]);

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
      options?: { rememberMe?: boolean; forceDeviceTakeover?: boolean },
    ) => {
      setLoading(true);
      setAuthError(null);
      try {
        const remember = options?.rememberMe ?? true;
        await establishSession(email, password, remember, {
          forceDeviceTakeover: options?.forceDeviceTakeover,
        });
      } catch (err) {
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [establishSession],
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
