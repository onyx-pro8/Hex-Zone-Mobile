import { ReactNode } from "react";
import { View, ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "@/theme/colors";

type GradientBackgroundProps = ViewProps & {
  children: ReactNode;
};

export function GradientBackground({
  children,
  style,
  ...rest
}: GradientBackgroundProps) {
  return (
    <View style={[{ flex: 1, backgroundColor: "#0A0A0F" }, style]} {...rest}>
      <LinearGradient
        colors={gradients.background as unknown as readonly [string, string, ...string[]]}
        locations={[0, 0.5, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.9 }}
      />
      {children}
    </View>
  );
}
