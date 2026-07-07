/** Shared geo helpers for auth screens (no h3-js import — it breaks React Native's TextDecoder). */

export type LatLng = [number, number];

/** Default map center for auth screens (Manhattan, mirrors the web client). */
export const AUTH_MAP_DEFAULT_CENTER: LatLng = [40.7527, -73.9772];

export function generateZoneId(): string {
  return `Network-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/** Deterministic mock geocode when the user types without picking a suggestion. */
export function addressToMockCoords(address: string): LatLng {
  const seed = address
    .trim()
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const lat = 37.33 + ((seed % 100) / 1000) * (address.length > 0 ? 1 : 0);
  const lng = -122.03 - ((seed % 100) / 1000) * (address.length > 0 ? 1 : 0);
  return [lat, lng];
}
