import { Pressable, Text, View } from "react-native";
import { colors } from "@/theme/colors";

/** Page corners that meet the first book tab with a square top-left. */
export const bookSheetCorners = {
  borderTopLeftRadius: 0,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 22,
} as const;

/**
 * Folder-style tabs used by Zone management. The active tab uses the same
 * fill as the sheet beneath it so the two read as one card.
 */
export function BookTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignSelf: "flex-start",
        gap: 2,
        marginBottom: -1,
        zIndex: 2,
      }}
    >
      {options.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderWidth: 1,
              borderBottomWidth: active ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: active ? colors.bgCard : colors.bgSurface,
              marginBottom: active ? 0 : 1,
            }}
          >
            <Text
              style={{
                color: active ? colors.accent : colors.textMuted,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
