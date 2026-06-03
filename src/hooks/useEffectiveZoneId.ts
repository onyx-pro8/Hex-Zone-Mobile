import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getZones, type SavedZone } from "@/api/zones";
import { devLog } from "@/lib/devConsole";

/**
 * Resolve the canonical zone id for the signed-in account.
 *
 * Mirrors the fallback chain that `app/(tabs)/access-admin.tsx` already uses
 * so every guest-facing screen (guest list, guest passes, guest schedules)
 * keeps working even when `owners.zone_id` is still empty after the admin
 * created a zone via the dashboard:
 *
 *   1. `ownerZoneId` from `useAuth()` — for admins this equals the value in
 *      `owners.zone_id`; for invited members it is resolved from
 *      `GET /owners/{accountOwnerId}` so they share the admin's zone id.
 *   2. The first `zone_id` returned by `GET /zones` (zones the account can
 *      see). This is the same recovery the Access tab does when an admin has
 *      created zones but the owner-row column was never populated.
 *
 * The caller can also `setPickedZoneId(...)` to override the resolved value
 * when the admin has multiple zones; that is what the segmented chip picker
 * on the Access tab uses.
 */
export function useEffectiveZoneId() {
  const { ownerZoneId, user } = useAuth();
  const accountZoneId = ownerZoneId.trim();
  const [savedZones, setSavedZones] = useState<SavedZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [pickedZoneId, setPickedZoneId] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!user) return;
    setZonesLoading(true);
    try {
      const result = await getZones();
      const rows = result.data ?? [];
      setSavedZones(rows);
      devLog("useEffectiveZoneId: loaded zones", {
        count: rows.length,
        zone_ids: rows
          .map((z) => (z.zone_id ? String(z.zone_id) : ""))
          .filter(Boolean),
        error: result.error,
      });
    } finally {
      setZonesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const candidateZoneIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: unknown) => {
      if (raw == null) return;
      const str = String(raw).trim();
      if (!str || seen.has(str)) return;
      seen.add(str);
      out.push(str);
    };
    push(accountZoneId);
    for (const z of savedZones) push(z.zone_id);
    return out;
  }, [accountZoneId, savedZones]);

  const effectiveZoneId =
    pickedZoneId.trim() || accountZoneId || candidateZoneIds[0] || "";

  return {
    effectiveZoneId,
    accountZoneId,
    candidateZoneIds,
    zonesLoading,
    pickedZoneId,
    setPickedZoneId,
    refresh,
  };
}
