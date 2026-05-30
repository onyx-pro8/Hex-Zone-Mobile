import { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme/colors";

type CardProps = {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  glow?: boolean;
};

export function Card({ children, style, padded = true, glow }: CardProps) {
  return (
    <View
      style={[
        {
          borderRadius: 22,
          backgroundColor: colors.bgCard,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? 18 : 0,
          overflow: "hidden",
          ...(glow
            ? {
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.35,
                shadowRadius: 22,
                elevation: 8,
              }
            : {}),
        },
        style,
      ]}
    >
      {glow ? (
        <LinearGradient
          colors={["rgba(255,45,170,0.12)", "rgba(255,45,170,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {children}
    </View>
  );
}
