import {
  claimDeviceSession,
  createDevice,
  deleteDevice,
  getDevices,
  sendDeviceHeartbeat,
  updateDevice,
  type DeviceRecord,
} from "@/api/devices";
import { normalizeAccountType, type NormalizedAccountType } from "@/lib/accountLimits";
import { getOrCreateDeviceHid } from "@/lib/storage";
import type { AuthUser } from "@/api/auth";

/** Thrown when login succeeds but another device holds the active session. */
export class DeviceSessionConflictError extends Error {
  constructor(
    message = "This account is already active on another device.",
  ) {
    super(message);
    this.name = "DeviceSessionConflictError";
  }
}

export function isDeviceSessionConflictError(
  err: unknown,
): err is DeviceSessionConflictError {
  return (
    err instanceof DeviceSessionConflictError ||
    (err instanceof Error && err.name === "DeviceSessionConflictError")
  );
}

export function isDeviceSessionConflictMessage(message: string): boolean {
  return /already in use|sign out there first|already active on another device|change the device/i.test(
    message,
  );
}

export const DEVICE_PRESENCE_TIMEOUT_MS = 30 * 60 * 1000;

export const DEVICE_CHANGE_PROMPT_TITLE = "Change the device?";
export const DEVICE_CHANGE_PROMPT_MESSAGE =
  "This account is already active on another device. Use this device instead? The other device will be signed out.";
export const DEVICE_CHANGE_DECLINED_MESSAGE =
  "Login cancelled. Sign out on the other device first, or choose to change the device when prompted.";
export const DEVICE_SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account is now active on another device.";

export const ACCOUNT_IN_USE_MESSAGE = DEVICE_CHANGE_PROMPT_MESSAGE;

export type DeviceSyncResult =
  | { status: "ok"; deviceId?: number | string }
  | { status: "account-in-use" }
  | { status: "error"; message: string };

function deviceLastSeenMs(device: DeviceRecord): number | null {
  const raw = device.last_seen ?? device.updated_at ?? device.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whether another device currently holds the account session (login gate). */
export function isDeviceSessionBlocking(device: DeviceRecord): boolean {
  return device.is_online === true;
}

/** UI presence: online flag plus optional stale timeout for display. */
export function deriveDeviceOnline(device: DeviceRecord): boolean {
  if (device.is_online !== true) return false;
  const seen = deviceLastSeenMs(device);
  if (seen == null) return true;
  return Date.now() - seen <= DEVICE_PRESENCE_TIMEOUT_MS;
}

export function isAccountInUseError(message: string): boolean {
  return isDeviceSessionConflictMessage(message);
}

/**
 * True unless another device clearly holds the live session.
 * Missing/offline local rows alone must not force logout — cold start and
 * transient sync gaps are recovered by `syncCurrentDevice`.
 */
export async function isLocalDeviceSessionActive(
  ownerId: string,
): Promise<boolean> {
  const localHid = await getOrCreateDeviceHid();
  const devices = await getDevices();
  if (devices.error) return true;
  const id = String(ownerId ?? "").trim();
  const mine = (devices.data ?? []).filter(
    (d) => !id || String(d.owner_id ?? "") === id,
  );
  const localHidUpper = localHid.toUpperCase();
  const local = mine.find(
    (d) => String(d.hid).toUpperCase() === localHidUpper,
  );
  const otherOnline = mine.some(
    (d) =>
      String(d.hid).toUpperCase() !== localHidUpper &&
      isDeviceSessionBlocking(d),
  );
  if (!otherOnline) return true;
  return local?.is_online === true;
}

function ownerDevicesForUser(
  list: DeviceRecord[],
  ownerId: string,
): DeviceRecord[] {
  if (!ownerId) return list;
  return list.filter((d) => String(d.owner_id ?? "") === ownerId);
}

function mapCreateError(error: string): DeviceSyncResult {
  if (isAccountInUseError(error)) {
    return { status: "account-in-use" };
  }
  if (/allows at most \d+ device/i.test(error)) {
    return { status: "account-in-use" };
  }
  return { status: "error", message: error };
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

export async function signOutDevice(deviceId: number | string): Promise<void> {
  await updateDevice(deviceId, { is_online: false });
}

export async function removeDevice(deviceId: number | string): Promise<void> {
  await deleteDevice(deviceId);
}

export async function syncCurrentDevice(
  user: AuthUser | null,
  options?: { platformLabel?: string; forceTakeover?: boolean },
): Promise<DeviceSyncResult> {
  if (!user) return { status: "ok" };
  const platformLabel = options?.platformLabel ?? "Mobile";
  try {
    const localHid = await getOrCreateDeviceHid();
    const display = user.name?.trim() || user.email?.trim() || platformLabel;
    const ownerId = String(user.id ?? "").trim();

    if (options?.forceTakeover) {
      const claim = await claimDeviceSession(localHid);
      if (claim.error) {
        return { status: "error", message: claim.error };
      }
    }

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
      if (!options?.forceTakeover) {
        const otherOnline = mine.filter(
          (d) =>
            String(d.hid).toUpperCase() !== localHid.toUpperCase() &&
            isDeviceSessionBlocking(d),
        );
        if (otherOnline.length > 0) {
          return { status: "account-in-use" };
        }
      }
      await updateDevice(byLocalHid.id, { is_online: true });
      await sendDeviceHeartbeat(byLocalHid.id);
      return { status: "ok", deviceId: byLocalHid.id };
    }

    if (!options?.forceTakeover) {
      const otherOnline = mine.filter((d) => isDeviceSessionBlocking(d));
      if (otherOnline.length > 0) {
        return { status: "account-in-use" };
      }
    }

    // Let the server evict offline devices when at capacity — never delete from
    // the client during login sync (that was removing the other platform's row).
    const created = await createDevice({
      hid: localHid,
      name: `${display} (${platformLabel})`,
      enable_notification: true,
      propagate_enabled: true,
      is_online: true,
    });
    if (created.error) {
      return mapCreateError(created.error);
    }
    if (created.data?.id != null) {
      await sendDeviceHeartbeat(created.data.id);
      return { status: "ok", deviceId: created.data.id };
    }
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return mapCreateError(message);
  }
}

export function describeDeviceSyncFailure(
  result: Extract<DeviceSyncResult, { status: "account-in-use" | "error" }>,
): string {
  if (result.status === "account-in-use") return ACCOUNT_IN_USE_MESSAGE;
  return result.message;
}

export type { NormalizedAccountType };
