/**
 * Load expo-location only when the ExpoLocation native module is present.
 * A bare `import('expo-location')` crashes if the dev client was not rebuilt.
 */

import { requireOptionalNativeModule } from "expo-modules-core";

export const LOCATION_UNAVAILABLE_MESSAGE =
  "Could not read GPS. Allow location when prompted, tap the map to set the center, or rebuild the app (npx expo run:android) for native GPS.";

type ExpoLocationModule = typeof import("expo-location");

let cached: ExpoLocationModule | null | undefined;

export function isExpoLocationNativeAvailable(): boolean {
  return requireOptionalNativeModule("ExpoLocation") != null;
}

export async function loadExpoLocation(): Promise<ExpoLocationModule | null> {
  if (cached !== undefined) return cached;
  if (!isExpoLocationNativeAvailable()) {
    cached = null;
    return null;
  }
  try {
    cached = await import("expo-location");
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type DeviceLocationResult = {
  coords: DeviceCoords;
  /** "current" = fresh fix; "lastKnown" = cached OS fix used because the fresh
   *  fix timed out or failed (avoids the indefinite "Sending…" / "Requesting
   *  GPS…" hang on weak signal / indoors / emulator). */
  source: "current" | "lastKnown";
};

export type ReadDeviceLocationOptions = {
  /** Hard cap for the fresh GPS fix before we fall back. Default 8000ms. */
  timeoutMs?: number;
  /** Ask the user for permission when not yet granted. Default true. */
  requestPermission?: boolean;
};

/**
 * Resilient single-shot device location read.
 *
 * Native `getCurrentPositionAsync` can block for a very long time when there
 * is no quick GPS fix (indoors, weak signal, emulator). We bound it with a
 * timeout and fall back to the OS last-known position so callers never hang.
 * Returns `null` when expo-location is unavailable, permission is denied,
 * services are off, or no fix can be obtained at all.
 */
export async function readDeviceLocation(
  options?: ReadDeviceLocationOptions,
): Promise<DeviceLocationResult | null> {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const requestPermission = options?.requestPermission ?? true;

  const Location = await loadExpoLocation();
  if (!Location) return null;

  try {
    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.status === "granted";
    if (!granted && requestPermission && existing.canAskAgain !== false) {
      const requested = await Location.requestForegroundPermissionsAsync();
      granted = requested.status === "granted";
    }
    if (!granted) return null;

    const servicesOn = await Location.hasServicesEnabledAsync().catch(
      () => true,
    );

    const toCoords = (pos: {
      coords: { latitude: number; longitude: number; accuracy?: number | null };
    }): DeviceCoords => ({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      ...(pos.coords.accuracy != null ? { accuracy: pos.coords.accuracy } : {}),
    });

    const lastKnown = async (): Promise<DeviceLocationResult | null> => {
      try {
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) return { coords: toCoords(pos), source: "lastKnown" };
      } catch {
        /* ignore */
      }
      return null;
    };

    // When services are reported off, a fresh fix will never arrive — use the
    // last cached fix if any, otherwise give up so the caller can fall back.
    if (!servicesOn) {
      return await lastKnown();
    }

    const fresh = await raceWithTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      timeoutMs,
    );
    if (fresh) return { coords: toCoords(fresh), source: "current" };

    // Fresh fix timed out — fall back to the last known position.
    return await lastKnown();
  } catch {
    // Any throw (e.g. "Current location is unavailable") falls back to cache.
    try {
      const Loc = await loadExpoLocation();
      if (Loc) {
        const pos = await Loc.getLastKnownPositionAsync();
        if (pos) {
          return {
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              ...(pos.coords.accuracy != null
                ? { accuracy: pos.coords.accuracy }
                : {}),
            },
            source: "lastKnown",
          };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
