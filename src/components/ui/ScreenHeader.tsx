import { ReactNode } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/theme/colors";

type ScreenHeaderProps = {
  title?: string;
  subtitle?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  align?: "left" | "center";
  style?: ViewStyle;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack,
  onBack,
  right,
  align = "left",
  style,
}: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 16,
          gap: 12,
        },
        style,
      ]}
    >
      {showBack ? (
        <Pressable
          onPress={() => (onBack ? onBack() : router.back())}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View
        style={{
          flex: 1,
          alignItems: align === "center" ? "center" : "flex-start",
        }}
      >
        {title ? (
          <Text
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "700",
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          typeof subtitle === "string" ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
    </View>
  );
}
