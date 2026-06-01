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
