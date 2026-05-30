import { Text, View, type ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

type ChipProps = {
  label: string;
  active?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
  style?: ViewStyle;
};

export function Chip({ label, active, tone = "default", style }: ChipProps) {
  const palette = (() => {
    if (active) {
      return {
        bg: colors.accent,
        fg: "#fff",
        border: colors.accent,
      };
    }
    if (tone === "success")
      return { bg: "#0F2A1F", fg: colors.success, border: "#1F4A36" };
    if (tone === "warning")
      return { bg: "#33240E", fg: colors.warning, border: "#5C401C" };
    if (tone === "danger")
      return { bg: "#3A0E1C", fg: colors.danger, border: "#5C1B2C" };
    if (tone === "muted")
      return {
        bg: colors.bgSurface,
        fg: colors.textMuted,
        border: colors.border,
      };
    return {
      bg: colors.bgCard,
      fg: colors.text,
      border: colors.border,
    };
  })();

  return (
    <View
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text
        style={{
          color: palette.fg,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
