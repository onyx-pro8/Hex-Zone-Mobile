import { Text, View, type LayoutChangeEvent } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { initialsForUser } from "@/components/ui/ProfileAvatarButton";
import type { GuestMessage } from "@/api/guestSession";
import { isOwnGuestChatMessage } from "@/api/guestSession";
import { formatMessageCoordinatesLabel } from "@/lib/messageCoordinates";
import {
  formatBubbleTime,
  formatInboxDayLabel,
  inboxDayKey,
  type InboxBubbleCluster,
} from "@/components/messages/InboxMessageCard";
import { colors } from "@/theme/colors";

const CLUSTER_WINDOW_MS = 5 * 60 * 1000;

export function guestChatSenderKey(item: GuestMessage): string {
  if (isOwnGuestChatMessage(item)) return "guest:self";
  if (item.from_kind === "zone_broadcast") return "zone:broadcast";
  const owner = (item.from_owner_id ?? "").trim();
  if (owner) return `owner:${owner}`;
  return `row:${item.id}`;
}

function guestMessagesFormCluster(
  a: GuestMessage | undefined,
  b: GuestMessage | undefined,
): boolean {
  if (!a || !b) return false;
  const aSys = String(a.type).toUpperCase() === "PERMISSION";
  const bSys = String(b.type).toUpperCase() === "PERMISSION";
  if (aSys || bSys) return false;
  if (guestChatSenderKey(a) !== guestChatSenderKey(b)) return false;
  if (inboxDayKey(a.created_at) !== inboxDayKey(b.created_at)) return false;
  const ta = new Date(a.created_at ?? "").getTime();
  const tb = new Date(b.created_at ?? "").getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= CLUSTER_WINDOW_MS;
}

export function guestChatBubbleCluster(
  prev: GuestMessage | undefined,
  item: GuestMessage,
  next: GuestMessage | undefined,
): InboxBubbleCluster {
  const withPrev = guestMessagesFormCluster(prev, item);
  const withNext = guestMessagesFormCluster(item, next);
  if (withPrev && withNext) return "middle";
  if (withPrev) return "end";
  if (withNext) return "start";
  return "single";
}

export function guestChatClusterRootId(
  list: GuestMessage[],
  index: number,
): string {
  let i = index;
  while (i > 0 && guestMessagesFormCluster(list[i - 1], list[i])) i -= 1;
  return list[i]?.id ?? String(index);
}

export function guestChatDayLabel(
  prev: GuestMessage | undefined,
  item: GuestMessage,
): string | null {
  if (!prev || inboxDayKey(prev.created_at) !== inboxDayKey(item.created_at)) {
    return formatInboxDayLabel(item.created_at) || null;
  }
  return null;
}

function GuestAvatar({
  name,
  online = false,
  dotOnRight = false,
}: {
  name: string;
  online?: boolean;
  dotOnRight?: boolean;
}) {
  const initials = initialsForUser(name, null);
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
        }}
      >
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

export function GuestChatBubble({
  item,
  userName,
  avatarName = null,
  zoneLabel,
  dayLabel = null,
  cluster = "single",
  clusterMinWidth,
  onBubbleWidth,
  online = false,
}: {
  item: GuestMessage;
  userName: string;
  /** Real guest/member name for avatar initials (when `userName` is "ME"). */
  avatarName?: string | null;
  zoneLabel: string;
  dayLabel?: string | null;
  cluster?: InboxBubbleCluster;
  clusterMinWidth?: number;
  onBubbleWidth?: (width: number) => void;
  online?: boolean;
}) {
  const isPermission = String(item.type).toUpperCase() === "PERMISSION";
  const isMine = isOwnGuestChatMessage(item);
  const useAccentBubble = isMine && !isPermission;
  const showHeader = cluster === "single" || cluster === "start";
  const showBadges = cluster === "single" || cluster === "end";
  const inCluster = cluster !== "single";
  const radiusTop = showHeader ? 16 : 4;
  const radiusBottom = showBadges ? 16 : 4;
  const createdAt = formatBubbleTime(item.created_at);
  const locationLabel = formatMessageCoordinatesLabel({
    latitude: item.latitude,
    longitude: item.longitude,
  });

  const titleColor = useAccentBubble ? "#FFFFFF" : isPermission ? colors.warning : colors.text;
  const bodyColor = useAccentBubble ? "#FFFFFF" : isPermission ? colors.warning : colors.text;
  const metaColor = useAccentBubble ? "rgba(255,255,255,0.75)" : colors.textDim;
  const bubbleBg = useAccentBubble
    ? colors.accent
    : isPermission
      ? "rgba(245,180,80,0.08)"
      : colors.bgCard;
  const bubbleBorder = useAccentBubble
    ? "rgba(255,255,255,0.45)"
    : isPermission
      ? colors.warning
      : colors.borderStrong;

  const onBubbleLayout = (e: LayoutChangeEvent) => {
    if (!onBubbleWidth || !inCluster) return;
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (Number.isFinite(w) && w > 0) onBubbleWidth(w);
  };

  if (isPermission) {
    return (
      <View style={{ marginBottom: 8 }}>
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
              borderColor: colors.warning,
              backgroundColor: "rgba(245,180,80,0.08)",
              borderRadius: 16,
              overflow: "hidden",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: colors.warning,
                fontSize: 13,
                fontWeight: "600",
                lineHeight: 18,
                textAlign: "center",
              }}
            >
              {item.text ?? "—"}
            </Text>
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
                <Chip label={item.type} tone="warning" size="sm" />
                <Chip label={zoneLabel} tone="muted" size="sm" />
              </View>
              {createdAt ? (
                <Text
                  style={{
                    color: "#C48A2A",
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
      </View>
    );
  }

  return (
    <View
      style={{
        marginBottom: cluster === "end" || cluster === "single" ? 6 : 3,
      }}
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
                <GuestAvatar
                  name={
                    (avatarName ?? "").trim() ||
                    (userName.trim().toUpperCase() === "ME" ? "" : userName)
                  }
                  online={online}
                  dotOnRight={isMine}
                />
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

          <View style={{ marginTop: showHeader ? 6 : 0 }}>
            <Text
              style={{
                color: bodyColor,
                fontSize: 13,
                fontWeight: "500",
                lineHeight: 18,
                textAlign: "left",
              }}
            >
              {item.text ?? "—"}
            </Text>
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
              <Chip
                label={item.type}
                tone={isPermission ? "warning" : "default"}
                size="sm"
              />
              {isPermission ? (
                <Chip label="read-only" tone="warning" size="sm" />
              ) : null}
              {item.zone_id ? (
                <Chip label={item.zone_id} tone="muted" size="sm" />
              ) : null}
              <Chip label={locationLabel} tone="muted" size="sm" />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
