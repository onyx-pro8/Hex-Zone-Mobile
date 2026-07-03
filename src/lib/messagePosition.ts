import { readDeviceLocation } from "@/lib/expoLocation";
import { normalizeMapCenter, type MapCenter } from "@/lib/mapCenter";
import { getStoredMapCenter } from "@/lib/storage";
import type { MessageType } from "@/lib/messageTypes";
import { usesRegisteredAddressForType } from "@/lib/messageWorkflow";

export const MESSAGE_POSITION_REQUIRED =
  "No location available. Allow GPS, or set your address on your account so we can use it as a fallback.";

export const REGISTERED_ADDRESS_REQUIRED =
  "No registered address on your account. Set your home address in account settings — SENSOR and WELLNESS CHECK use that location, not live GPS.";

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

/**
 * Type-aware position resolution for geo propagation.
 *
 * - SENSOR / WELLNESS CHECK → registered address only (profile mapCenter).
 * - PANIC, NS-PANIC, PRIVATE, PA, SERVICE, UNKNOWN → live GPS, then profile/stored fallback.
 */
export async function resolveMessagePropagationPositionForType(
  messageType: MessageType,
  profileMapCenter?: MapCenter | null,
): Promise<ResolvedMessagePosition | { error: string }> {
  if (usesRegisteredAddressForType(messageType)) {
    const fromProfile = normalizeMapCenter(profileMapCenter ?? null);
    if (fromProfile) {
      void publishMemberLocation(fromProfile);
      return { position: fromProfile, source: "profile" };
    }
    return { error: REGISTERED_ADDRESS_REQUIRED };
  }

  return resolveMessagePropagationPosition(profileMapCenter);
}

async function tryReadGps(): Promise<MapCenter | null> {
  const result = await readDeviceLocation({ timeoutMs: SEND_GPS_TIMEOUT_MS });
  if (!result) return null;
  return {
    latitude: result.coords.latitude,
    longitude: result.coords.longitude,
  };
}

export function messagePositionSourceLabel(source: MessagePositionSource): string {
  if (source === "gps") return "live GPS";
  if (source === "profile") return "registered address";
  return "last map center";
}
