import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useResolvedAvatarUri } from "@/lib/resolveAvatarUri";
import { colors } from "@/theme/colors";

export function initialsForUser(
  name?: string | null,
  email?: string | null,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const mail = (email ?? "").trim();
  return mail ? mail.slice(0, 2).toUpperCase() : "?";
}

type ProfileAvatarButtonProps = {
  size?: number;
  onPress?: () => void;
  selected?: boolean;
  /** Override the auth user's avatar when editing a draft. */
  avatarUrl?: string | null;
  /** Override display initials source when editing a draft name. */
  name?: string | null;
  email?: string | null;
  /** Extra left margin used in the header; omit for centered layouts. */
  inset?: boolean;
  accessibilityLabel?: string;
};

export function ProfileAvatarButton({
  size = 40,
  onPress,
  selected = false,
  avatarUrl,
  name,
  email,
  inset = true,
  accessibilityLabel = "Open account menu",
}: ProfileAvatarButtonProps) {
  const { user } = useAuth();
  const resolvedName = name ?? user?.name;
  const resolvedEmail = email ?? user?.email;
  const sourceAvatar =
    avatarUrl !== undefined ? avatarUrl : (user?.avatar_url ?? null);
  const displayUri = useResolvedAvatarUri(sourceAvatar);
  const [imageFailed, setImageFailed] = useState(false);
  const initials = initialsForUser(resolvedName, resolvedEmail);
  const borderColor = selected ? colors.accent : "transparent";
  const hasImage =
    !imageFailed &&
    typeof displayUri === "string" &&
    displayUri.trim().length > 0;

  useEffect(() => {
    setImageFailed(false);
  }, [displayUri]);

  const circle = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor,
          marginLeft: inset ? 12 : 0,
          backgroundColor: hasImage ? "transparent" : "#C8DFFF",
        },
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: displayUri!.trim() }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "transparent",
          }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            {
              fontSize: Math.round(size * 0.36),
              lineHeight: Math.round(size * 0.42),
            },
          ]}
        >
          {initials}
        </Text>
      )}
    </View>
  );

  if (!onPress) {
    return circle;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      {circle}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    color: colors.accentDeep,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
    includeFontPadding: false,
  },
});
