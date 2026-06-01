export type MapCenter = {
  latitude: number;
  longitude: number;
};

export function normalizeMapCenter(
  value:
    | { latitude?: unknown; longitude?: unknown }
    | null
    | undefined,
): MapCenter | null {
  if (!value || typeof value !== "object") return null;
  const rawLat = Number(value.latitude);
  const rawLng = Number(value.longitude);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return null;

  if (Math.abs(rawLat) <= 90 && Math.abs(rawLng) <= 180) {
    return { latitude: rawLat, longitude: rawLng };
  }
  if (Math.abs(rawLng) <= 90 && Math.abs(rawLat) <= 180) {
    return { latitude: rawLng, longitude: rawLat };
  }
  return null;
}
