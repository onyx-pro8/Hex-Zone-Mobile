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
import {
  clearToken,
  getOrCreateDeviceHid,
  getStoredPushToken,
  getToken,
  setRememberMe as persistRememberMe,
  setToken,
} from "@/lib/storage";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { isRunningExpoGo } from "@/lib/pushSupport";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  initializing: boolean;
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

async function syncCurrentDevice(user: AuthUser | null) {
  if (!user) return;
  try {
    const hid = await getOrCreateDeviceHid();
    const display = user.name?.trim() || user.email?.trim() || "Mobile";
    const devices = await getDevices();
    const list = devices.data ?? [];
    const existing = list.find(
      (d) => String(d.hid).toUpperCase() === hid.toUpperCase(),
    );
    if (existing?.id != null) {
      await sendDeviceHeartbeat(existing.id);
      return;
    }
    const created = await createDevice({
      hid,
      name: `${display} (Mobile)`,
      enable_notification: true,
      propagate_enabled: true,
      is_online: true,
    });
    if (created.data?.id != null) {
      await sendDeviceHeartbeat(created.data.id);
    }
  } catch {
    // Device sync is best-effort; never block UX.
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

  const performLogout = useCallback(async () => {
    setUser(null);
    setTokenState(null);
    await clearToken();
  }, []);

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
    if (!token || !user) return;
    void syncCurrentDevice(user);
    void syncPushTokenToServer();
  }, [token, user]);

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
      try {
        const remember = options?.rememberMe ?? true;
        const result = await loginRequest({ email, password });
        if (!result.data) {
          throw new Error(result.error ?? "Login failed");
        }
        await setToken(result.data.token);
        await persistRememberMe(remember);
        setTokenState(result.data.token);
        if (result.data.user?.id != null) {
          setUser(normalizeUser(result.data.user));
        } else {
          const me = await fetchProfile();
          if (!me.data) {
            throw new Error(me.error ?? "Could not load profile");
          }
          setUser(normalizeUser(me.data));
        }
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
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, token, loading, initializing, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
