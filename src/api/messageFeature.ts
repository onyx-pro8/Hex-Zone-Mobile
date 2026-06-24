import { request } from "./client";
import type { MessageFeaturePropagationResponse } from "./messages";
import type { MessageType } from "@/lib/messageTypes";

export type MessageFeatureType = MessageType;

export type MessageFeaturePosition = {
  latitude: number;
  longitude: number;
};

export type MessageFeaturePayload = {
  type: MessageFeatureType;
  hid: string;
  tt?: string;
  msg: Record<string, unknown>;
  position: MessageFeaturePosition;
  city?: string;
  province?: string;
  country?: string;
  to?: string;
  co?: string;
  receiver_owner_id?: number;
};

export type MessageFeatureBlock = {
  id: string | number;
  blocked_owner_id?: number;
  blocked_message_type?: MessageFeatureType;
  created_at?: string;
};

export async function propagateMessageFeatureMessage(payload: MessageFeaturePayload) {
  return request<MessageFeaturePropagationResponse>({
    method: "POST",
    url: "/message-feature/messages/propagate",
    data: payload,
  });
}

export type WellnessAcknowledgement = {
  id: string;
  owner_id: number;
  status: string;
  note?: string | null;
  created_at: string;
};

export type WellnessAckSummary = {
  message_event_id: string;
  expected_recipient_ids: number[];
  pending_recipient_ids: number[];
  acknowledgements: WellnessAcknowledgement[];
  response_tracking_enabled: boolean;
  acknowledgement?: WellnessAcknowledgement;
};

export async function listWellnessAcknowledgements(messageEventId: string) {
  return request<WellnessAckSummary>({
    method: "GET",
    url: `/message-feature/messages/${encodeURIComponent(messageEventId)}/wellness-acks`,
  });
}

export async function acknowledgeWellnessCheck(
  messageEventId: string,
  payload: { status?: "ok" | "need_help"; note?: string } = {},
) {
  return request<WellnessAckSummary>({
    method: "POST",
    url: `/message-feature/messages/${encodeURIComponent(messageEventId)}/wellness-ack`,
    data: payload,
  });
}

export async function listMessageFeatureBlocks() {
  return request<MessageFeatureBlock[]>({
    method: "GET",
    url: "/message-feature/blocks",
  });
}

export async function refreshMessageFeatureMembershipLocation(
  payload: MessageFeaturePosition,
) {
  return request<{ zone_ids: string[] }>({
    method: "POST",
    url: "/message-feature/members/location",
    data: payload,
  });
}

export type InZoneMember = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  zone_id: string | null;
};

export type InZoneMembersResponse = {
  zone_ids: string[];
  members: InZoneMember[];
};

/** Members currently located inside the caller's zone(s). */
export async function listInZoneMembers(position?: MessageFeaturePosition) {
  return request<InZoneMembersResponse>({
    method: "GET",
    url: "/message-feature/members/in-zone",
    params: position
      ? { latitude: position.latitude, longitude: position.longitude }
      : undefined,
  });
}

export type PrivateSearchMember = {
  id: number;
  display_name: string;
  broadcast_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  zone_id: string | null;
  subtitle: string;
};

export type PrivateSearchMembersResponse = {
  zone_ids: string[];
  members: PrivateSearchMember[];
};

export async function searchPrivateMessageRecipients(
  query: string,
  position?: MessageFeaturePosition,
) {
  const q = query.trim();
  if (q.length < 2) {
    return {
      data: { zone_ids: [] as string[], members: [] as PrivateSearchMember[] },
      error: null as string | null,
      loading: false,
    };
  }
  return request<PrivateSearchMembersResponse>({
    method: "GET",
    url: "/message-feature/members/search",
    params: {
      q,
      ...(position
        ? { latitude: position.latitude, longitude: position.longitude }
        : {}),
    },
  });
}

export type EmergencyEvent = {
  id: string;
  messageEventId: string | null;
  type: string;
  senderId: number | null;
  zoneId: string | null;
  recipientCount: number;
  latitude: number | null;
  longitude: number | null;
  text: string | null;
  createdAt: string;
};

export async function listEmergencyEvents(params?: {
  limit?: number;
  skip?: number;
  type?: "PANIC" | "NS_PANIC";
}) {
  return request<EmergencyEvent[]>({
    method: "GET",
    url: "/message-feature/emergency-events",
    params: {
      limit: params?.limit ?? 100,
      skip: params?.skip ?? 0,
      ...(params?.type ? { type: params.type } : {}),
    },
  });
}

export type PrivateThreadMessage = {
  id: string;
  type: string;
  senderId: number | null;
  receiverId: number | null;
  text: string | null;
  body: Record<string, unknown> | null;
  createdAt: string;
};

export async function getPrivateThread(otherOwnerId: number, limit = 100) {
  return request<PrivateThreadMessage[]>({
    method: "GET",
    url: "/message-feature/messages/private-thread",
    params: { other_owner_id: otherOwnerId, limit },
  });
}
