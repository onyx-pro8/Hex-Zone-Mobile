import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Image,
  Linking,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import { Chip } from "@/components/ui/Chip";
import { initialsForUser } from "@/components/ui/ProfileAvatarButton";
import type { Message } from "@/api/messages";
import { guestInboxPresenceId } from "@/lib/messageBroadcast";
import { MessageImageGallery } from "@/components/messages/MessageImageGallery";
import { toMessageTypeLabel } from "@/lib/messageTypes";
import {
  formatMessageCoordinatesLabel,
  messageCoordinatesMapsUrl,
} from "@/lib/messageCoordinates";
import { messageZoneLabel, type ZoneNameLookup } from "@/lib/messageZoneLabel";
import { useResolvedAvatarUri } from "@/lib/resolveAvatarUri";
import {
  isServiceMessageType,
  isUnknownMessageType,
  SERVICE_MESSAGE_UI,
  UNKNOWN_MESSAGE_UI,
} from "@/lib/messageWorkflow";
import { colors } from "@/theme/colors";

type ChipTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "critical"
  | "service"
  | "muted";

export type InboxMessageCardProps = {
  item: Message;
  /** Display name shown in the header (broadcast / sender). */
  userName: string;
  /**
   * Real account name for avatar initials when there is no photo.
   * Falls back to `userName` unless that label is the own-message "ME".
   */
  avatarName?: string | null;
  /** Optional email used when `avatarName` is empty. */
  avatarEmail?: string | null;
  /** Sender profile image URL when available. */
  avatarUrl?: string | null;
  /** Live online presence for the sender (green/red avatar dot). */
  online?: boolean | null;
  selfOwnerId?: number | null;
  zoneNames?: ZoneNameLookup;
  highlighted?: boolean;
  /** Extra content below the footer (wellness ack, private thread, etc.). */
  footerExtra?: ReactNode;
  /** Day heading shown above this bubble when the calendar day changes. */
  dayLabel?: string | null;
  /** Consecutive same-sender stack: header on start, badges on end. */
  cluster?: InboxBubbleCluster;
  /** Shared width for stacked same-sender bubbles. */
  clusterMinWidth?: number;
  /** Report natural bubble width so a cluster can match the widest member. */
  onBubbleWidth?: (width: number) => void;
  style?: ViewStyle;
};

export type InboxBubbleCluster = "single" | "start" | "middle" | "end";

const CLUSTER_WINDOW_MS = 5 * 60 * 1000;

export function inboxSenderKey(item: Pick<Message, "sender_id" | "guest_sender_id" | "guest_id" | "id">): string {
  const guest = guestInboxPresenceId(item);
  if (guest) return `guest:${guest}`;
  if (typeof item.sender_id === "number") return `owner:${item.sender_id}`;
  return `row:${item.id}`;
}

export function messagesFormCluster(
  a: Pick<Message, "sender_id" | "guest_sender_id" | "guest_id" | "id" | "created_at" | "type"> | undefined,
  b: Pick<Message, "sender_id" | "guest_sender_id" | "guest_id" | "id" | "created_at" | "type"> | undefined,
): boolean {
  if (!a || !b) return false;
  const aSys = isSystemNoticeType(a.type);
  const bSys = isSystemNoticeType(b.type);
  // System notices never stack with chat bubbles (or each other).
  if (aSys || bSys) return false;
  if (inboxSenderKey(a) !== inboxSenderKey(b)) return false;
  if (inboxDayKey(a.created_at) !== inboxDayKey(b.created_at)) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= CLUSTER_WINDOW_MS;
}

function isSystemNoticeType(type: string | null | undefined): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "PERMISSION" || t === "SERVICE";
}

export function inboxBubbleCluster(
  prev: Message | undefined,
  item: Message,
  next: Message | undefined,
): InboxBubbleCluster {
  const withPrev = messagesFormCluster(prev, item);
  const withNext = messagesFormCluster(item, next);
  if (withPrev && withNext) return "middle";
  if (withPrev) return "end";
  if (withNext) return "start";
  return "single";
}

/** Id of the first message in a consecutive same-sender cluster. */
export function inboxClusterRootId(list: Message[], index: number): string {
  let i = index;
  while (i > 0 && messagesFormCluster(list[i - 1], list[i])) i -= 1;
  return list[i]?.id ?? String(index);
}

/** Shared width for consecutive same-sender bubbles (widest member wins). */
export function useInboxClusterWidths(): {
  clusterWidths: Record<string, number>;
  reportClusterWidth: (clusterId: string, width: number) => void;
} {
  const [clusterWidths, setClusterWidths] = useState<Record<string, number>>({});
  const reportClusterWidth = useCallback((clusterId: string, width: number) => {
    setClusterWidths((prev) => {
      if ((prev[clusterId] ?? 0) >= width) return prev;
      return { ...prev, [clusterId]: width };
    });
  }, []);
  return { clusterWidths, reportClusterWidth };
}

export function formatBubbleHeaderDate(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return value;
  return t.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBubbleTime(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return value;
  return t.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function inboxDayKey(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return "";
  return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
}

export function formatInboxDayLabel(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return "";
  const diffDays = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(t)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return t.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function SenderAvatar({
  name,
  email,
  avatarUrl,
  online = false,
  dotOnRight = false,
}: {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  online?: boolean;
  dotOnRight?: boolean;
}) {
  const initials = initialsForUser(name, email);
  const displayUri = useResolvedAvatarUri(avatarUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage =
    !imageFailed &&
    typeof displayUri === "string" &&
    displayUri.trim().length > 0;

  useEffect(() => {
    setImageFailed(false);
  }, [displayUri]);

  return (
    <View style={{ width: 32, height: 32 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: "#C8DFFF",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {hasImage ? (
          <Image
            source={{ uri: displayUri!.trim() }}
            style={{ width: 32, height: 32, borderRadius: 16 }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text
            style={{
              color: colors.accentDeep,
              fontWeight: "800",
              fontSize: 11,
              letterSpacing: 0.2,
            }}
          >
            {initials}
          </Text>
        )}
      </View>
      <View
        style={{
          position: "absolute",
          left: dotOnRight ? undefined : 0,
          right: dotOnRight ? 0 : undefined,
          bottom: 0,
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: online ? "#22C55E" : "#EF4444",
          borderWidth: 2,
          borderColor: "#fff",
        }}
        accessibilityLabel={online ? "Online" : "Offline"}
      />
    </View>
  );
}

function typeTone(item: Message): ChipTone {
  if (isUnknownMessageType(item.type)) return "critical";
  if (isServiceMessageType(item.type)) return "service";
  if (item.category === "Alarm") return "danger";
  if (item.category === "Access") return "warning";
  return "default";
}

export function InboxMessageCard({
  item,
  userName,
  avatarName = null,
  avatarEmail = null,
  avatarUrl = null,
  online = false,
  selfOwnerId = null,
  zoneNames,
  highlighted = false,
  footerExtra,
  dayLabel = null,
  cluster = "single",
  clusterMinWidth,
  onBubbleWidth,
  style,
}: InboxMessageCardProps) {
  const isUnknown = isUnknownMessageType(item.type);
  const isService = isServiceMessageType(item.type);
  const isPermission = String(item.type).toUpperCase() === "PERMISSION";
  const isMine =
    selfOwnerId != null &&
    typeof item.sender_id === "number" &&
    item.sender_id > 0 &&
    item.sender_id === selfOwnerId;
  const useAccentBubble =
    isMine && !isPermission && !isUnknown && !isService && item.category !== "Alarm";
  const mapsUrl = messageCoordinatesMapsUrl(item);
  const locationLabel = formatMessageCoordinatesLabel(item);
  const zoneLabel = messageZoneLabel(item, {
    viewerOwnerId: selfOwnerId,
    zoneNames,
  });
  const createdAt = formatBubbleTime(item.created_at);
  const tone = typeTone(item);
  const showHeader = cluster === "single" || cluster === "start";
  const showBadges = cluster === "single" || cluster === "end";
  const inCluster = cluster !== "single";
  const radiusTop = showHeader ? 16 : 4;
  const radiusBottom = showBadges ? 16 : 4;

  const onBubbleLayout = (e: LayoutChangeEvent) => {
    if (!onBubbleWidth || !inCluster) return;
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (Number.isFinite(w) && w > 0) onBubbleWidth(w);
  };

  const titleColor = useAccentBubble
    ? "#FFFFFF"
    : isUnknown
      ? UNKNOWN_MESSAGE_UI.title
      : isService
        ? SERVICE_MESSAGE_UI.title
        : colors.text;
  const bodyColor = useAccentBubble
    ? "#FFFFFF"
    : isUnknown
      ? UNKNOWN_MESSAGE_UI.body
      : isService
        ? SERVICE_MESSAGE_UI.body
        : colors.text;
  const metaColor = useAccentBubble ? "rgba(255,255,255,0.75)" : colors.textDim;

  const bubbleBg = useAccentBubble
    ? colors.accent
    : isUnknown
      ? UNKNOWN_MESSAGE_UI.surface
      : isService
        ? SERVICE_MESSAGE_UI.surface
        : isPermission
          ? "rgba(245,180,80,0.08)"
          : colors.bgCard;
  const bubbleBorder = highlighted
    ? colors.accent
    : useAccentBubble
      ? colors.accent
      : isUnknown
        ? UNKNOWN_MESSAGE_UI.border
        : isService
          ? SERVICE_MESSAGE_UI.border
          : isPermission
            ? colors.warning
            : colors.borderStrong;

  const avatar = (
    <SenderAvatar
      name={
        (avatarName ?? "").trim() ||
        (userName.trim().toUpperCase() === "ME" ? "" : userName)
      }
      email={avatarEmail}
      avatarUrl={avatarUrl}
      online={!!online}
      dotOnRight={isMine}
    />
  );

  const identity = (
    <View>
      <Text
        style={{
          color: titleColor,
          fontSize: 13,
          fontWeight: "800",
          textAlign: isMine ? "right" : "left",
        }}
        numberOfLines={1}
      >
        {userName}
      </Text>
      <Text
        style={{
          color: metaColor,
          fontSize: 10,
          marginTop: 1,
          textAlign: isMine ? "right" : "left",
        }}
        numberOfLines={2}
      >
        {zoneLabel}
      </Text>
    </View>
  );

  const isSystemNotice = isService || isPermission;
  const systemTitleColor = isService ? SERVICE_MESSAGE_UI.title : colors.warning;
  const systemBodyColor = isService ? SERVICE_MESSAGE_UI.body : colors.warning;
  const systemMetaColor = isService ? "#4CAF50" : "#C48A2A";

  if (isSystemNotice) {
    return (
      <View style={[{ marginBottom: 8 }, style]}>
        {dayLabel ? (
          <Text
            style={{
              color: colors.textDim,
              fontSize: 11,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
              marginTop: 4,
            }}
          >
            {dayLabel}
          </Text>
        ) : null}
        <View style={{ width: "100%", paddingHorizontal: 4 }}>
          <View
            collapsable={false}
            style={{
              width: "100%",
              borderWidth: 1,
              borderTopWidth: 1,
              borderRightWidth: 1,
              borderBottomWidth: 1,
              borderLeftWidth: 1,
              borderColor: isService ? SERVICE_MESSAGE_UI.border : colors.warning,
              backgroundColor: bubbleBg,
              borderRadius: 16,
              overflow: "hidden",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View style={{ gap: 2 }}>
              {item.subject ? (
                <Text
                  style={{
                    color: systemTitleColor,
                    fontSize: 14,
                    fontWeight: "800",
                    lineHeight: 20,
                    textAlign: "center",
                  }}
                >
                  {item.subject}
                </Text>
              ) : null}
              {item.message && item.message !== item.subject ? (
                <Text
                  style={{
                    color: systemBodyColor,
                    fontSize: 13,
                    fontWeight: "600",
                    lineHeight: 18,
                    textAlign: "center",
                  }}
                >
                  {item.message}
                </Text>
              ) : !item.subject ? (
                <Text
                  style={{
                    color: systemBodyColor,
                    fontSize: 13,
                    fontWeight: "600",
                    lineHeight: 18,
                    textAlign: "center",
                  }}
                >
                  {item.message || "—"}
                </Text>
              ) : null}
              {item.images?.length ? (
                <MessageImageGallery uris={item.images} />
              ) : null}
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 1,
                }}
              >
                <Chip label={toMessageTypeLabel(item.type)} tone={tone} size="sm" />
                <Chip label={zoneLabel} tone="muted" size="sm" />
              </View>
              {createdAt ? (
                <Text
                  style={{
                    color: systemMetaColor,
                    fontSize: 10,
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                >
                  {createdAt}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        {footerExtra ? (
          <View style={{ marginTop: 6, alignSelf: "center" }}>{footerExtra}</View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          // Pull stacked same-sender bubbles flush (borders nearly touch).
          marginBottom: cluster === "end" || cluster === "single" ? 4 : -2,
        },
        style,
      ]}
    >
      {dayLabel ? (
        <Text
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 8,
            marginTop: 4,
          }}
        >
          {dayLabel}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: isMine ? "flex-end" : "flex-start",
          width: "100%",
        }}
      >
        <View
          collapsable={false}
          onLayout={onBubbleLayout}
          style={{
            alignSelf: "flex-start",
            maxWidth: "80%",
            ...(inCluster && clusterMinWidth ? { minWidth: clusterMinWidth } : null),
            borderWidth: 1,
            borderTopWidth: 1,
            borderRightWidth: 1,
            borderBottomWidth: 1,
            borderLeftWidth: 1,
            borderColor: bubbleBorder,
            backgroundColor: bubbleBg,
            borderTopLeftRadius: radiusTop,
            borderTopRightRadius: radiusTop,
            borderBottomLeftRadius: radiusBottom,
            borderBottomRightRadius: radiusBottom,
            overflow: "hidden",
            paddingHorizontal: 12,
            paddingTop: showHeader ? 10 : 6,
            paddingBottom: showBadges ? 10 : 6,
          }}
        >
            {showHeader ? (
            <View
              style={{
                flexDirection: isMine ? "row-reverse" : "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: isMine ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  flexShrink: 1,
                }}
              >
                {avatar}
                {identity}
              </View>
              {createdAt ? (
                <Text
                  style={{
                    color: metaColor,
                    fontSize: 10,
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                  numberOfLines={1}
                >
                  {createdAt}
                </Text>
              ) : null}
            </View>
            ) : null}

            <View style={{ marginTop: showHeader ? 6 : 0, gap: 2 }}>
              {item.subject ? (
                <Text
                  style={{
                    color: titleColor,
                    fontSize: isUnknown || isService ? 15 : 14,
                    fontWeight: "800",
                    lineHeight: 20,
                  }}
                >
                  {item.subject}
                </Text>
              ) : null}
              {item.message && item.message !== item.subject ? (
                <Text
                  style={{
                    color: bodyColor,
                    fontSize: isUnknown || isService ? 14 : 13,
                    fontWeight: isUnknown || isService ? "700" : "500",
                    lineHeight: 18,
                  }}
                >
                  {item.message}
                </Text>
              ) : !item.subject && (item.message || !item.images?.length) ? (
                <Text
                  style={{
                    color: bodyColor,
                    fontSize: isUnknown || isService ? 14 : 13,
                    fontWeight: isUnknown || isService ? "700" : "500",
                    lineHeight: 18,
                  }}
                >
                  {item.message || "—"}
                </Text>
              ) : null}
              {item.images?.length ? (
                <MessageImageGallery uris={item.images} />
              ) : null}
            </View>

          {showBadges ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "nowrap",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: 4,
              marginTop: 6,
            }}
          >
            <Chip label={toMessageTypeLabel(item.type)} tone={tone} size="sm" />
            {item.type !== "PA" && item.topic_label ? (
              <Chip label={item.topic_label} tone="warning" size="sm" />
            ) : null}
            {mapsUrl ? (
              <Pressable
                onPress={() => void Linking.openURL(mapsUrl)}
                accessibilityRole="link"
                accessibilityLabel="Open sender location in maps"
              >
                <Chip label={locationLabel} active size="sm" />
              </Pressable>
            ) : (
              <Chip label={locationLabel} tone="muted" size="sm" />
            )}
            {item.guest_id ? (
              <Chip
                label={`guest ${String(item.guest_id).slice(0, 8)}`}
                tone="muted"
                size="sm"
              />
            ) : null}
          </View>
          ) : null}
        </View>
      </View>

      {footerExtra ? (
        <View
          style={{
            marginTop: 6,
            alignSelf: isMine ? "flex-end" : "flex-start",
          }}
        >
          {footerExtra}
        </View>
      ) : null}
    </View>
  );
}
