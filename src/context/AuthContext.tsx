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
import { AppState } from "react-native";
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
  clearLastActivity,
  clearToken,
  getRememberMe,
  getStoredPushToken,
  getToken,
  isSessionInactive,
  setRememberMe as persistRememberMe,
  setToken,
  setStoredMapCenter,
  touchLastActivity,
} from "@/lib/storage";
import {
  clearSecureCredentials,
  getSecureCredentials,
  setSecureCredentials,
} from "@/lib/secureCredentials";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { isRunningExpoGo } from "@/lib/pushSupport";
import { onUnauthorized } from "@/lib/authEvents";
import { toast } from "@/lib/toast";
import { devLog, devWarn } from "@/lib/devConsole";
import {
  describeDeviceSyncFailure,
  DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE,
  DeviceSessionConflictError,
  isLocalDeviceSessionActive,
  setCurrentDeviceOffline,
  syncCurrentDevice,
} from "@/lib/deviceSync";
import { getOrCreateDeviceHid } from "@/lib/storage";
import { useWebSocket } from "@/hooks/useWebSocket";
import { parseSessionRevokedSocketEvent } from "@/lib/messageSocket";

/** Consecutive failed remote-session polls required before signing out. */
const REMOTE_SIGN_OUT_STRIKES = 3;

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
  /** Optimistically update the in-memory avatar (header updates instantly). */
  setUserAvatar: (avatarUrl: string | null) => void;
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
  const logoutInProgress = useRef(false);
  const skipNextDeviceSyncRef = useRef(false);
  const { lastMessage, status: wsStatus } = useWebSocket({
    token,
    zoneIds: [],
    enabled: Boolean(token),
  });

  const performLogout = useCallback(
    async (options?: { clearCredentials?: boolean }) => {
      if (logoutInProgress.current) return;
      logoutInProgress.current = true;
      try {
        try {
          await setCurrentDeviceOffline();
        } catch {
          /* proceed with local logout */
        }
        setUser(null);
        setTokenState(null);
        setOwnerZoneId("");
        await clearToken();
        await clearLastActivity();
        if (options?.clearCredentials) {
          await clearSecureCredentials();
          await persistRememberMe(false);
        }
      } finally {
        logoutInProgress.current = false;
      }
    },
    [],
  );

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
        // Also defer remember-me credential writes until sync succeeds so
        // declining the device prompt leaves no side effects.
        await setToken(result.data.token);

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

        await persistRememberMe(remember);
        if (remember) {
          await setSecureCredentials(email, password);
        } else {
          await clearSecureCredentials();
        }

        // Login already synced the device; skip the mount effect once.
        skipNextDeviceSyncRef.current = true;
        setTokenState(result.data.token);
        setUser(normalized);
        await touchLastActivity();
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
        if (await isSessionInactive()) {
          devWarn("Auth: session expired due to inactivity");
          // Keep Remember Me credentials so the login form can refill.
          await performLogout();
          return;
        }

        const stored = await getToken();
        if (cancelled) return;

        if (stored && !isExpired(stored)) {
          const profile = await fetchProfile();
          if (cancelled) return;
          if (profile.data) {
            const normalized = normalizeUser(profile.data);
            if (normalized) {
              setTokenState(stored);
              setUser(normalized);
              await touchLastActivity();
              return;
            }
          }
          if (profile.unauthorized) {
            await clearToken();
            const restored = await trySilentReauth();
            if (cancelled || restored) return;
            return;
          }
          // Transient /me failure: keep token on disk and try credential restore
          // so a cold-start network blip does not look like a logout.
          const restored = await trySilentReauth();
          if (cancelled || restored) return;
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
  }, [performLogout, trySilentReauth]);

  useEffect(() => {
    const center = user?.mapCenter ?? user?.map_center;
    if (center) void setStoredMapCenter(center);
  }, [user?.mapCenter, user?.map_center]);

  useEffect(() => {
    if (!token || !user) return;
    if (skipNextDeviceSyncRef.current) {
      skipNextDeviceSyncRef.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await syncCurrentDevice(user, {
        platformLabel: "Mobile",
        resumeSession: true,
      });
      if (cancelled) return;
      // Only a real multi-device conflict should end the session. Network /
      // sync errors must not wipe a still-valid login after app reopen.
      if (result.status === "account-in-use") {
        const message = describeDeviceSyncFailure(result);
        devWarn("Auth: signing out — device session conflict", { message });
        setAuthError(message);
        await performLogout();
        return;
      }
      if (result.status === "error") {
        devWarn("Auth: device sync failed (keeping session)", {
          message: describeDeviceSyncFailure(result),
        });
      }
    })();
    void syncPushTokenToServer();
    return () => {
      cancelled = true;
    };
    // Re-run only when the signed-in identity changes — not when avatar /
    // profile fields update (that was logging people out after photo upload).
  }, [token, user?.id, performLogout]);

  // Sign out this phone when another device takes over the account session.
  // Prefer SESSION_REVOKED over the socket; HTTP poll only while WS is down.
  // Also enforce inactivity timeout and refresh the activity stamp on resume.
  useEffect(() => {
    if (!token || !user?.id) return;
    let cancelled = false;
    let alerted = false;

    const handleRevoked = async () => {
      if (cancelled || alerted) return;
      alerted = true;
      toast.warning(DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE, {
        title: "Signed out",
      });
      setAuthError(DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE);
      await performLogout();
    };

    const onSocketFrame = async () => {
      if (!lastMessage || wsStatus !== "open") return;
      if (sessionInProgress.current) return;
      try {
        const parsed = JSON.parse(lastMessage) as {
          type?: unknown;
          data?: { message?: unknown };
        };
        if (parsed.type === "ZONE_EVICTED") {
          const msg =
            typeof parsed.data?.message === "string"
              ? parsed.data.message
              : "A secondary zone was removed because of a primary-zone quota change.";
          toast.warning(msg, { title: "Zone removed", duration: 5200 });
        }
      } catch {
        // ignore non-JSON frames
      }
      const evt = parseSessionRevokedSocketEvent(lastMessage);
      if (!evt) return;
      const localHid = (await getOrCreateDeviceHid()).toUpperCase();
      const revoked =
        evt.released_hids.includes(localHid) ||
        (evt.kept_hid != null &&
          evt.kept_hid.length > 0 &&
          evt.kept_hid !== localHid);
      if (revoked) await handleRevoked();
    };
    void onSocketFrame();

    return () => {
      cancelled = true;
    };
  }, [token, user, lastMessage, performLogout, wsStatus]);

  useEffect(() => {
    if (!token || !user?.id) return;
    const ownerId = String(user.id);
    let cancelled = false;
    let alerted = false;
    let consecutiveFailures = 0;

    const wsSettled = wsStatus === "open" || wsStatus === "connecting";

    const enforceInactivity = async (): Promise<boolean> => {
      if (!(await isSessionInactive())) return false;
      devWarn("Auth: signing out — inactivity timeout");
      // Keep Remember Me credentials so the login form can refill.
      await performLogout();
      return true;
    };

    const signOutForRemoteConflict = async () => {
      if (cancelled || alerted) return;
      alerted = true;
      devWarn("Auth: signing out — remote session conflict confirmed");
      toast.warning(DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE, {
        title: "Signed out",
      });
      setAuthError(DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE);
      await performLogout();
    };

    const refreshLocalDevicePresence = async (): Promise<void> => {
      const result = await syncCurrentDevice(user, {
        platformLabel: "Mobile",
        resumeSession: true,
      });
      if (cancelled) return;
      if (result.status === "account-in-use") {
        consecutiveFailures = REMOTE_SIGN_OUT_STRIKES;
        await signOutForRemoteConflict();
      }
    };

    const checkRemoteSignOut = async (options?: { syncFirst?: boolean }) => {
      if (await enforceInactivity()) return;
      if (wsSettled) {
        consecutiveFailures = 0;
        return;
      }

      if (options?.syncFirst) {
        await refreshLocalDevicePresence();
        if (cancelled || alerted) return;
      }

      let active = await isLocalDeviceSessionActive(ownerId);
      if (cancelled || alerted) return;

      if (!active && !options?.syncFirst) {
        await refreshLocalDevicePresence();
        if (cancelled || alerted) return;
        active = await isLocalDeviceSessionActive(ownerId);
      }

      if (active) {
        consecutiveFailures = 0;
        return;
      }

      consecutiveFailures += 1;
      devWarn("Auth: remote session check inconclusive", {
        consecutiveFailures,
        required: REMOTE_SIGN_OUT_STRIKES,
      });
      if (consecutiveFailures < REMOTE_SIGN_OUT_STRIKES) return;

      await signOutForRemoteConflict();
    };

    const interval = setInterval(() => {
      void checkRemoteSignOut();
    }, 30_000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        if (await enforceInactivity()) return;
        await touchLastActivity();
        consecutiveFailures = 0;
        await checkRemoteSignOut({ syncFirst: true });
      })();
    });

    void touchLastActivity();
    void checkRemoteSignOut({ syncFirst: true });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [token, user, performLogout, wsStatus]);

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
        if (
          sessionInProgress.current ||
          reauthInProgress.current ||
          logoutInProgress.current
        ) {
          return;
        }
        if (await isSessionInactive()) {
          await performLogout();
          return;
        }
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

  const setUserAvatar = useCallback((avatarUrl: string | null) => {
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, avatar_url: avatarUrl };
    });
  }, []);

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
    const remember = await getRememberMe();
    await performLogout({ clearCredentials: !remember });
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
      setUserAvatar,
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
      setUserAvatar,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
