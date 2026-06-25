import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Bell } from "lucide-react-native";
import { useAlarmInbox } from "@/context/AlarmInboxContext";
import { colors } from "@/theme/colors";

export function AlertBellButton() {
  const router = useRouter();
  const { unreadAlarmCount, markAlarmsSeen } = useAlarmInbox();

  return (
    <Pressable
      onPress={() => {
        void markAlarmsSeen();
        router.push("/(tabs)/alerts" as unknown as Href);
      }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityLabel="Open incoming alarms"
    >
      <Bell size={20} color={colors.accent} />
      {unreadAlarmCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
            {unreadAlarmCount > 99 ? "99+" : unreadAlarmCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
