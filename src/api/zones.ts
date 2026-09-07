import { request } from "./client";

export type ZoneType =
  | "geofence"
  | "grid"
  | "proximity"
  | "dynamic"
  | "communal_id"
  | "government_local_code"
  | "object";

export type SavedZone = {
  id: string | number;
  zone_id?: string | number;
  name?: string;
  type?: string;
  zone_type?: string;
  owner_id?: string | number;
  creator_id?: string | number;
  /** Display name for the zone creator/owner (preferred). */
  owner_name?: string | null;
  /** True for account-visible primary zones; false for creator-only secondary. */
  is_primary?: boolean;
  geometry?: Record<string, unknown>;
  config?: Record<string, unknown>;
  h3_cells?: string[];
  geo_fence_polygon?: unknown;
  created_at?: string;
  updated_at?: string;
  /** Present on create when member secondaries were auto-removed. */
  evicted_zones?: {
    id: number;
    name: string;
    creator_id: number;
    zone_id?: string;
  }[];
};

export type CreateZonePayload = {
  name: string;
  description?: string;
  type: string;
  zone_type?: string;
  /**
   * Shared zone identifier for this owner's account namespace (e.g.
   * `ZONE-1234`). Sent both as `id` (legacy contract route at `POST /zones`)
   * and `zone_id` (canonical route at `POST /zones/`). If omitted, the server
   * falls back to the caller's `owners.zone_id`.
   */
  id?: string;
  zone_id?: string;
  geometry?: Record<string, unknown>;
  config?: Record<string, unknown>;
  h3_cells?: string[];
  geo_fence_polygon?: Record<string, unknown> | null;
  /** Administrators may choose primary vs secondary when both slots remain. */
  is_primary?: boolean;
};

export type UpdateZonePayload = Partial<CreateZonePayload>;

export async function getZones(zoneId?: string) {
  const z = zoneId?.trim();
  return request<SavedZone[]>({
    method: "GET",
    url: z ? `/zones?zone_id=${encodeURIComponent(z)}` : "/zones",
  });
}

export type ZoneCapabilities = {
  can_create_zone: boolean;
  can_edit_active_zone?: boolean;
  remaining_total?: number;
  remaining_for_role?: number;
  remaining_for_current_user_role?: number;
  role?: string;
  reason?: string;
  max_total?: number;
  max_primary?: number;
  admin_primary_count?: number;
  next_zone_is_primary?: boolean;
  member_secondary_limit?: number;
  reserved_for_standard_users?: number;
  can_create_primary?: boolean;
  can_create_secondary?: boolean;
};

export async function getZoneCapabilities() {
  return request<ZoneCapabilities>({
    method: "GET",
    url: "/zones/capabilities",
  });
}

export async function createZone(payload: CreateZonePayload) {
  return request<SavedZone>({ method: "POST", url: "/zones", data: payload });
}

export async function updateZone(id: string | number, payload: UpdateZonePayload) {
  return request<SavedZone>({
    method: "PUT",
    url: `/zones/${id}`,
    data: payload,
  });
}

/** Delete a saved zone by DB record id (`zone.id`). */
export async function deleteZone(id: string | number) {
  return request<null>({
    method: "DELETE",
    url: `/zones/${id}`,
  });
}

export type DynamicZonePreviewPayload = {
  target_user_count: number;
  min_radius_meters: number;
  max_radius_meters: number;
  include_self?: boolean;
};

export type DynamicZonePreviewResult = {
  infeasible: boolean;
  reason: string | null;
  center: { latitude: number; longitude: number } | null;
  resolved_radius_meters: number | null;
  tight_radius_meters: number | null;
  matched_user_count: number;
  matched_owner_ids: number[];
  population_size: number;
  target_user_count: number;
  min_radius_meters: number;
  max_radius_meters: number;
};

export async function previewDynamicZone(payload: DynamicZonePreviewPayload) {
  return request<DynamicZonePreviewResult>({
    method: "POST",
    url: "/zones/dynamic/preview",
    data: payload,
  });
}

export type CommunalZoneSummary = {
  id: number;
  zone_id: string;
  name: string;
  type: string;
  owner_id: number;
  owner_name?: string | null;
  communal_id?: string | null;
  is_public?: boolean;
};

export type ZoneReferenceValidateResult = {
  valid: boolean;
  zone_type: string;
  reference_id: string;
  display_name?: string | null;
  geometry: Record<string, unknown>;
  config: Record<string, unknown>;
  h3_cells: string[];
  source?: string | null;
  message?: string | null;
  exists?: boolean | null;
  zones?: CommunalZoneSummary[];
};

export type GovernmentAddressMode = "postal" | "street";

export type ZoneReferenceValidatePayload =
  | { zone_type: "communal_id"; reference_id: string }
  | {
      zone_type: "government_local_code";
      reference_id?: string;
      address_mode?: GovernmentAddressMode;
      postal_code?: string;
      city?: string;
      country?: string;
      street?: string;
      street_number?: string;
    };

export async function validateZoneReference(
  payload: ZoneReferenceValidatePayload,
) {
  return request<ZoneReferenceValidateResult>({
    method: "POST",
    url: "/zones/validate-reference",
    data: payload,
  });
}

export async function generateZoneReference(
  zoneType: "communal_id" = "communal_id",
) {
  return request<ZoneReferenceValidateResult>({
    method: "POST",
    url: "/zones/generate-reference",
    data: { zone_type: zoneType },
  });
}

export async function listPublicZones(params?: {
  skip?: number;
  limit?: number;
}) {
  return request<SavedZone[]>({
    method: "GET",
    url: "/zones/public",
    params: {
      skip: params?.skip ?? 0,
      limit: params?.limit ?? 200,
    },
  });
}

export async function assignCommunalId(payload: {
  communal_id: string;
  zone_ids: number[];
  is_public?: boolean;
}) {
  return request<{
    communal_id: string;
    updated: SavedZone[];
    message: string;
  }>({
    method: "POST",
    url: "/zones/assign-communal",
    data: payload,
  });
}
