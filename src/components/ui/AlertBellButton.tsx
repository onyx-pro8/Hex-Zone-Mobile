import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Bell } from "lucide-react-native";
import { useAlarmInbox } from "@/context/AlarmInboxContext";
import { colors } from "@/theme/colors";

type AlertBellButtonProps = {
  size?: number;
  /** Override the bell glyph size (defaults to ~half of `size`). */
  iconSize?: number;
};

export function AlertBellButton({ size = 42, iconSize }: AlertBellButtonProps) {
  const router = useRouter();
  const { unreadAlarmCount, markAlarmsSeen } = useAlarmInbox();
  const glyph = iconSize ?? Math.round(size * 0.5);

  return (
    <Pressable
      onPress={() => {
        void markAlarmsSeen();
        router.push("/(tabs)/alerts" as unknown as Href);
      }}
      accessibilityLabel="Open incoming alarms"
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: "transparent",
            backgroundColor: "transparent",
          },
        ]}
      >
        <Bell
          size={glyph}
          color={colors.text}
          strokeWidth={2.2}
        />
        {unreadAlarmCount > 0 ? <View style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: "#E8F0FA",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
