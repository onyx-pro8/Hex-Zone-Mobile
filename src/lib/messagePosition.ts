import { readDeviceLocation } from "@/lib/expoLocation";
import { normalizeMapCenter, type MapCenter } from "@/lib/mapCenter";
import { getStoredMapCenter } from "@/lib/storage";

export const MESSAGE_POSITION_REQUIRED =
  "No location available. Allow GPS, or set your address on your account so we can use it as a fallback.";

export type MessagePositionSource = "gps" | "profile" | "stored";

export type ResolvedMessagePosition = {
  position: MapCenter;
  source: MessagePositionSource;
};

/** Max time to wait for a fresh GPS fix before falling back. Keeps the Send
 *  button from hanging for ~60s on weak signal / indoors / emulator. */
const SEND_GPS_TIMEOUT_MS = 7000;

/** Best-effort: keep server-side presence current for geo message delivery. */
export async function publishMemberLocation(position: MapCenter): Promise<void> {
  try {
    const { updateLocation } = await import("@/api/members");
    await updateLocation(position);
  } catch {
    /* non-blocking */
  }
}

/**
 * Resolves sender position for geo-propagation messages.
 *
 * Priority:
 *   1. Live GPS, but bounded by a short timeout with a last-known-position
 *      fallback so sending never blocks for long.
 *   2. Profile `mapCenter` saved on the account — backfilled from the
 *      address geocode at registration, so it always exists once the
 *      account is created with a valid address.
 *   3. Last Dashboard map center stored locally on this device.
 */
export async function resolveMessagePropagationPosition(
  profileMapCenter?: MapCenter | null,
): Promise<ResolvedMessagePosition | { error: string }> {
  const gps = await tryReadGps();
  if (gps) {
    void publishMemberLocation(gps);
    return { position: gps, source: "gps" };
  }

  const fromProfile = normalizeMapCenter(profileMapCenter ?? null);
  if (fromProfile) {
    void publishMemberLocation(fromProfile);
    return { position: fromProfile, source: "profile" };
  }

  const stored = await getStoredMapCenter();
  if (stored) {
    void publishMemberLocation(stored);
    return { position: stored, source: "stored" };
  }

  return { error: MESSAGE_POSITION_REQUIRED };
}

async function tryReadGps(): Promise<MapCenter | null> {
  const result = await readDeviceLocation({ timeoutMs: SEND_GPS_TIMEOUT_MS });
  if (!result) return null;
  return {
    latitude: result.coords.latitude,
    longitude: result.coords.longitude,
  };
}
