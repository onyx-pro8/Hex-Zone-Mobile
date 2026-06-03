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
import { devLog } from "@/lib/devConsole";
import { ensureAndroidChannels } from "@/lib/notifications";
import { colors } from "@/theme/colors";

if (__DEV__) {
  devLog("Dev console active — JS logs appear in the Metro terminal (npx expo start).");
}

if (__DEV__ && isRunningInExpoGo()) {
  LogBox.ignoreLogs([
    /expo-notifications.*Expo Go/i,
    /expo-notifications.*development build/i,
  ]);
}

void SystemUI.setBackgroundColorAsync(colors.bg);
void ensureAndroidChannels();

const PUBLIC_ROOT_SEGMENTS = new Set(["access", "join", "guest"]);

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
    // QR landings like `/access?gt=...` and `/join?token=...` must work for
    // signed-out users (anonymous guest check-in / member invite). Skip both
    // the auth and the redirect-to-tabs branches when on those routes.
    const onPublicLanding =
      typeof firstSegment === "string" &&
      PUBLIC_ROOT_SEGMENTS.has(firstSegment);
    if (onPublicLanding) return;
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
