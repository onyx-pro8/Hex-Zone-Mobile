import type { LatLng } from "@/lib/h3";
import type { SavedZone, ZoneType } from "@/api/zones";

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  geofence: "Geofence",
  grid: "Grid",
  proximity: "Proximity",
  dynamic: "Dynamic",
  communal_id: "Communal ID",
  government_local_code: "Government code",
  object: "Object",
};

/** Short, type-aware summary for the saved-zones list (radius, cells, etc). */
export function summarizeZone(zone: SavedZone): string {
  const t = normalizeZoneType(zone.type ?? zone.zone_type);
  const cfg = (zone.config ?? {}) as Record<string, unknown>;
  if (t === "grid") {
    const cells = Array.isArray(zone.h3_cells)
      ? zone.h3_cells.length
      : Array.isArray(cfg.h3_cells)
        ? (cfg.h3_cells as unknown[]).length
        : 0;
    return `Grid · ${cells} cells`;
  }
  if (t === "proximity") {
    const r = Number(cfg.radius_meters);
    return Number.isFinite(r) && r > 0 ? `Proximity · ${Math.round(r)} m` : "Proximity";
  }
  if (t === "dynamic") {
    const target = Number(cfg.target_user_count);
    const r = Number(cfg.resolved_radius_meters);
    if (Number.isFinite(target) && Number.isFinite(r)) {
      return `Dynamic · ${target} users / ${Math.round(r)} m`;
    }
    if (Number.isFinite(target)) return `Dynamic · target ${target}`;
    return "Dynamic";
  }
  if (t === "object") {
    const r = Number(cfg.radius_meters);
    const name = typeof cfg.object_name === "string" ? cfg.object_name : "";
    if (name && Number.isFinite(r)) return `Object · ${name} · ${Math.round(r)} m`;
    if (name) return `Object · ${name}`;
    return Number.isFinite(r) ? `Object · ${Math.round(r)} m` : "Object";
  }
  if (t === "communal_id") {
    const id = typeof cfg.communal_id === "string" ? cfg.communal_id : "";
    return id ? `Communal · ${id}` : "Communal ID";
  }
  if (t === "government_local_code") {
    const ref =
      typeof cfg.reference_id === "string"
        ? cfg.reference_id
        : typeof cfg.postal_code === "string"
          ? (cfg.postal_code as string)
          : "";
    return ref ? `Gov · ${ref}` : "Government code";
  }
  return "Geofence";
}

export type ZoneLayerKind = "polygon" | "circle" | "marker";

export type ZoneCircle = {
  center: LatLng;
  radiusMeters: number;
};

export type MapZoneLayer = {
  id: string;
  name: string;
  zoneType: ZoneType;
  color: string;
  rings: LatLng[][];
  h3Cells: string[];
  circles: ZoneCircle[];
  marker?: LatLng;
  /** Raw API row preserved for type-specific summary / metadata UI. */
  raw: SavedZone;
};

export const ZONE_COLORS: Record<ZoneType, string> = {
  geofence: "#FF2DAA",
  grid: "#F59E0B",
  proximity: "#06B6D4",
  dynamic: "#22C55E",
  communal_id: "#8B5CF6",
  government_local_code: "#0EA5E9",
  object: "#A855F7",
};

export function colorForZoneType(t: ZoneType): string {
  return ZONE_COLORS[t] ?? "#FF2DAA";
}

export function normalizeZoneType(value: unknown): ZoneType {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (
    [
      "geofence",
      "grid",
      "proximity",
      "dynamic",
      "communal_id",
      "government_local_code",
      "object",
    ].includes(raw)
  ) {
    return raw as ZoneType;
  }
  if (raw === "polygon") return "geofence";
  if (raw === "circle") return "proximity";
  if (raw === "custom_1") return "communal_id";
  if (raw === "custom_2") return "government_local_code";
  return "geofence";
}

/** GeoJSON positions are always `[longitude, latitude]`. */
function geoJsonPositionToLatLng(pair: unknown): LatLng | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const lng = Number(pair[0]);
  const lat = Number(pair[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90) return null;
  return [lat, lng];
}

function ringFromGeoJsonRing(ring: unknown): LatLng[] | null {
  if (!Array.isArray(ring)) return null;
  const pts = ring
    .map(geoJsonPositionToLatLng)
    .filter((p): p is LatLng => p !== null);
  return pts.length >= 3 ? pts : null;
}

export function ringsFromGeoJsonPolygon(geo: unknown): LatLng[][] {
  if (!geo || typeof geo !== "object") return [];
  const g = geo as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return g.coordinates
      .map(ringFromGeoJsonRing)
      .filter((r): r is LatLng[] => r !== null);
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const out: LatLng[][] = [];
    for (const poly of g.coordinates) {
      if (!Array.isArray(poly)) continue;
      for (const ring of poly) {
        const parsed = ringFromGeoJsonRing(ring);
        if (parsed) out.push(parsed);
      }
    }
    return out;
  }
  return [];
}

export function latLngRingToGeoJsonPolygon(points: LatLng[]): {
  type: "Polygon";
  coordinates: [number, number][][];
} {
  const open =
    points.length >= 4 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
      ? points.slice(0, -1)
      : points;
  const ring: [number, number][] = open.map(([lat, lng]) => [lng, lat]);
  if (ring.length < 3) {
    throw new Error("Polygon needs at least 3 points");
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

export function circleToGeoJsonPolygon(
  circle: ZoneCircle,
  segments = 48,
): { type: "Polygon"; coordinates: [number, number][][] } {
  const [lat, lng] = circle.center;
  const r = circle.radiusMeters;
  const earthRadius = 6371000;
  const latRad = (lat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    const dLat = (r * Math.cos(angle)) / earthRadius;
    const dLng =
      (r * Math.sin(angle)) / (earthRadius * Math.cos(latRad));
    const newLat = lat + (dLat * 180) / Math.PI;
    const newLng = lng + (dLng * 180) / Math.PI;
    ring.push([newLng, newLat]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

export function readZoneCircles(zone: SavedZone): ZoneCircle[] {
  const cfg = (zone.config ?? {}) as Record<string, unknown>;
  const geo = (zone.geometry ?? {}) as Record<string, unknown>;
  const out: ZoneCircle[] = [];

  const radius =
    Number(cfg.radius_meters) ||
    Number(cfg.resolved_radius_meters) ||
    Number((Array.isArray(cfg.radii_meters) ? cfg.radii_meters[0] : null));

  const centerRaw = geo.center as
    | { latitude?: number; longitude?: number }
    | undefined;
  if (centerRaw && Number.isFinite(centerRaw.latitude) &&
      Number.isFinite(centerRaw.longitude) && radius > 0) {
    out.push({
      center: [centerRaw.latitude as number, centerRaw.longitude as number],
      radiusMeters: radius,
    });
  }

  if (Array.isArray(geo.circles)) {
    for (const c of geo.circles as Array<Record<string, unknown>>) {
      const center = c.center as { latitude?: number; longitude?: number } | undefined;
      const r = Number(c.radius_meters);
      if (center && Number.isFinite(center.latitude) &&
          Number.isFinite(center.longitude) && r > 0) {
        out.push({
          center: [center.latitude as number, center.longitude as number],
          radiusMeters: r,
        });
      }
    }
  }
  return out;
}

export function readZoneRings(zone: SavedZone): LatLng[][] {
  const geom = (zone.geometry ?? {}) as Record<string, unknown>;
  let rings = ringsFromGeoJsonPolygon(geom.geo_fence_polygon);
  if (rings.length === 0) {
    rings = ringsFromGeoJsonPolygon(zone.geo_fence_polygon);
  }
  if (rings.length === 0) {
    rings = ringsFromGeoJsonPolygon(geom);
  }
  return rings;
}

export function readZoneCenter(zone: SavedZone): LatLng | null {
  const geo = (zone.geometry ?? {}) as Record<string, unknown>;
  const c = geo.center as { latitude?: number; longitude?: number } | undefined;
  if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
    return [c.latitude as number, c.longitude as number];
  }
  return null;
}

export function zoneRecordToLayer(
  zone: SavedZone,
  index: number,
): MapZoneLayer | null {
  const id = zone.id ?? zone.zone_id;
  if (id == null) return null;
  const zoneType = normalizeZoneType(zone.type ?? zone.zone_type);
  const name =
    typeof zone.name === "string" && zone.name.trim()
      ? zone.name.trim()
      : `Zone ${id}`;
  const rings = readZoneRings(zone);
  const circles = readZoneCircles(zone);
  const cfg = (zone.config ?? {}) as Record<string, unknown>;
  const fromConfig = Array.isArray(cfg.h3_cells)
    ? cfg.h3_cells.filter((c): c is string => typeof c === "string")
    : [];
  const fromRow = Array.isArray(zone.h3_cells)
    ? zone.h3_cells.filter((c): c is string => typeof c === "string")
    : [];
  const h3Cells = fromRow.length > 0 ? fromRow : fromConfig;

  if (
    rings.length === 0 &&
    circles.length === 0 &&
    h3Cells.length === 0
  ) {
    const center = readZoneCenter(zone);
    if (!center) return null;
    return {
      id: String(id),
      name,
      zoneType,
      color: colorForZoneType(zoneType),
      rings: [],
      circles: [],
      h3Cells: [],
      marker: center,
      raw: zone,
    };
  }

  return {
    id: String(id),
    name,
    zoneType,
    color: colorForZoneType(zoneType),
    rings,
    circles,
    h3Cells,
    marker: readZoneCenter(zone) ?? undefined,
    raw: zone,
  };
}

export const POLYGON_CLOSE_METERS = 35;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const earthRadius = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

export function pointsEqual(a: LatLng, b: LatLng): boolean {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

export function isClosedPolygon(points: LatLng[]): boolean {
  if (points.length < 4) return false;
  return pointsEqual(points[0], points[points.length - 1]);
}

export function addPolygonPoint(
  current: LatLng[],
  point: LatLng,
): LatLng[] {
  if (current.length === 0) return [point];
  if (isClosedPolygon(current)) return current;
  const first = current[0];
  if (
    current.length >= 3 &&
    distanceMeters(point, first) <= POLYGON_CLOSE_METERS
  ) {
    return [...current, first];
  }
  return [...current, point];
}
