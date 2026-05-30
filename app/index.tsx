import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

export default function Index() {
  const { token, initializing } = useAuth();
  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={token ? "/(tabs)" : "/(auth)/welcome"} />;
}
