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
