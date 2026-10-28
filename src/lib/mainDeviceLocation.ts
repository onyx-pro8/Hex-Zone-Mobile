import { getRemoteAppSettings } from "@/api/settings";
import type { DeviceRecord } from "@/api/devices";
import { getAppSettings, updateAppSettings } from "@/lib/appSettings";
import { formatPhotonLabel } from "@/lib/addressSearch";
import { loadExpoLocation, readDeviceLocation } from "@/lib/expoLocation";
import { getStoredMapCenter } from "@/lib/storage";

export type MainDevicePlace = {
  address: string;
  latitude?: number;
  longitude?: number;
};

function clean(value?: string | null): string {
  return (value ?? "").trim();
}

/** Blank and the create-device placeholder are not a real place. */
export function isPlaceholderAddress(value?: string | null): boolean {
  const text = clean(value).toLowerCase();
  return !text || text === "unknown" || text === "unknown location";
}

function coordsClose(a?: number | null, b?: number | null): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.0008;
}

async function settingsAddress(): Promise<string> {
  const local = clean(getAppSettings().address);
  if (local) return local;
  try {
    const remote = await getRemoteAppSettings();
    const address = clean(remote.data?.address);
    if (address) await updateAppSettings({ address });
    return address;
  } catch {
    return "";
  }
}

function formatGeocodedPlace(place: {
  streetNumber?: string | null;
  street?: string | null;
  name?: string | null;
  district?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const street = [place.streetNumber, place.street].filter(Boolean).join(" ").trim();
  const parts = [
    street || place.name,
    place.city || place.district || place.subregion,
    place.region,
    place.postalCode,
    place.country,
  ]
    .map((part) => clean(part))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  const label = unique.join(", ");
  return isPlaceholderAddress(label) ? "" : label;
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const Location = await loadExpoLocation();
  if (Location?.reverseGeocodeAsync) {
    try {
      const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
      const label = rows?.[0] ? formatGeocodedPlace(rows[0]) : "";
      if (label) return label;
    } catch {
      /* fall through to Photon */
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&lang=en`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      features?: Array<{ properties?: Parameters<typeof formatPhotonLabel>[0] }>;
    };
    const label = formatPhotonLabel(data.features?.[0]?.properties ?? {});
    return isPlaceholderAddress(label) ? "" : label;
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Place for the signed-in phone. Live GPS wins. The account address in
 * Settings is used only when GPS is unavailable and the phone has no place yet.
 */
export async function resolveMainDevicePlace(
  currentAddress?: string | null,
): Promise<MainDevicePlace | null> {
  const gps = await readDeviceLocation({
    timeoutMs: 4000,
    allowLastKnown: true,
    requestPermission: true,
  });
  if (gps) {
    const label = (await reverseGeocode(gps.coords.latitude, gps.coords.longitude)) ||
      (await settingsAddress());
    if (!label) return null;
    return {
      address: label,
      latitude: gps.coords.latitude,
      longitude: gps.coords.longitude,
    };
  }

  if (!isPlaceholderAddress(currentAddress)) return null;
  const address = await settingsAddress();
  if (!address) return null;
  const center = await getStoredMapCenter();
  return {
    address,
    ...(center
      ? { latitude: center.latitude, longitude: center.longitude }
      : {}),
  };
}

export function mainDevicePlaceChanged(
  device: Pick<DeviceRecord, "address" | "latitude" | "longitude">,
  place: MainDevicePlace,
): boolean {
  if (clean(device.address) !== place.address) return true;
  if (place.latitude == null || place.longitude == null) return false;
  return (
    !coordsClose(device.latitude, place.latitude) ||
    !coordsClose(device.longitude, place.longitude)
  );
}
