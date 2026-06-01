/** Photon (Komoot) — OpenStreetMap search, browser-friendly CORS */

export type PhotonProperties = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  locality?: string;
  postcode?: string;
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
};

export type PhotonFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PhotonProperties;
};

type PhotonResponse = {
  type: "FeatureCollection";
  features: PhotonFeature[];
};

/** Human-readable single line for the form field */
export function formatPhotonLabel(p: PhotonProperties): string {
  const city = p.city || p.town || p.village || p.locality || "";
  const line1 =
    [p.housenumber, p.street].filter(Boolean).join(" ").trim() ||
    p.street ||
    p.name ||
    "";
  const parts = [line1, city, p.state, p.country].filter(
    (x) => x && String(x).trim().length > 0,
  ) as string[];
  const deduped = [...new Set(parts)];
  const joined = deduped.join(", ");
  return joined.trim() || p.name?.trim() || "Unknown location";
}

/** Short category for POIs (cafe, building, shop, …). */
export function formatPhotonPlaceCategory(p: PhotonProperties): string {
  const key = (p.osm_key ?? "").trim();
  const val = (p.osm_value ?? "").trim();
  if (key && val) return `${key}: ${val}`;
  if (val) return val;
  if (key) return key;
  const type = (p.type ?? "").trim();
  return type && type !== "house" ? type : "";
}

export async function searchPhotonAddresses(
  query: string,
  signal: AbortSignal,
): Promise<PhotonFeature[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as PhotonResponse;
  return Array.isArray(data.features) ? data.features : [];
}
