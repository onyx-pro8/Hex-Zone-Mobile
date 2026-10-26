import { ReactNode, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { LogOut, Siren, Settings, UserRound } from "lucide-react-native";
import { useCompose } from "@/context/ComposeContext";
import { AlertBellButton } from "@/components/ui/AlertBellButton";
import { ProfileAvatarButton } from "@/components/ui/ProfileAvatarButton";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

type AppHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  style?: ViewStyle;
  /** Tighter padding/icons for overlay layouts (e.g. Zones map). */
  compact?: boolean;
  /**
   * Icons to the left of siren/bell/avatar.
   * Pass an array so each icon gets the same slot size and gap as the others.
   */
  leadingActions?: ReactNode | ReactNode[];
};

export function AppHeader({
  title,
  subtitle,
  style,
  compact = false,
  leadingActions,
}: AppHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { openQuickAlerts } = useCompose();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = (user?.name ?? "").trim() || "Account";
  const displayEmail = (user?.email ?? "").trim() || "—";
  /**
   * Icon slots match glyph size so gaps between icons equal the gap from
   * bell edge → avatar edge. Avatar keeps a larger tap target.
   */
  const glyphSize = compact ? 18 : 20;
  const iconSlot = glyphSize;
  const avatarSlot = compact ? 36 : 40;
  const leadingItems = (
    Array.isArray(leadingActions)
      ? leadingActions
      : leadingActions
        ? [leadingActions]
        : []
  ).filter((item) => item != null && item !== false);

  return (
    <View style={[styles.header, compact && styles.headerCompact, style]}>
      <View style={[styles.titleBlock, compact && styles.titleBlockCompact]}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === "string" ? (
            <Text
              style={[styles.subtitle, compact && styles.subtitleCompact]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>

      <View style={[styles.actions, compact && styles.actionsCompact]}>
        {leadingItems.map((item, index) => (
          <View
            key={`leading-${index}`}
            style={[styles.actionSlot, { width: iconSlot, height: iconSlot }]}
          >
            {item}
          </View>
        ))}
        <View style={[styles.actionSlot, { width: iconSlot, height: iconSlot }]}>
          <Pressable
            onPress={openQuickAlerts}
            accessibilityLabel="Quick alerts"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
            <Siren size={glyphSize} color={colors.accent} strokeWidth={2.2} />
          </Pressable>
        </View>
        <View style={[styles.actionSlot, { width: iconSlot, height: iconSlot }]}>
          <AlertBellButton size={iconSlot} iconSize={glyphSize} />
        </View>
        <View style={[styles.actionSlot, { width: avatarSlot, height: avatarSlot }]}>
          <ProfileAvatarButton
            size={avatarSlot}
            inset={false}
            selected={menuOpen}
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
          />
          <View style={[styles.menu, { top: insets.top + 56 }]}>
            <View style={styles.menuCard}>
              <View style={styles.menuIdentity}>
                <ProfileAvatarButton size={34} />
                <View style={styles.menuIdentityText}>
                  <Text style={styles.menuName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.menuEmail} numberOfLines={1}>
                    {displayEmail}
                  </Text>
                </View>
              </View>

              <View style={styles.menuDivider} />

              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/(tabs)/settings" as unknown as Href);
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: pressed ? colors.bgSurface : "transparent",
                  marginHorizontal: 6,
                  marginVertical: 1,
                  borderRadius: 10,
                })}
              >
                <View style={styles.menuRowInner}>
                  <View style={styles.menuRowIcon}>
                    <Settings size={15} color={colors.text} strokeWidth={2.1} />
                  </View>
                  <Text style={styles.menuRowLabel}>Account settings</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/(tabs)/user-settings" as unknown as Href);
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: pressed ? colors.bgSurface : "transparent",
                  marginHorizontal: 6,
                  marginVertical: 1,
                  borderRadius: 10,
                })}
              >
                <View style={styles.menuRowInner}>
                  <View style={styles.menuRowIcon}>
                    <UserRound size={15} color={colors.text} strokeWidth={2.1} />
                  </View>
                  <Text style={styles.menuRowLabel}>User settings</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: pressed
                    ? "rgba(226,59,78,0.08)"
                    : "transparent",
                  marginHorizontal: 6,
                  marginBottom: 4,
                  marginTop: 1,
                  borderRadius: 10,
                })}
              >
                <View style={styles.menuRowInner}>
                  <View style={[styles.menuRowIcon]}>
                    <LogOut size={15} color={colors.danger} strokeWidth={2.1} />
                  </View>
                  <Text style={styles.menuRowLabelDanger}>Log out</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  headerCompact: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  titleBlockCompact: {
    marginRight: 6,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  titleCompact: {
    fontSize: 17,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  subtitleCompact: {
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  actionsCompact: {
    // Same gap between every action (icons ↔ icons ↔ avatar).
    gap: 18,
    flexShrink: 0,
    alignItems: "center",
  },
  actionSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E8F0FA",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    marginRight: 12,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 44, 92, 0.2)",
  },
  menu: {
    position: "absolute",
    right: 14,
    width: 220,
  },
  menuCard: {
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
    overflow: "hidden",
    paddingBottom: 2,
  },
  menuIdentity: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  menuIdentityText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
  },
  menuName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  menuEmail: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 10,
    marginBottom: 2,
  },
  menuRowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  menuRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    // backgroundColor: colors.bgSurface,
    // borderWidth: 1,
    // borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowIconDanger: {
    backgroundColor: "rgba(226,59,78,0.08)",
    borderColor: "rgba(226,59,78,0.2)",
  },
  menuRowLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 10,
  },
  menuRowLabelDanger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 10,
  },
});
