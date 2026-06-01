import "../global.css";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { isRunningInExpoGo } from "expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { colors } from "@/theme/colors";

if (__DEV__ && isRunningInExpoGo()) {
  LogBox.ignoreLogs([
    /expo-notifications.*Expo Go/i,
    /expo-notifications.*development build/i,
  ]);
}

void SystemUI.setBackgroundColorAsync(colors.bg);

function ProtectedShell() {
  const { token, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const segs = segments as readonly string[];
    const firstSegment = segs[0];
    const inAuthGroup = segs.includes("(auth)");
    const inTabsGroup = segs.includes("(tabs)");
    if (!token && inTabsGroup) {
      router.replace("/(auth)/welcome");
    } else if (token && (inAuthGroup || firstSegment == null)) {
      router.replace("/(tabs)");
    }
  }, [token, segments, initializing, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "fade",
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
            <StatusBar style="light" backgroundColor={colors.bg} />
            <ProtectedShell />
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
