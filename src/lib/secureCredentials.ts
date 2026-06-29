import * as SecureStore from "expo-secure-store";

import { devWarn } from "@/lib/devConsole";

/** SecureStore keys must be alphanumeric plus `.`, `-`, `_` only (no colons). */
const CREDENTIALS_KEY = "zoneweaver_remember_credentials";

type StoredCredentials = {
  email: string;
  password: string;
};

export async function setSecureCredentials(
  email: string,
  password: string,
): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed || !password) return;
  try {
    const payload: StoredCredentials = { email: trimmed, password };
    await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(payload));
  } catch (err) {
    devWarn("Failed to save Remember Me credentials", { err });
  }
}

export async function getSecureCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const password =
      typeof parsed.password === "string" ? parsed.password : "";
    if (!email || !password) return null;
    return { email, password };
  } catch (err) {
    devWarn("Failed to read Remember Me credentials", { err });
    return null;
  }
}

export async function clearSecureCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch (err) {
    devWarn("Failed to clear Remember Me credentials", { err });
  }
}
