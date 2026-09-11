import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  Linking,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { initialsForUser } from "@/components/ui/ProfileAvatarButton";
import type { Message } from "@/api/messages";
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
  style?: ViewStyle;
};

function SenderAvatar({
  name,
  email,
  avatarUrl,
  online = false,
}: {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  online?: boolean;
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
    <View style={{ width: 40, height: 40 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#C8DFFF",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {hasImage ? (
          <Image
            source={{ uri: displayUri!.trim() }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text
            style={{
              color: colors.accentDeep,
              fontWeight: "800",
              fontSize: 13,
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
          left: 0,
          bottom: 0,
          width: 11,
          height: 11,
          borderRadius: 6,
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
  style,
}: InboxMessageCardProps) {
  const isUnknown = isUnknownMessageType(item.type);
  const isService = isServiceMessageType(item.type);
  const mapsUrl = messageCoordinatesMapsUrl(item);
  const locationLabel = formatMessageCoordinatesLabel(item);
  // Inbox heading: delivery zone name + sender network id, e.g. "Geofence zone (ZN-HOME)".
  // Multi-zone sender view uses "My zone and N more zones".
  const zoneLabel = messageZoneLabel(item, {
    viewerOwnerId: selfOwnerId,
    zoneNames,
  });
  const createdAt = new Date(item.created_at).toLocaleString();
  const tone = typeTone(item);

  const titleColor = isUnknown
    ? UNKNOWN_MESSAGE_UI.title
    : isService
      ? SERVICE_MESSAGE_UI.title
      : colors.text;
  const bodyColor = isUnknown
    ? UNKNOWN_MESSAGE_UI.body
    : isService
      ? SERVICE_MESSAGE_UI.body
      : colors.text;

  return (
    <Card
      style={{
        marginBottom: 10,
        gap: 12,
        ...(highlighted ? { borderColor: colors.accent } : null),
        ...(isUnknown
          ? {
              borderColor: UNKNOWN_MESSAGE_UI.border,
              backgroundColor: UNKNOWN_MESSAGE_UI.surface,
            }
          : isService
            ? {
                borderColor: SERVICE_MESSAGE_UI.border,
                backgroundColor: SERVICE_MESSAGE_UI.surface,
              }
            : { backgroundColor: "#FFFFFF" }),
        ...style,
      }}
    >
      {/* Header: avatar | name + zone name (network id) */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <SenderAvatar
          name={
            (avatarName ?? "").trim() ||
            (userName.trim().toUpperCase() === "ME" ? "" : userName)
          }
          email={avatarEmail}
          avatarUrl={avatarUrl}
          online={!!online}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: titleColor,
              fontSize: 15,
              fontWeight: "800",
            }}
            numberOfLines={1}
          >
            {userName}
          </Text>
          <Text
            style={{
              color: colors.textDim,
              fontSize: 11,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {zoneLabel}
          </Text>
        </View>
      </View>

      {/* Main: message body */}
      <View style={{ gap: 4 }}>
        {item.subject ? (
          <Text
            style={{
              color: titleColor,
              fontSize: isUnknown || isService ? 17 : 16,
              fontWeight: "800",
              lineHeight: 22,
            }}
          >
            {item.subject}
          </Text>
        ) : null}
        {item.message && item.message !== item.subject ? (
          <Text
            style={{
              color: bodyColor,
              fontSize: isUnknown || isService ? 16 : 15,
              fontWeight: isUnknown || isService ? "700" : "500",
              lineHeight: 22,
            }}
          >
            {item.message}
          </Text>
        ) : !item.subject && (item.message || !item.images?.length) ? (
          <Text
            style={{
              color: bodyColor,
              fontSize: isUnknown || isService ? 16 : 15,
              fontWeight: isUnknown || isService ? "700" : "500",
              lineHeight: 22,
            }}
          >
            {item.message || "—"}
          </Text>
        ) : null}
        {item.images?.length ? (
          <MessageImageGallery uris={item.images} bleed />
        ) : null}
      </View>

      {/* Footer: left meta chips, right date */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 2,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
          }}
        >
          <Chip
            label={toMessageTypeLabel(item.type)}
            tone={tone}
            size="sm"
          />
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

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "600",
            maxWidth: "42%",
            textAlign: "right",
          }}
          numberOfLines={2}
        >
          {createdAt}
        </Text>
      </View>

      {footerExtra ? <View style={{ marginTop: 2 }}>{footerExtra}</View> : null}
    </Card>
  );
}
