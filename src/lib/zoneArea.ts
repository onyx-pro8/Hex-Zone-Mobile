type LatLng = [number, number];

/** Average H3 cell area in m² by resolution. Close enough for the Save button. */
const H3_AVG_M2 = [
  4_357_449_416_078, 609_788_441_794, 86_801_780_399, 12_393_434_655,
  1_770_347_654, 252_903_858, 36_129_062, 5_161_293, 737_328, 105_333, 15_048,
  2_150, 307, 43.9, 6.3, 0.9,
];

function h3Resolution(cell: string): number | null {
  const token = cell.trim();
  if (!/^[0-9a-fA-F]+$/.test(token)) return null;
  try {
    const value = BigInt(`0x${token}`);
    const resolution = Number((value >> 52n) & 15n);
    return resolution >= 0 && resolution <= 15 ? resolution : null;
  } catch {
    return null;
  }
}

function h3AreaM2(cells: string[]): number {
  let total = 0;
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = cell.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const resolution = h3Resolution(key);
    if (resolution == null) continue;
    total += H3_AVG_M2[resolution] ?? 0;
  }
  return total;
}

function ringAreaM2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const radius = 6378137;
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lat, lng] = ring[index];
    const [lat2, lng2] = ring[(index + 1) % ring.length];
    total +=
      ((lng2 - lng) * Math.PI) / 180 *
      (2 + Math.sin((lat * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((total * radius * radius) / 2);
}

/** One unit, picked so a map chip stays short. */
export function formatAreaCompact(m2: number): string {
  const meters = Math.max(0, m2);
  if (meters >= 10_000) {
    const km = meters / 1_000_000;
    return `${km.toLocaleString(undefined, {
      minimumFractionDigits: km >= 10 ? 1 : 2,
      maximumFractionDigits: km >= 10 ? 1 : 2,
    })} km²`;
  }
  return `${Math.round(meters).toLocaleString()} m²`;
}

export function formatAreaLimit(m2: number | null): string {
  if (m2 == null) return "No limit";
  return formatAreaCompact(m2);
}

export function circleAreaM2(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return 0;
  return Math.PI * radiusMeters * radiusMeters;
}

export function draftAreaM2(input: {
  zoneType: string;
  ring: LatLng[];
  circleRadius: number | null;
  cells: string[];
  radiusMeters: number | null;
}): number {
  if (input.zoneType === "geofence") {
    if (input.circleRadius != null && input.circleRadius > 0) {
      return circleAreaM2(input.circleRadius);
    }
    return ringAreaM2(input.ring);
  }
  if (input.zoneType === "grid") return h3AreaM2(input.cells);
  if (input.zoneType === "government_local_code") {
    const ringArea = ringAreaM2(input.ring);
    if (ringArea > 0) return ringArea;
    return h3AreaM2(input.cells);
  }
  if (
    input.zoneType === "proximity" ||
    input.zoneType === "object" ||
    input.zoneType === "dynamic"
  ) {
    return circleAreaM2(input.radiusMeters ?? 0);
  }
  return 0;
}

export function areaBlockReason(input: {
  draftM2: number;
  eachZoneM2: number | null;
  remainingTotalM2: number | null;
}): string | null {
  if (input.draftM2 <= 0) return null;
  if (input.eachZoneM2 != null && input.draftM2 > input.eachZoneM2 + 1) {
    return "Exceeds the each-zone size limit.";
  }
  if (
    input.remainingTotalM2 != null &&
    input.draftM2 > input.remainingTotalM2 + 1
  ) {
    return "Exceeds the total size limit.";
  }
  return null;
}
