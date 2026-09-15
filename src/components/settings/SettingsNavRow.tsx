import { Pressable, Text, View, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { colors } from "@/theme/colors";

export function SettingsNavRow({
  icon,
  title,
  subtitle,
  onPress,
  showChevron = true,
  style,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  showChevron?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          paddingVertical: 14,
          ...style,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.bgSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {showChevron ? (
          <ChevronRight size={18} color={colors.textDim} />
        ) : null}
      </Card>
    </Pressable>
  );
}
