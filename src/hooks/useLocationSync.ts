import { useEffect } from "react";
import { readDeviceLocation } from "@/lib/expoLocation";
import { updateLocation } from "@/api/members";

/** How often we push GPS to the server for in-zone recipient matching. */
const SYNC_INTERVAL_MS = 30_000;

/**
 * Periodically publishes the device's GPS position to the server
 * (`POST /members/location`) for dynamic zones and sender-side live geo workflows.
 * Live fixes are stored in `member_locations`; registered home address coords
 * on the owner profile are unchanged.
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
