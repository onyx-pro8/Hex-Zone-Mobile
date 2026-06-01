import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme/colors";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.6,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        <LinearGradient
          colors={[colors.accent, colors.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text
          style={{
            color: "#fff",
            fontSize: size * 0.5,
            fontWeight: "900",
            letterSpacing: 0.5,
          }}
        >
          Z
        </Text>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: size * 0.55,
          fontWeight: "800",
          letterSpacing: 1.5,
        }}
      >
        Zone <Text style={{ color: colors.accent }}>Weaver</Text>
      </Text>
    </View>
  );
}
