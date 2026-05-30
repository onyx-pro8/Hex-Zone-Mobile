import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "hexzone:token";
const REMEMBER_KEY = "hexzone:remember";
const DEVICE_HID_KEY = "hexzone:device_hid";
const PUSH_TOKEN_KEY = "hexzone:push_token";

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function clearToken(): Promise<void> {
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

function randomHidSuffix(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)] ?? "X";
  }
  return out;
}
