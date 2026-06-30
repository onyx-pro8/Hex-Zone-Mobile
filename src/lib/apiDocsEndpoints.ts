export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ParamIn = "path" | "query" | "body";

export type ParamDef = {
  name: string;
  in: ParamIn;
  type?: "string" | "number";
  required?: boolean;
  placeholder?: string;
};

export type EndpointGroup = "core" | "contract";

export type EndpointSpec = {
  id: string;
  method: HttpMethod;
  /** Path starting with /; may include {param} segments. */
  path: string;
  group: EndpointGroup;
  description: string;
  params: ParamDef[];
  /** When true, render a single JSON body textarea (value stored under "body"). */
  bodyJson?: boolean;
  /** Skip Authorization header for public endpoints (login/register/utils). */
  public?: boolean;
};

export const API_ENDPOINTS: EndpointSpec[] = [
  {
    id: "root-info",
    method: "GET",
    path: "/",
    group: "core",
    description: "Service info and docs links.",
    public: true,
    params: [],
  },
  {
    id: "health-check",
    method: "GET",
    path: "/health",
    group: "core",
    description: "Health check endpoint.",
    public: true,
    params: [],
  },
  {
    id: "utils-registration-code",
    method: "GET",
    path: "/utils/registration-code",
    group: "core",
    description:
      "Public: server issues a registration code for the create-account flow.",
    public: true,
    params: [],
  },
  {
    id: "owners-register",
    method: "POST",
    path: "/owners/register",
    group: "core",
    description: "Register owner/user account.",
    public: true,
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "owners-login",
    method: "POST",
    path: "/owners/login",
    group: "core",
    description: "Core owner login and JWT issuance.",
    public: true,
    params: [
      {
        name: "email",
        in: "body",
        required: true,
        placeholder: "owner@example.com",
      },
      {
        name: "password",
        in: "body",
        required: true,
        placeholder: "password",
      },
    ],
  },
  {
    id: "owners-me",
    method: "GET",
    path: "/owners/me",
    group: "core",
    description: "Get current authenticated owner profile.",
    params: [],
  },
  {
    id: "owners-list",
    method: "GET",
    path: "/owners/",
    group: "core",
    description: "List caller-visible owners.",
    params: [
      { name: "skip", in: "query", type: "number", placeholder: "0" },
      { name: "limit", in: "query", type: "number", placeholder: "100" },
    ],
  },
  {
    id: "owners-get-by-id",
    method: "GET",
    path: "/owners/{owner_id}",
    group: "core",
    description: "Get caller-visible owner by id.",
    params: [
      { name: "owner_id", in: "path", required: true, placeholder: "owner id" },
    ],
  },
  {
    id: "owners-patch",
    method: "PATCH",
    path: "/owners/{owner_id}",
    group: "core",
    description: "Update owner profile (self).",
    bodyJson: true,
    params: [
      { name: "owner_id", in: "path", required: true, placeholder: "owner id" },
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "owners-delete",
    method: "DELETE",
    path: "/owners/{owner_id}",
    group: "core",
    description: "Delete owner profile (self).",
    params: [
      { name: "owner_id", in: "path", required: true, placeholder: "owner id" },
    ],
  },
  {
    id: "devices-list",
    method: "GET",
    path: "/devices/",
    group: "core",
    description: "List caller-visible devices.",
    params: [],
  },
  {
    id: "devices-create",
    method: "POST",
    path: "/devices/",
    group: "core",
    description: "Create device.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "devices-get",
    method: "GET",
    path: "/devices/{device_id}",
    group: "core",
    description: "Get device by numeric id.",
    params: [
      {
        name: "device_id",
        in: "path",
        required: true,
        placeholder: "device id",
      },
    ],
  },
  {
    id: "devices-get-by-hid",
    method: "GET",
    path: "/devices/network/hid/{hid}",
    group: "core",
    description: "Get device by hardware id (HID).",
    params: [
      { name: "hid", in: "path", required: true, placeholder: "DEV-A1B2C3" },
    ],
  },
  {
    id: "devices-patch",
    method: "PATCH",
    path: "/devices/{device_id}",
    group: "core",
    description: "Update device settings.",
    bodyJson: true,
    params: [
      {
        name: "device_id",
        in: "path",
        required: true,
        placeholder: "device id",
      },
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "devices-location",
    method: "POST",
    path: "/devices/{device_id}/location",
    group: "core",
    description: "Update location and H3 cell for device.",
    params: [
      {
        name: "device_id",
        in: "path",
        required: true,
        placeholder: "device id",
      },
      {
        name: "latitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "47.6205",
      },
      {
        name: "longitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "-122.3493",
      },
      { name: "address", in: "body", placeholder: "optional address" },
    ],
  },
  {
    id: "devices-heartbeat",
    method: "POST",
    path: "/devices/{device_id}/heartbeat",
    group: "core",
    description: "Update online/last_seen presence.",
    params: [
      {
        name: "device_id",
        in: "path",
        required: true,
        placeholder: "device id",
      },
    ],
  },
  {
    id: "devices-delete",
    method: "DELETE",
    path: "/devices/{device_id}",
    group: "core",
    description: "Delete device.",
    params: [
      {
        name: "device_id",
        in: "path",
        required: true,
        placeholder: "device id",
      },
    ],
  },
  {
    id: "zones-create",
    method: "POST",
    path: "/zones/",
    group: "core",
    description: "Create zone.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "zones-list",
    method: "GET",
    path: "/zones/",
    group: "core",
    description: "List zones (supports owner_id, zone_id, skip, limit).",
    params: [
      { name: "owner_id", in: "query", placeholder: "42" },
      { name: "zone_id", in: "query", placeholder: "ZONE-7A29" },
      { name: "skip", in: "query", type: "number", placeholder: "0" },
      { name: "limit", in: "query", type: "number", placeholder: "100" },
    ],
  },
  {
    id: "zones-by-zone-id",
    method: "GET",
    path: "/zones/{zone_id}",
    group: "core",
    description: "List zones by shared zone_id visible to caller.",
    params: [
      { name: "zone_id", in: "path", required: true, placeholder: "ZONE-7A29" },
    ],
  },
  {
    id: "zones-patch",
    method: "PATCH",
    path: "/zones/{zone_id}",
    group: "core",
    description: "Update zone.",
    bodyJson: true,
    params: [
      { name: "zone_id", in: "path", required: true, placeholder: "ZONE-7A29" },
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "zones-delete",
    method: "DELETE",
    path: "/zones/{zone_id}",
    group: "core",
    description: "Delete zone.",
    params: [
      { name: "zone_id", in: "path", required: true, placeholder: "ZONE-7A29" },
    ],
  },
  {
    id: "messages-create-core",
    method: "POST",
    path: "/messages/",
    group: "core",
    description: "Create zone message (public/private).",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "messages-list-core",
    method: "GET",
    path: "/messages",
    group: "core",
    description: "Canonical messages list endpoint.",
    params: [
      { name: "owner_id", in: "query", required: true, placeholder: "42" },
      { name: "other_owner_id", in: "query", placeholder: "84" },
      { name: "skip", in: "query", type: "number", placeholder: "0" },
      { name: "limit", in: "query", type: "number", placeholder: "100" },
    ],
  },
  {
    id: "message-feature-members-location",
    method: "POST",
    path: "/message-feature/members/location",
    group: "core",
    description:
      "Refresh dynamic zone memberships for the current JWT member before geo messaging.",
    params: [
      {
        name: "latitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "34.0522",
      },
      {
        name: "longitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "-118.2437",
      },
    ],
  },
  {
    id: "message-feature-propagate",
    method: "POST",
    path: "/message-feature/messages/propagate",
    group: "core",
    description: "Send geo-aware message propagation with strict delivery accounting.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "message-feature-messages-new",
    method: "GET",
    path: "/message-feature/messages/new",
    group: "core",
    description: "Pull new message-feature messages by ISO cursor.",
    params: [
      {
        name: "since",
        in: "query",
        required: true,
        placeholder: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "message-feature-blocks-create",
    method: "POST",
    path: "/message-feature/blocks",
    group: "core",
    description: "Create access block by owner id or message type.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "message-feature-blocks-list",
    method: "GET",
    path: "/message-feature/blocks",
    group: "core",
    description: "List blocks visible to the current member context.",
    params: [],
  },
  {
    id: "message-feature-blocks-delete",
    method: "DELETE",
    path: "/message-feature/blocks/{block_id}",
    group: "core",
    description: "Delete a block entry by block id.",
    params: [
      { name: "block_id", in: "path", required: true, placeholder: "block-id" },
    ],
  },
  {
    id: "message-feature-access-schedules-create",
    method: "POST",
    path: "/message-feature/access/schedules",
    group: "core",
    description: "Create expected-guest schedule and member-assist policy.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "message-feature-access-schedules-list",
    method: "GET",
    path: "/message-feature/access/schedules",
    group: "core",
    description: "List access schedules by zone_id query.",
    params: [
      {
        name: "zone_id",
        in: "query",
        required: true,
        placeholder: "ZONE-7A29",
      },
    ],
  },
  {
    id: "message-feature-access-permission",
    method: "POST",
    path: "/message-feature/access/permission",
    group: "core",
    description: "Permission decision endpoint; payload type must be PERMISSION.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "h3-convert",
    method: "POST",
    path: "/utils/h3/convert",
    group: "core",
    description: "Convert lat/lng to H3.",
    params: [
      {
        name: "latitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "34.0522",
      },
      {
        name: "longitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "-118.2437",
      },
      {
        name: "resolution",
        in: "body",
        type: "number",
        placeholder: "13",
      },
    ],
  },
  {
    id: "qr-generate",
    method: "POST",
    path: "/utils/qr/generate",
    group: "core",
    description: "Generate member-invite QR token (Private, Private+, Exclusive, Enhanced+ administrators).",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "qr-join",
    method: "POST",
    path: "/utils/qr/join",
    group: "core",
    description: "Register via QR invite token.",
    public: true,
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "contract-login",
    method: "POST",
    path: "/login",
    group: "contract",
    description: "Contract login endpoint.",
    public: true,
    params: [
      {
        name: "email",
        in: "body",
        required: true,
        placeholder: "owner@example.com",
      },
      {
        name: "password",
        in: "body",
        required: true,
        placeholder: "password",
      },
    ],
  },
  {
    id: "contract-register",
    method: "POST",
    path: "/register",
    group: "contract",
    description: "Contract registration endpoint.",
    public: true,
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "contract-me",
    method: "GET",
    path: "/me",
    group: "contract",
    description: "Contract owner profile endpoint.",
    params: [],
  },
  {
    id: "contract-zones-list",
    method: "GET",
    path: "/zones",
    group: "contract",
    description: "Contract zones list endpoint.",
    params: [],
  },
  {
    id: "contract-zones-create",
    method: "POST",
    path: "/zones",
    group: "contract",
    description: "Contract create zone endpoint.",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "contract-zones-update",
    method: "PUT",
    path: "/zones/{zone_id}",
    group: "contract",
    description: "Contract update zone endpoint.",
    bodyJson: true,
    params: [
      { name: "zone_id", in: "path", required: true, placeholder: "ZONE-7A29" },
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "contract-zones-delete",
    method: "DELETE",
    path: "/zones/{zone_id}",
    group: "contract",
    description: "Contract delete zone endpoint.",
    params: [
      { name: "zone_id", in: "path", required: true, placeholder: "ZONE-7A29" },
    ],
  },
  {
    id: "contract-messages-create",
    method: "POST",
    path: "/messages",
    group: "contract",
    description: "Create contract message (legacy/chat payload).",
    bodyJson: true,
    params: [
      { name: "body", in: "body", required: true, placeholder: "JSON body" },
    ],
  },
  {
    id: "contract-messages-new",
    method: "GET",
    path: "/messages/new",
    group: "contract",
    description: "Get new messages since an ISO datetime cursor.",
    params: [
      {
        name: "since",
        in: "query",
        required: true,
        placeholder: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "contract-members-list",
    method: "GET",
    path: "/members",
    group: "contract",
    description: "List visible members.",
    params: [],
  },
  {
    id: "contract-members-location",
    method: "POST",
    path: "/members/location",
    group: "contract",
    description: "Upsert current member location.",
    params: [
      {
        name: "latitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "34.0522",
      },
      {
        name: "longitude",
        in: "body",
        type: "number",
        required: true,
        placeholder: "-118.2437",
      },
    ],
  },
  {
    id: "contract-devices-push-token",
    method: "POST",
    path: "/devices/push-token",
    group: "contract",
    description: "Register push token.",
    params: [
      { name: "token", in: "body", required: true, placeholder: "<push-token>" },
      { name: "platform", in: "body", required: true, placeholder: "FCM" },
    ],
  },
];

export const DEFAULT_JSON_BODY: Record<string, string> = {
  "owners-register": `{
  "email": "admin@example.com",
  "zone_id": "ZONE-7A29",
  "first_name": "Avery",
  "last_name": "Stone",
  "account_type": "private",
  "role": "administrator",
  "address": "101 Main St, Denver, CO, USA",
  "password": "strong-password-123",
  "registration_code": "FREE"
}`,
  "owners-patch": `{
  "first_name": "Alex",
  "active": true
}`,
  "devices-create": `{
  "hid": "DEV-A1B2C3",
  "name": "Front Gate Tracker",
  "address": "123 Main St, Anytown",
  "latitude": 47.6205,
  "longitude": -122.3493,
  "propagate_enabled": true,
  "propagate_radius_km": 2.5,
  "enable_notification": true,
  "alert_threshold_meters": 150.0,
  "update_interval_seconds": 120
}`,
  "devices-patch": `{
  "name": "Front Gate Tracker v2",
  "propagate_enabled": false
}`,
  "zones-create": `{
  "zone_id": "ZONE-7A29",
  "name": "Main Zone",
  "zone_type": "geofence",
  "h3_cells": ["8928308280fffff"]
}`,
  "zones-patch": `{
  "name": "Main Zone (updated)",
  "h3_cells": ["8928308280fffff", "8928308280bffff"]
}`,
  "messages-create-core": `{
  "owner_id": 42,
  "zone_id": "ZONE-7A29",
  "message": "Perimeter updated",
  "visibility": "public"
}`,
  "message-feature-propagate": `{
  "type": "PANIC",
  "hid": "DEV-A1B2C3",
  "tt": "2026-01-01T00:00:00Z",
  "msg": {
    "text": "Assistance needed"
  },
  "position": {
    "latitude": 34.0522,
    "longitude": -118.2437
  },
  "city": "Los Angeles",
  "province": "CA",
  "country": "US"
}`,
  "message-feature-blocks-create": `{
  "blocked_message_type": "PANIC"
}`,
  "message-feature-access-schedules-create": `{
  "zone_id": "ZONE-7A29",
  "guest_name": "Jordan Rivera",
  "starts_at": "2026-01-01T00:00:00Z",
  "ends_at": "2026-01-01T04:00:00Z",
  "notify_member_assist": true
}`,
  "message-feature-access-permission": `{
  "type": "PERMISSION",
  "hid": "DEV-A1B2C3",
  "msg": {
    "guest_name": "Jordan Rivera"
  },
  "position": {
    "latitude": 34.0522,
    "longitude": -118.2437
  }
}`,
  "qr-generate": `{
  "zone_id": "ZONE-7A29",
  "expires_in_seconds": 900
}`,
  "qr-join": `{
  "token": "<invite-token>",
  "email": "new.user@example.com",
  "password": "strong-password-123",
  "first_name": "Sam",
  "last_name": "Rivera"
}`,
  "contract-register": `{
  "name": "Alex Chen",
  "email": "alex@geozone.io",
  "password": "strong-password-123",
  "accountType": "PRIVATE",
  "registrationType": "ADMINISTRATOR",
  "zoneId": "ZONE-7A29",
  "address": "101 Main St, Denver, CO, USA",
  "registrationCode": "FREE"
}`,
  "contract-zones-create": `{
  "zone_id": "ZONE-7A29",
  "name": "Contract Zone",
  "zone_type": "geofence",
  "h3_cells": ["8928308280fffff"]
}`,
  "contract-zones-update": `{
  "name": "Contract Zone (updated)",
  "h3_cells": ["8928308280fffff", "8928308280bffff"]
}`,
  "contract-messages-create": `{
  "zone_id": "ZONE-7A29",
  "message": "Hello from contract route",
  "visibility": "public"
}`,
};

export function buildResolvedPath(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = values[key]?.trim();
    return v != null && v !== "" ? encodeURIComponent(v) : `{${key}}`;
  });
}

export function buildEndpointUrl(
  baseUrl: string,
  ep: EndpointSpec,
  values: Record<string, string>,
): string {
  const resolved = buildResolvedPath(ep.path, values);
  const trimmedBase = baseUrl.replace(/\/$/, "");
  const url = `${trimmedBase}${resolved}`;
  const queryParts: string[] = [];
  for (const p of ep.params) {
    if (p.in !== "query") continue;
    const v = values[p.name]?.trim();
    if (!v) continue;
    queryParts.push(
      `${encodeURIComponent(p.name)}=${encodeURIComponent(v)}`,
    );
  }
  return queryParts.length ? `${url}?${queryParts.join("&")}` : url;
}

export function buildEndpointBody(
  ep: EndpointSpec,
  values: Record<string, string>,
): Record<string, unknown> | null {
  if (ep.bodyJson) {
    const raw = values.body?.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  const bodyParams = ep.params.filter((p) => p.in === "body");
  if (bodyParams.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const p of bodyParams) {
    const v = values[p.name]?.trim();
    if (!v) continue;
    if (p.type === "number") {
      const n = Number(v);
      if (!Number.isNaN(n)) out[p.name] = n;
    } else {
      out[p.name] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function buildCurlCommand(
  baseUrl: string,
  ep: EndpointSpec,
  values: Record<string, string>,
  hasToken: boolean,
): string {
  const url = buildEndpointUrl(baseUrl, ep, values);
  const lines: string[] = [`curl -X ${ep.method} "${url}" \\`];
  if (!ep.public && hasToken) {
    lines.push(`  -H "Authorization: Bearer <token>" \\`);
  }
  const body = buildEndpointBody(ep, values);
  const hasBody = body && ep.method !== "GET";
  if (hasBody) {
    lines.push(`  -H "Content-Type: application/json" \\`);
    const escaped = JSON.stringify(body)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
    lines.push(`  -d "${escaped}"`);
  } else {
    lines.push(`  -H "Content-Type: application/json"`);
  }
  return lines.join("\n");
}
