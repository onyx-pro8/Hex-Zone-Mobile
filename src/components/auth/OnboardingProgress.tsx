import { Text, View } from "react-native";
import { colors } from "@/theme/colors";

type OnboardingProgressProps = {
  step: number;
  total: number;
  labels?: string[];
};

export function OnboardingProgress({
  step,
  total,
  labels,
}: OnboardingProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeStep = Math.min(Math.max(1, step), safeTotal);
  const progress = safeStep / safeTotal;
  const label = labels?.[safeStep - 1];

  return (
    <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          Step {safeStep} of {safeTotal}
          {label ? ` · ${label}` : ""}
        </Text>
        <Text
          style={{
            color: colors.accent,
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: colors.bgSurface,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 999,
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}
