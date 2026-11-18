import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/api/client";
import { getToken } from "@/lib/storage";

const displayCache = new Map<string, string>();
let cacheEpoch = 0;
const epochListeners = new Set<() => void>();

function notifyAvatarCacheInvalidated(): void {
  cacheEpoch += 1;
  epochListeners.forEach((listener) => listener());
}

function cacheKey(url: string): string {
  // Strip cache-bust query so invalidation hits the same entry.
  return url
    .replace(/([?&])v=\d+(&)?/, (_, p1, p2) => (p2 ? p1 : ""))
    .replace(/\?$/, "");
}

export function absolutizeAvatarUrl(url: string): string {
  const trimmed = url.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

function needsAuthAvatarFetch(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("data:")) return false;
  const path = trimmed.split("?")[0] ?? trimmed;
  return /\/owners\/[^/]+\/avatar\/?$/i.test(path);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

/** Drop cached display bytes so a newly uploaded avatar is refetched. */
export function invalidateAvatarDisplayCache(url?: string | null): void {
  if (!url || !String(url).trim()) {
    displayCache.clear();
  } else {
    const absolute = absolutizeAvatarUrl(String(url));
    displayCache.delete(cacheKey(absolute));
    displayCache.delete(absolute);
  }
  notifyAvatarCacheInvalidated();
}

/** Seed cache so header/messages can show a new avatar without waiting on fetch. */
export function primeAvatarDisplayCache(
  url: string,
  dataUrl: string,
): void {
  if (!url.trim() || !dataUrl.startsWith("data:")) return;
  displayCache.set(cacheKey(absolutizeAvatarUrl(url)), dataUrl);
  notifyAvatarCacheInvalidated();
}

/**
 * Resolve an avatar reference to a URI React Native Image can display.
 * Authenticated `/owners/{id}/avatar` endpoints are fetched once and cached
 * as data URLs so bootstrap JSON stays small.
 */
export async function resolveAvatarDisplayUri(
  url: string | null | undefined,
  options?: { bustCache?: boolean },
): Promise<string | null> {
  if (!url || !String(url).trim()) return null;
  const absolute = absolutizeAvatarUrl(String(url));
  if (!needsAuthAvatarFetch(absolute)) return absolute;

  const key = cacheKey(absolute);
  if (options?.bustCache) displayCache.delete(key);
  else {
    const cached = displayCache.get(key);
    if (cached) return cached;
  }

  try {
    const token = await getToken();
    const fetchUrl = options?.bustCache
      ? `${absolute}${absolute.includes("?") ? "&" : "?"}v=${Date.now()}`
      : absolute;
    const response = await fetch(fetchUrl, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim();
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return null;
    const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
    const dataUrl = `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
    displayCache.set(key, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

export function useResolvedAvatarUri(
  url: string | null | undefined,
): string | null {
  const [epoch, setEpoch] = useState(cacheEpoch);
  const epochRef = useRef(epoch);
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!url || !String(url).trim()) return null;
    const absolute = absolutizeAvatarUrl(String(url));
    if (!needsAuthAvatarFetch(absolute)) return absolute;
    return displayCache.get(cacheKey(absolute)) ?? null;
  });

  useEffect(() => {
    const onInvalidate = () => setEpoch(cacheEpoch);
    epochListeners.add(onInvalidate);
    return () => {
      epochListeners.delete(onInvalidate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!url || !String(url).trim()) {
      setResolved(null);
      return;
    }
    const absolute = absolutizeAvatarUrl(String(url));
    if (!needsAuthAvatarFetch(absolute)) {
      setResolved(absolute);
      return;
    }
    const epochChanged = epochRef.current !== epoch;
    epochRef.current = epoch;
    const cached = displayCache.get(cacheKey(absolute));
    if (cached) {
      setResolved(cached);
      return;
    }
    void resolveAvatarDisplayUri(url, { bustCache: epochChanged }).then(
      (next) => {
        if (!cancelled) setResolved(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, epoch]);

  return resolved;
}
