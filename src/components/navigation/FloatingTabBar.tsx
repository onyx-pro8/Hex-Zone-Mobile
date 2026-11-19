import { Pressable, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Home, Map, Plus, QrCode, UserPlus, Users } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { useCompose } from "@/context/ComposeContext";
import { useBottomSafeInset } from "@/hooks/useBottomSafeInset";
import { colors } from "@/theme/colors";

type TabOptionsWithHref = BottomTabBarProps["descriptors"][string]["options"] & {
  href?: string | null;
};

function iconForRoute(name: string, color: string, size: number) {
  switch (name) {
    case "index":
      return <Home size={size} color={color} strokeWidth={2.25} />;
    case "zones":
      return <Map size={size} color={color} strokeWidth={2.25} />;
    case "members":
      return <Users size={size} color={color} strokeWidth={2.25} />;
    case "access-admin":
      return <QrCode size={size} color={color} strokeWidth={2.25} />;
    case "guest":
      return <UserPlus size={size} color={color} strokeWidth={2.25} />;
    default:
      return <Home size={size} color={color} strokeWidth={2.25} />;
  }
}

/** Nav pill height (approx). */
export const FLOATING_TAB_BAR_HEIGHT = 56;
/** Compose FAB sits above the pill. */
const FAB_SIZE = 52;
const FAB_GAP_ABOVE_PILL = 14;

export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const bottomInset = useBottomSafeInset();
  const { user } = useAuth();
  const { openCompose } = useCompose();

  const focusedRoute = state.routes[state.index];
  if (focusedRoute?.name === "private-thread") return null;

  const visibleRoutes = state.routes.filter((route) => {
    const options = descriptors[route.key].options as TabOptionsWithHref;
    if (options.href === null) return false;
    if (options.tabBarButton === null) return false;
    const itemStyle = options.tabBarItemStyle as { display?: string } | undefined;
    if (itemStyle?.display === "none") return false;
    return true;
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(bottomInset, 8) + 6,
        paddingHorizontal: 16,
        backgroundColor: "transparent",
      }}
    >
      {/* + button above the nav pill (right-aligned) */}
      {user ? (
        <View
          pointerEvents="box-none"
          style={{
            alignItems: "flex-end",
            marginBottom: FAB_GAP_ABOVE_PILL,
          }}
        >
          <Pressable
            onPress={openCompose}
            accessibilityRole="button"
            accessibilityLabel="New message"
            style={{
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 10,
            }}
          >
            <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : null}

      {/* Centered nav pill */}
      <View
        pointerEvents="box-none"
        style={{
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            backgroundColor: "#FFFFFF",
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#0F2C5C",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 14,
            elevation: 10,
          }}
        >
          {visibleRoutes.map((route) => {
            const focused = state.index === state.routes.indexOf(route);
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === "string"
                ? options.tabBarLabel
                : typeof options.title === "string"
                  ? options.title
                  : route.name;
            const color = focused ? colors.accent : colors.textDim;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() => {
                  navigation.emit({
                    type: "tabLongPress",
                    target: route.key,
                  });
                }}
                style={{
                  minWidth: 64,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 999,
                  backgroundColor: focused ? colors.accentGlow : "transparent",
                }}
              >
                {iconForRoute(route.name, color, 20)}
                <Text
                  style={{
                    color,
                    fontSize: 10,
                    fontWeight: focused ? "700" : "600",
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Space to keep content above the floating pill (includes typical safe inset).
 * Prefer `useFloatingTabBarInset()` when the safe area is available.
 */
export const FLOATING_TAB_BAR_CONTENT_INSET = 78;

export function useFloatingTabBarInset(): number {
  const bottomInset = useBottomSafeInset();
  // Pill + FAB stacked above it + gaps + home-indicator padding.
  return (
    FLOATING_TAB_BAR_HEIGHT +
    FAB_SIZE +
    FAB_GAP_ABOVE_PILL +
    Math.max(bottomInset, 8) +
    14
  );
}

/** Bottom offset that vertically centers controls with the compose FAB. */
export function useFloatingFabBottom(): number {
  const bottomInset = useBottomSafeInset();
  return (
    Math.max(bottomInset, 8) + 6 + FLOATING_TAB_BAR_HEIGHT + FAB_GAP_ABOVE_PILL
  );
}

export const FLOATING_FAB_SIZE = FAB_SIZE;
