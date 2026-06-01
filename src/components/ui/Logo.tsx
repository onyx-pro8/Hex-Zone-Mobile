import { Image, Text, View } from "react-native";
import { colors } from "@/theme/colors";

const LOGO_SOURCE = require("../../../assets/logo.png");

export function Logo({
  size = 32,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image
        source={LOGO_SOURCE}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.6,
          shadowRadius: 14,
        }}
      />
      {showWordmark ? (
        <Text
          style={{
            color: colors.text,
            fontSize: size * 0.55,
            fontWeight: "800",
            letterSpacing: 1.5,
          }}
        >
          Hex <Text style={{ color: colors.accent }}>Zone</Text>
        </Text>
      ) : null}
    </View>
  );
}
