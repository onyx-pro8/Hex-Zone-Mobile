import { request } from "./client";
import type { AppSettings } from "@/lib/appSettings";

/**
 * Remote persistence for the owner's application settings (broadcast identity,
 * single-line home address, smart-home integration, quick-alert
 * messages). The backend returns the same camelCase shape as {@link AppSettings},
 * with `quickMessages` possibly partial — callers should merge with local
 * defaults via `updateAppSettings`.
 */

export type RemoteAppSettings = {
  broadcastName?: string;
  address?: string;
  sharedNotification?: Partial<AppSettings["sharedNotification"]>;
  smartHomeDevices?: Array<{ hid: string; name?: string; active?: boolean }>;
  quickMessages?: Partial<AppSettings["quickMessages"]>;
  memberJoinWelcome?: string;
};

export async function getRemoteAppSettings() {
  return request<RemoteAppSettings>({ method: "GET", url: "/me/settings" });
}

export async function updateRemoteAppSettings(payload: AppSettings) {
  return request<RemoteAppSettings>({
    method: "PUT",
    url: "/me/settings",
    data: payload,
  });
}

/** Upload a profile photo (data URL / base64). Server compresses and stores it. */
export async function uploadProfileAvatar(imageDataUrl: string) {
  return request<{ avatar_url: string }>({
    method: "POST",
    url: "/me/avatar",
    data: { image: imageDataUrl },
    timeout: 60000,
  });
}

/** Upload a chat photo (data URL / base64). Does not change the profile avatar. */
export async function uploadMessageImage(imageDataUrl: string) {
  return request<{ url: string }>({
    method: "POST",
    url: "/me/media",
    data: { image: imageDataUrl },
    timeout: 60000,
  });
}
