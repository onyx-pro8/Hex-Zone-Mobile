import { Text, View, type ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

type ChipProps = {
  label: string;
  active?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "critical" | "service" | "muted";
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
      return { bg: "#E4F6E8", fg: colors.success, border: "#BFE6C8" };
    if (tone === "warning")
      return { bg: "#FBEFD8", fg: colors.warning, border: "#F0DBB0" };
    if (tone === "danger")
      return { bg: "#FCE7EA", fg: colors.danger, border: "#F3C2CA" };
    if (tone === "critical")
      return { bg: "#C62828", fg: "#fff", border: "#B71C1C" };
    if (tone === "service")
      return { bg: "#2E7D32", fg: "#fff", border: "#1B5E20" };
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
          fontSize: tone === "critical" || tone === "service" ? 13 : 11,
          fontWeight: tone === "critical" || tone === "service" ? "800" : "600",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
