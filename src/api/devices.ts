import { request } from "./client";

export type PushPlatform = "FCM" | "APNS" | "EXPO";

export type DeviceOwner = {
  id?: number | string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  account_type?: string;
  active?: boolean;
};

export type DeviceRecord = {
  id: number | string;
  hid: string;
  name?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  propagate_enabled?: boolean;
  propagate_radius_km?: number;
  enable_notification?: boolean;
  alert_threshold_meters?: number;
  update_interval_seconds?: number;
  active?: boolean;
  status?: boolean;
  is_online?: boolean;
  owner_id?: number | string;
  owner?: DeviceOwner;
  h3_cell_id?: string;
  last_seen?: string;
  created_at?: string;
  updated_at?: string;
};

export type UpsertDevicePayload = {
  hid: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  propagate_enabled?: boolean;
  propagate_radius_km?: number;
  enable_notification?: boolean;
  alert_threshold_meters?: number;
  update_interval_seconds?: number;
  active?: boolean;
  status?: boolean;
  is_online?: boolean;
  push_token?: string;
  push_platform?: PushPlatform;
};

export async function getDevices() {
  return request<DeviceRecord[]>({ method: "GET", url: "/devices/" });
}

export async function createDevice(payload: UpsertDevicePayload) {
  return request<DeviceRecord>({
    method: "POST",
    url: "/devices/",
    data: {
      address: payload.address ?? "Unknown",
      latitude: payload.latitude ?? 0,
      longitude: payload.longitude ?? 0,
      propagate_enabled: payload.propagate_enabled ?? true,
      propagate_radius_km: payload.propagate_radius_km ?? 2.5,
      enable_notification: payload.enable_notification ?? true,
      alert_threshold_meters: payload.alert_threshold_meters ?? 100,
      update_interval_seconds: payload.update_interval_seconds ?? 60,
      active: payload.active ?? true,
      status: payload.status ?? true,
      is_online: payload.is_online ?? true,
      hid: payload.hid,
      name: payload.name,
      ...(payload.push_token ? { push_token: payload.push_token } : {}),
      ...(payload.push_platform ? { push_platform: payload.push_platform } : {}),
    },
  });
}

export async function updateDevice(
  deviceId: number | string,
  payload: Partial<UpsertDevicePayload>,
) {
  return request<DeviceRecord>({
    method: "PATCH",
    url: `/devices/${deviceId}`,
    data: payload,
  });
}

export async function deleteDevice(deviceId: number | string) {
  return request<{ success?: boolean }>({
    method: "DELETE",
    url: `/devices/${deviceId}`,
  });
}

export async function claimDeviceSession(hid?: string) {
  return request<{ released: number }>({
    method: "POST",
    url: "/devices/claim-session",
    data: hid ? { hid } : {},
  });
}

export async function sendDeviceHeartbeat(deviceId: number | string) {
  return request<{ success?: boolean }>({
    method: "POST",
    url: `/devices/${deviceId}/heartbeat`,
  });
}

export async function registerPushToken(payload: {
  token: string;
  platform: PushPlatform;
}) {
  return request<{ success?: boolean }>({
    method: "POST",
    url: "/devices/push-token",
    data: payload,
  });
}

export type PushDeliveryError = {
  phase?: string;
  ticket_id?: string;
  status?: string;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export type PushTestResult = {
  tokens?: number;
  push_sent?: number;
  push_failed?: number;
  push_no_tokens?: boolean;
  scheduled?: boolean;
  delay_seconds?: number;
  channel_id?: string;
  delivery_errors?: PushDeliveryError[];
};

/**
 * Trigger a diagnostic push to every active token registered for the
 * authenticated owner. With `delaySeconds > 0` the server schedules the send
 * after the response, so the caller can close the app and verify killed-app
 * delivery (system tray notification on Android).
 */
export async function sendTestPush(payload: {
  title?: string;
  message?: string;
  delaySeconds?: number;
} = {}) {
  return request<PushTestResult>({
    method: "POST",
    url: "/devices/push-token/test",
    data: {
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.message ? { message: payload.message } : {}),
      delay_seconds: Math.max(0, Math.min(30, payload.delaySeconds ?? 0)),
    },
  });
}
