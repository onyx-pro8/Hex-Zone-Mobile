import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  Building2,
  Circle,
  Grid2x2,
  Hexagon,
  Landmark,
  Pentagon,
  Radar,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import type { ZoneType } from "@/api/zones";
import { colorForZoneType } from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

export type ZoneDrawToolId =
  | "polygon"
  | "circle"
  | Exclude<ZoneType, "geofence">;

export const ZONE_DRAW_TOOLS: {
  id: ZoneDrawToolId;
  label: string;
  zoneType: ZoneType;
  geofenceTool?: "polygon" | "circle";
  icon: (props: {
    size: number;
    color: string;
    strokeWidth?: number;
  }) => React.ReactNode;
  /** Accent used when this tool is selected (matches reference toolbar). */
  accent: string;
}[] = [
  {
    id: "polygon",
    label: "Polygon",
    zoneType: "geofence",
    geofenceTool: "polygon",
    icon: (p) => <Pentagon {...p} />,
    accent: colors.accent,
  },
  {
    id: "circle",
    label: "Circle",
    zoneType: "geofence",
    geofenceTool: "circle",
    icon: (p) => <Circle {...p} />,
    accent: colors.text,
  },
  {
    id: "grid",
    label: "Grid",
    zoneType: "grid",
    icon: (p) => <Grid2x2 {...p} />,
    accent: colors.warning,
  },
  {
    id: "proximity",
    label: "Proximity",
    zoneType: "proximity",
    icon: (p) => <Hexagon {...p} />,
    accent: colors.text,
  },
  {
    id: "dynamic",
    label: "Dynamic",
    zoneType: "dynamic",
    icon: (p) => <Radar {...p} />,
    accent: colorForZoneType("dynamic"),
  },
  {
    id: "communal_id",
    label: "Communal",
    zoneType: "communal_id",
    icon: (p) => <Users {...p} />,
    accent: colorForZoneType("communal_id"),
  },
  {
    id: "government_local_code",
    label: "Government",
    zoneType: "government_local_code",
    icon: (p) => <Landmark {...p} />,
    accent: colorForZoneType("government_local_code"),
  },
  {
    id: "object",
    label: "Object",
    zoneType: "object",
    icon: (p) => <Building2 {...p} />,
    accent: colorForZoneType("object"),
  },
];

/** Bottom dock shows every zone type as an icon-only button. */
export const ZONE_DOCK_TOOLS = ZONE_DRAW_TOOLS;

type DockProps = {
  expanded: boolean;
  onToggle: () => void;
  activeTool: ZoneDrawToolId | null;
  onSelect: (tool: ZoneDrawToolId) => void;
  /** Defaults to all draw tools; pass a filtered list to hide Communal for members. */
  tools?: typeof ZONE_DRAW_TOOLS;
};

const ICON_SIZE = 32;
const ROW_HEIGHT = 38;
const TOOL_GAP = 4;
const TOGGLE_SIZE = 44;
const SHADOW_PAD = 6;
const ANIM_MS = 120;
/** Fraction of the timeline each icon waits before it starts. */
const STAGGER = 0.08;
/** Fraction of the timeline a single icon takes to settle. */
const ITEM_WINDOW = 1 - STAGGER * (ZONE_DOCK_TOOLS.length - 1);

type DockButtonProps = {
  tool: (typeof ZONE_DOCK_TOOLS)[number];
  active: boolean;
  onPress: () => void;
  progress: SharedValue<number>;
  /** 0 = nearest the toggle, so icons cascade upward. */
  order: number;
};

function ZoneDockButton({
  tool,
  active,
  onPress,
  progress,
  order,
}: DockButtonProps) {
  const start = order * STAGGER;
  const end = start + ITEM_WINDOW;

  const style = useAnimatedStyle(() => {
    const p = interpolate(
      progress.value,
      [start, end],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: p,
      transform: [
        { translateY: interpolate(p, [0, 1], [18, 0]) },
        { scale: interpolate(p, [0, 1], [0.6, 1]) },
      ],
    };
  });

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={tool.label}
        accessibilityState={{ selected: active }}
        style={[
          styles.toolBtn,
          active && {
            borderColor: tool.accent,
            borderWidth: 2,
            shadowColor: tool.accent,
            shadowOpacity: 0.45,
            shadowRadius: 8,
            elevation: 8,
          },
        ]}
      >
        {tool.icon({
          size: 16,
          color: tool.accent,
          strokeWidth: active ? 2.4 : 2,
        })}
        <Text
          style={[styles.toolLabel, active && { color: tool.accent }]}
          numberOfLines={1}
        >
          {tool.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Bottom expandable zone-type dock — collapsed shows ↓, or ↓ + selected chip. */
export function ZoneToolsDock({
  expanded,
  onToggle,
  activeTool,
  onSelect,
  tools = ZONE_DRAW_TOOLS,
}: DockProps) {
  const progress = useSharedValue(expanded ? 1 : 0);
  const dockTools = tools;

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  // Extra padding keeps the drop shadows from being clipped by overflow.
  const toolsHeight =
    dockTools.length * ROW_HEIGHT +
    (dockTools.length - 1) * TOOL_GAP +
    SHADOW_PAD * 2;

  const stackStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, toolsHeight]),
    opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 1]),
  }));

  const selected = dockTools.find((t) => t.id === activeTool) ?? null;
  const showSelectedChip = !expanded && selected != null;

  return (
    <View style={styles.dock} pointerEvents="box-none">
      {/* Floated above the toggle so its width doesn't push sibling icons. */}
      <Animated.View
        style={[styles.toolsStack, stackStyle]}
        pointerEvents={expanded ? "box-none" : "none"}
      >
        <View style={styles.toolsInner}>
          {dockTools.map((tool, i) => (
            <ZoneDockButton
              key={tool.id}
              tool={tool}
              active={tool.id === activeTool}
              onPress={() => onSelect(tool.id)}
              progress={progress}
              order={dockTools.length - 1 - i}
            />
          ))}
        </View>
      </Animated.View>

      {showSelectedChip && selected ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`Show zone types, ${selected.label} selected`}
          style={[
            styles.collapsedChip,
            {
              borderColor: selected.accent,
              shadowColor: selected.accent,
            },
          ]}
        >
          <View style={styles.collapsedArrow}>
            <ChevronUp size={18} color={colors.textMuted} strokeWidth={2.4} />
          </View>
          <View style={styles.collapsedDivider} />
          {selected.icon({
            size: 16,
            color: selected.accent,
            strokeWidth: 2.2,
          })}
          {/* <Text
            style={[styles.toolLabel, { color: selected.accent }]}
            numberOfLines={1}
          >
            {selected.label}
          </Text> */}
        </Pressable>
      ) : (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Hide zone types" : "Show zone types"}
          style={[
            styles.toggleBtn,
            expanded && {
              backgroundColor: colors.accent,
              borderColor: colors.accent,
            },
          ]}
        >
          {expanded ? (
            <ChevronDown size={22} color="#fff" strokeWidth={2.4} />
          ) : (
            <ChevronUp size={22} color={colors.textMuted} strokeWidth={2.4} />
          )}
        </Pressable>
      )}
    </View>
  );
}

/** @deprecated Prefer ZoneToolsDock — kept for any leftover imports. */
export function ZoneToolsRail({
  activeTool,
  onSelect,
}: {
  activeTool: ZoneDrawToolId | null;
  onSelect: (tool: ZoneDrawToolId) => void;
}) {
  return (
    <View style={{ gap: TOOL_GAP }}>
      {ZONE_DRAW_TOOLS.map((tool) => {
        const active = tool.id === activeTool;
        const accent = tool.accent;
        return (
          <Pressable
            key={tool.id}
            onPress={() => onSelect(tool.id)}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              width: ICON_SIZE,
              height: ICON_SIZE,
              borderRadius: ICON_SIZE / 2,
              backgroundColor: "#FFFFFF",
              borderWidth: active ? 2 : 1.5,
              borderColor: active ? accent : colors.borderStrong,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
              shadowColor: "#0F2C5C",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            })}
          >
            {tool.icon({
              size: 18,
              color: active ? accent : colors.textMuted,
              strokeWidth: 2.2,
            })}
          </Pressable>
        );
      })}
    </View>
  );
}

export function zoneToolLabel(id: ZoneDrawToolId | null): string {
  if (!id) return "Zone tools";
  return ZONE_DRAW_TOOLS.find((t) => t.id === id)?.label ?? "Zone tools";
}

/** Compact circular map control (undo / redo / clear). */
export function MapIconButton({
  label,
  onPress,
  children,
  disabled,
  accent,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          width: TOGGLE_SIZE,
          height: TOGGLE_SIZE,
          borderRadius: TOGGLE_SIZE / 2,
          backgroundColor: accent ? colors.accent : "#FFFFFF",
          borderWidth: 1,
          borderColor: accent ? colors.accent : colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : 1,
          shadowColor: "#0F2C5C",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 5,
          elevation: 4,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function MapIconButtonCaption({ label }: { label: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontWeight: "700",
        color: colors.textMuted,
        textAlign: "center",
        marginTop: 2,
      }}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

export { ICON_SIZE as ZONE_TOOL_ICON_SIZE };

export function ZoneToolHint({ text }: { text: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        maxWidth: 200,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.94)",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 15 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "relative",
    alignItems: "flex-start",
    zIndex: 20,
    elevation: 20,
  },
  toolsStack: {
    position: "absolute",
    left: 0,
    bottom: TOGGLE_SIZE + 8,
    width: 168,
    overflow: "hidden",
    alignItems: "flex-start",
  },
  toolsInner: {
    position: "absolute",
    bottom: SHADOW_PAD,
    left: SHADOW_PAD,
    right: SHADOW_PAD,
    alignItems: "flex-start",
    gap: TOOL_GAP,
  },
  toolBtn: {
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: ROW_HEIGHT / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 6,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    maxWidth: 110,
  },
  toggleBtn: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F2C5C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  collapsedChip: {
    minHeight: TOGGLE_SIZE,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: TOGGLE_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 5,
  },
  collapsedArrow: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.border,
  },
});
