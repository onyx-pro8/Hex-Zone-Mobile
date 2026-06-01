import { loadExpoLocation } from "@/lib/expoLocation";
import { normalizeMapCenter, type MapCenter } from "@/lib/mapCenter";
import { getStoredMapCenter } from "@/lib/storage";

export const MESSAGE_POSITION_REQUIRED =
  "No location available. Allow GPS, or set your address on your account so we can use it as a fallback.";

export type MessagePositionSource = "gps" | "profile" | "stored";

export type ResolvedMessagePosition = {
  position: MapCenter;
  source: MessagePositionSource;
};

/**
 * Resolves sender position for geo-propagation messages.
 *
 * Priority:
 *   1. Live GPS (most accurate; matches the alarm intent)
 *   2. Profile `mapCenter` saved on the account — backfilled from the
 *      address geocode at registration, so it always exists once the
 *      account is created with a valid address.
 *   3. Last Dashboard map center stored locally on this device.
 */
export async function resolveMessagePropagationPosition(
  profileMapCenter?: MapCenter | null,
): Promise<ResolvedMessagePosition | { error: string }> {
  const gps = await tryReadGps();
  if (gps) return { position: gps, source: "gps" };

  const fromProfile = normalizeMapCenter(profileMapCenter ?? null);
  if (fromProfile) return { position: fromProfile, source: "profile" };

  const stored = await getStoredMapCenter();
  if (stored) return { position: stored, source: "stored" };

  return { error: MESSAGE_POSITION_REQUIRED };
}

async function tryReadGps(): Promise<MapCenter | null> {
  const Location = await loadExpoLocation();
  if (!Location) return null;
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.status === "granted";
    if (!granted && existing.canAskAgain !== false) {
      const requested = await Location.requestForegroundPermissionsAsync();
      granted = requested.status === "granted";
    }
    if (!granted) return null;
    const servicesOn = await Location.hasServicesEnabledAsync().catch(
      () => true,
    );
    if (!servicesOn) return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch {
    return null;
  }
}
