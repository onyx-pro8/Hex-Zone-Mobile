import { Image, Text, View } from "react-native";
import { colors } from "@/theme/colors";

const LOGO_MARK = require("../../../assets/logo-mark.png");
const LOGO_FULL = require("../../../assets/logo-full.png");

export function Logo({
  size = 32,
  showWordmark = true,
  variant = "mark",
}: {
  size?: number;
  showWordmark?: boolean;
  /** "mark" renders the pin icon + wordmark; "full" renders the complete logo lockup. */
  variant?: "mark" | "full";
}) {
  if (variant === "full") {
    return (
      <Image
        source={LOGO_FULL}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image
        source={LOGO_MARK}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.5,
          shadowRadius: 14,
        }}
      />
      {showWordmark ? (
        <Text
          style={{
            color: colors.text,
            fontSize: size * 0.42,
            fontWeight: "800",
            letterSpacing: 0.5,
          }}
        >
          Safe <Text style={{ color: colors.success }}>Zone</Text> Patrol
        </Text>
      ) : null}
    </View>
  );
}
