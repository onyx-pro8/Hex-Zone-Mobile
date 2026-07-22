import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeMapCenter, type MapCenter } from "@/lib/mapCenter";

const TOKEN_KEY = "zoneweaver:token";
const REMEMBER_KEY = "zoneweaver:remember";
const LAST_EMAIL_KEY = "zoneweaver:last_email";
const LAST_ACTIVITY_KEY = "zoneweaver:last_activity";
const DEVICE_HID_KEY = "zoneweaver:device_hid";
const PUSH_TOKEN_KEY = "zoneweaver:push_token";
const MAP_CENTER_KEY = "zoneweaver:map_center";
const GUEST_SESSION_KEY = "zoneweaver:guest_session";

/** Sign out after this long with no foreground activity (12 hours). */
export const SESSION_INACTIVITY_MS = 12 * 60 * 60 * 1000;

/** In-memory cache so the API client sees a new token immediately after login. */
let memoryToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (memoryToken !== undefined) return memoryToken;
  try {
    memoryToken = await AsyncStorage.getItem(TOKEN_KEY);
    return memoryToken;
  } catch {
    memoryToken = null;
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  memoryToken = token;
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function setRememberMe(remember: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export async function getRememberMe(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(REMEMBER_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

export async function getLastActivityAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function touchLastActivity(at: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    /* ignore */
  }
}

export async function clearLastActivity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

/** True when a stored activity stamp exists and is older than the idle limit. */
export async function isSessionInactive(
  limitMs: number = SESSION_INACTIVITY_MS,
): Promise<boolean> {
  const last = await getLastActivityAt();
  if (last == null) return false;
  return Date.now() - last > limitMs;
}

export async function setLastEmail(email: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(LAST_EMAIL_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export async function getLastEmail(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LAST_EMAIL_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function getOrCreateDeviceHid(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_HID_KEY);
    if (existing) return existing;
    const next = `MOB-${randomHidSuffix(8)}`;
    await AsyncStorage.setItem(DEVICE_HID_KEY, next);
    return next;
  } catch {
    return `MOB-${randomHidSuffix(8)}`;
  }
}

export async function setDeviceHid(hid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_HID_KEY, hid);
  } catch {
    /* ignore */
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredPushToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function getStoredMapCenter(): Promise<MapCenter | null> {
  try {
    const raw = await AsyncStorage.getItem(MAP_CENTER_KEY);
    if (!raw) return null;
    return normalizeMapCenter(JSON.parse(raw) as MapCenter);
  } catch {
    return null;
  }
}

export async function setStoredMapCenter(center: MapCenter): Promise<void> {
  const normalized = normalizeMapCenter(center);
  if (!normalized) return;
  try {
    await AsyncStorage.setItem(MAP_CENTER_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

export type StoredGuestSession = {
  access_token: string;
  guest_id: string;
  display_name: string;
  zone_id: string;
  zone_ids: string[];
  allowed_message_types: string[];
  network_geo_messaging?: boolean;
  saved_at: number;
};

export async function setStoredGuestSession(
  session: StoredGuestSession,
): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export async function getStoredGuestSession(): Promise<StoredGuestSession | null> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredGuestSession;
  } catch {
    return null;
  }
}

export async function clearStoredGuestSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function randomHidSuffix(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)] ?? "X";
  }
  return out;
}
