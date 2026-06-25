import {
  createDevice,
  deleteDevice,
  getDevices,
  sendDeviceHeartbeat,
  updateDevice,
  type DeviceRecord,
} from "@/api/devices";
import {
  getDeviceLimit,
  normalizeAccountType,
  type NormalizedAccountType,
} from "@/lib/accountLimits";
import { getOrCreateDeviceHid } from "@/lib/storage";
import type { AuthUser } from "@/api/auth";

export const ACCOUNT_IN_USE_MESSAGE =
  "This account is already in use on another device. Sign out there first.";

export type DeviceSyncResult =
  | { status: "ok"; deviceId?: number | string }
  | { status: "account-in-use" }
  | { status: "error"; message: string };

export function deriveDeviceOnline(device: DeviceRecord): boolean {
  if (typeof device.is_online === "boolean") return device.is_online;
  if (typeof device.status === "boolean") return device.status;
  return device.active !== false;
}

function deviceRecency(device: DeviceRecord): number {
  const raw = device.last_seen ?? device.updated_at ?? device.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function ownerDevicesForUser(
  list: DeviceRecord[],
  ownerId: string,
): DeviceRecord[] {
  if (!ownerId) return list;
  return list.filter((d) => String(d.owner_id ?? "") === ownerId);
}

async function evictOfflineDevices(
  devices: DeviceRecord[],
  limit: number,
): Promise<void> {
  if (!Number.isFinite(limit)) return;
  let remaining = [...devices];
  while (remaining.length >= limit) {
    const offline = remaining.filter((d) => !deriveDeviceOnline(d));
    if (offline.length === 0) break;
    const oldest = offline.sort(
      (a, b) => deviceRecency(a) - deviceRecency(b),
    )[0];
    if (!oldest?.id) break;
    await deleteDevice(oldest.id);
    remaining = remaining.filter((d) => d.id !== oldest.id);
  }
}

export async function setCurrentDeviceOffline(): Promise<void> {
  const localHid = await getOrCreateDeviceHid();
  const devices = await getDevices();
  const existing = (devices.data ?? []).find(
    (d) => String(d.hid).toUpperCase() === localHid.toUpperCase(),
  );
  if (!existing?.id) return;
  await updateDevice(existing.id, { is_online: false });
}

export async function syncCurrentDevice(
  user: AuthUser | null,
  options?: { platformLabel?: string },
): Promise<DeviceSyncResult> {
  if (!user) return { status: "ok" };
  const platformLabel = options?.platformLabel ?? "Mobile";
  try {
    const localHid = await getOrCreateDeviceHid();
    const display = user.name?.trim() || user.email?.trim() || platformLabel;
    const ownerId = String(user.id ?? "").trim();
    const accountType = normalizeAccountType(
      user.accountType,
      user.account_type,
    );
    const limit = getDeviceLimit(accountType);

    const devicesResult = await getDevices();
    if (devicesResult.error) {
      return { status: "error", message: devicesResult.error };
    }
    const list = devicesResult.data ?? [];
    const mine = ownerDevicesForUser(list, ownerId);

    const byLocalHid = mine.find(
      (d) => String(d.hid).toUpperCase() === localHid.toUpperCase(),
    );
    if (byLocalHid?.id != null) {
      const otherOnline = mine.filter(
        (d) =>
          String(d.hid).toUpperCase() !== localHid.toUpperCase() &&
          deriveDeviceOnline(d),
      );
      if (otherOnline.length > 0) {
        return { status: "account-in-use" };
      }
      await updateDevice(byLocalHid.id, { is_online: true });
      await sendDeviceHeartbeat(byLocalHid.id);
      return { status: "ok", deviceId: byLocalHid.id };
    }

    const otherOnline = mine.filter((d) => deriveDeviceOnline(d));
    if (otherOnline.length > 0) {
      return { status: "account-in-use" };
    }

    await evictOfflineDevices(mine, limit);

    const created = await createDevice({
      hid: localHid,
      name: `${display} (${platformLabel})`,
      enable_notification: true,
      propagate_enabled: true,
      is_online: true,
    });
    if (created.error) {
      if (/already in use|sign out there first/i.test(created.error)) {
        return { status: "account-in-use" };
      }
      return { status: "error", message: created.error };
    }
    if (created.data?.id != null) {
      await sendDeviceHeartbeat(created.data.id);
      return { status: "ok", deviceId: created.data.id };
    }
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already in use|sign out there first/i.test(message)) {
      return { status: "account-in-use" };
    }
    return { status: "error", message };
  }
}

export function describeDeviceSyncFailure(
  result: Extract<DeviceSyncResult, { status: "account-in-use" | "error" }>,
): string {
  if (result.status === "account-in-use") return ACCOUNT_IN_USE_MESSAGE;
  return result.message;
}

export type { NormalizedAccountType };
