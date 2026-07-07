/**
 * Zone guest-arrival copy settings (admin-configurable).
 *
 * Mirrors the web client's `services/api/guestArrivalMessages.ts`:
 *   GET   /api/access/zones/{zone_id}/guest-arrival-messages
 *   PATCH /api/access/zones/{zone_id}/guest-arrival-messages
 *
 * These are the two phrases a guest sees on arrival:
 *   - expected_arrival_message   → scheduled guest ("You are expected…")
 *   - unexpected_arrival_message → walk-in guest ("Waiting for approval…")
 *
 * `null` clears an override (reverts to the server default for NEW arrivals).
 * Edits never change in-flight sessions (the server snapshots the copy at
 * arrival time).
 */
import { apiClient } from "./client";

const PATH_TEMPLATE = "/api/access/zones/{zone_id}/guest-arrival-messages";

export const GUEST_ARRIVAL_FALLBACK_DEFAULTS = {
  expected_arrival_message: "You are expected. Please proceed.",
  unexpected_arrival_message:
    "You are not scheduled. Please wait for approval.",
  guest_pass_verified_message: "Your guest pass was verified. Please proceed.",
} as const;

export const GUEST_ARRIVAL_MESSAGE_MAX_LEN = 500;

export type GuestArrivalMessagesDefaults = {
  expected_arrival_message: string;
  unexpected_arrival_message: string;
  guest_pass_verified_message?: string;
};

export type GuestArrivalMessages = {
  zone_id: string;
  expected_arrival_message: string | null;
  unexpected_arrival_message: string | null;
  guest_pass_verified_message?: string | null;
  defaults: GuestArrivalMessagesDefaults;
  supports_guest_pass_verified_message: boolean;
};

export type GuestArrivalMessagesUpdate = {
  expected_arrival_message?: string | null;
  unexpected_arrival_message?: string | null;
  guest_pass_verified_message?: string | null;
};

export type GuestArrivalMessagesResult =
  | { ok: true; status: number; data: GuestArrivalMessages }
  | { ok: false; status: number; message: string };

function buildPath(zoneId: string): string {
  return PATH_TEMPLATE.replace(/\{zone_id\}/gi, encodeURIComponent(zoneId.trim()));
}

function unwrapEnvelope(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as { status?: string }).status === "success" &&
    "data" in raw
  ) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** First present key: explicit null OR blank string → null; missing → null. */
function readOverride(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const v = record[key];
    if (v === null) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t.length > 0 ? t : null;
    }
    return null;
  }
  return null;
}

function errorFromBody(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    const detail = row.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object") {
      const msg = (detail[0] as { msg?: string }).msg;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    const msg = readString(row, ["message", "error"]);
    if (msg) return msg;
  }
  return status === 404
    ? "Guest arrival messages are not available for this zone yet."
    : `Request failed (${status}).`;
}

function normalize(body: unknown): GuestArrivalMessages | null {
  const inner = unwrapEnvelope(body);
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;
  const row = inner as Record<string, unknown>;

  const defaultsRaw =
    row.defaults && typeof row.defaults === "object" && !Array.isArray(row.defaults)
      ? (row.defaults as Record<string, unknown>)
      : null;

  const hasGuestPassKey =
    Object.prototype.hasOwnProperty.call(row, "guest_pass_verified_message") ||
    (defaultsRaw != null &&
      Object.prototype.hasOwnProperty.call(
        defaultsRaw,
        "guest_pass_verified_message",
      ));

  const defaults: GuestArrivalMessagesDefaults = {
    expected_arrival_message:
      readString(defaultsRaw ?? {}, [
        "expected_arrival_message",
        "expectedArrivalMessage",
      ]) ?? GUEST_ARRIVAL_FALLBACK_DEFAULTS.expected_arrival_message,
    unexpected_arrival_message:
      readString(defaultsRaw ?? {}, [
        "unexpected_arrival_message",
        "unexpectedArrivalMessage",
      ]) ?? GUEST_ARRIVAL_FALLBACK_DEFAULTS.unexpected_arrival_message,
    ...(hasGuestPassKey
      ? {
          guest_pass_verified_message:
            readString(defaultsRaw ?? {}, [
              "guest_pass_verified_message",
              "guestPassVerifiedMessage",
            ]) ?? GUEST_ARRIVAL_FALLBACK_DEFAULTS.guest_pass_verified_message,
        }
      : {}),
  };

  return {
    zone_id:
      readString(row, ["zone_id", "zoneId"]) ?? readString(row, ["id"]) ?? "",
    expected_arrival_message: readOverride(row, [
      "expected_arrival_message",
      "expectedArrivalMessage",
    ]),
    unexpected_arrival_message: readOverride(row, [
      "unexpected_arrival_message",
      "unexpectedArrivalMessage",
    ]),
    ...(hasGuestPassKey
      ? {
          guest_pass_verified_message: readOverride(row, [
            "guest_pass_verified_message",
            "guestPassVerifiedMessage",
          ]),
        }
      : {}),
    defaults,
    supports_guest_pass_verified_message: hasGuestPassKey,
  };
}

export async function getGuestArrivalMessages(
  zoneId: string,
): Promise<GuestArrivalMessagesResult> {
  const z = zoneId.trim();
  if (!z) return { ok: false, status: 400, message: "Missing network id." };
  try {
    const res = await apiClient.get<unknown>(buildPath(z), {
      validateStatus: () => true,
    });
    if (res.status === 200) {
      const parsed = normalize(res.data);
      if (!parsed) {
        return {
          ok: false,
          status: 500,
          message: "Unexpected response from server.",
        };
      }
      return { ok: true, status: 200, data: parsed };
    }
    return {
      ok: false,
      status: res.status,
      message: errorFromBody(res.status, res.data),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/** Trim; empty → null. Throws when over the max length. */
export function normalizeGuestArrivalMessageField(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (t.length > GUEST_ARRIVAL_MESSAGE_MAX_LEN) {
    throw new Error(
      `Messages must be at most ${GUEST_ARRIVAL_MESSAGE_MAX_LEN} characters.`,
    );
  }
  return t;
}

export async function updateGuestArrivalMessages(
  zoneId: string,
  payload: GuestArrivalMessagesUpdate,
): Promise<GuestArrivalMessagesResult> {
  const z = zoneId.trim();
  if (!z) return { ok: false, status: 400, message: "Missing network id." };
  try {
    const res = await apiClient.request<unknown>({
      method: "patch",
      url: buildPath(z),
      data: payload,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300) {
      const parsed = normalize(res.data);
      if (!parsed) {
        return {
          ok: false,
          status: 500,
          message: "Unexpected response from server.",
        };
      }
      return { ok: true, status: res.status, data: parsed };
    }
    return {
      ok: false,
      status: res.status,
      message: errorFromBody(res.status, res.data),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}
