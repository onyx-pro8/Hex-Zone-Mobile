import { useEffect } from "react";
import { readDeviceLocation } from "@/lib/expoLocation";
import { updateLocation } from "@/api/members";

/** How often we push GPS to the server for in-zone recipient matching. */
const SYNC_INTERVAL_MS = 30_000;

/**
 * Periodically publishes the device's GPS position to the server
 * (`POST /members/location`) so this user can be matched as an in-zone
 * recipient for geo messages (PA / PANIC / WELLNESS / PRIVATE, etc.).
 *
 * Zone-based delivery resolves recipients from each owner's stored
 * `owners.latitude/longitude`; without this sync a user physically inside a
 * zone is never found and silently receives nothing. No-op when not enabled
 * (e.g. signed out) or when native location is unavailable.
 */
export function useLocationSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const push = async () => {
      const result = await readDeviceLocation({
        timeoutMs: 8000,
        allowLastKnown: false,
      });
      if (cancelled || !result) return;
      await updateLocation({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      });
    };

    void push();
    const id = setInterval(() => {
      void push();
    }, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
}
