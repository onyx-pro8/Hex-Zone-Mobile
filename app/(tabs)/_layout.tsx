import { useCallback, useMemo } from "react";
import { Tabs } from "expo-router";
import { useRouter, type Href } from "expo-router";
import { FloatingTabBar } from "@/components/navigation/FloatingTabBar";
import { useAuth } from "@/context/AuthContext";
import { AlarmInboxProvider } from "@/context/AlarmInboxContext";
import { ComposeProvider, useCompose } from "@/context/ComposeContext";
import { ComposeMessageSheet } from "@/components/messages/ComposeMessageSheet";
import { QuickAlertsSheet } from "@/components/messages/QuickAlertsSheet";
import { useLocationSync } from "@/hooks/useLocationSync";
import { useMessagesFeed } from "@/hooks/useMessagesFeed";

function GlobalSheets() {
  const { composeOpen, closeCompose, quickAlertsOpen, closeQuickAlerts } =
    useCompose();
  const { refresh } = useMessagesFeed();
  const router = useRouter();

  const onQuickAlertSent = useCallback(() => {
    void refresh();
    router.push("/(tabs)/alerts" as Href);
  }, [refresh, router]);

  return (
    <>
      <ComposeMessageSheet visible={composeOpen} onClose={closeCompose} />
      <QuickAlertsSheet
        visible={quickAlertsOpen}
        onClose={closeQuickAlerts}
        onSent={onQuickAlertSent}
      />
    </>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  useLocationSync(Boolean(user));

  const isAdmin = useMemo(() => {
    const role = String(user?.role ?? "").toLowerCase();
    if (role) return role !== "user";
    const regType = String(
      user?.registrationType ?? user?.registration_type ?? "",
    ).toUpperCase();
    return regType !== "USER";
  }, [user?.role, user?.registrationType, user?.registration_type]);

  return (
    <AlarmInboxProvider>
      <ComposeProvider>
        <Tabs
          tabBar={(props) => <FloatingTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { paddingBottom: 0 },
            tabBarStyle: {
              position: "absolute",
              backgroundColor: "transparent",
              borderTopWidth: 0,
              elevation: 0,
              height: 0,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarLabel: "Home",
            }}
          />
          <Tabs.Screen
            name="zones"
            options={{
              title: "Zones",
              tabBarLabel: "Zones",
            }}
          />
          <Tabs.Screen
            name="members"
            options={{
              title: "Members",
              tabBarLabel: "Members",
            }}
          />
          <Tabs.Screen
            name="access-admin"
            options={{
              title: "Access",
              tabBarLabel: "Access",
              href: isAdmin ? "/(tabs)/access-admin" : null,
            }}
          />
          <Tabs.Screen
            name="guest"
            options={{
              title: "Guest",
              tabBarLabel: "Guest",
              href: isAdmin ? null : "/(tabs)/guest",
            }}
          />
          {/* Reachable from header actions, not shown in the tab pill */}
          <Tabs.Screen name="messages" options={{ href: null }} />
          <Tabs.Screen name="recent-services" options={{ href: null }} />
          <Tabs.Screen name="settings" options={{ href: null }} />
          <Tabs.Screen name="user-settings" options={{ href: null }} />
          <Tabs.Screen name="smart-home-settings" options={{ href: null }} />
          <Tabs.Screen name="quick-alert-messages" options={{ href: null }} />
          <Tabs.Screen name="member-join-welcome" options={{ href: null }} />
          <Tabs.Screen name="guest-management" options={{ href: null }} />
          <Tabs.Screen name="notification-settings" options={{ href: null }} />
          <Tabs.Screen name="emergency-log" options={{ href: null }} />
          <Tabs.Screen name="alerts" options={{ href: null }} />
          <Tabs.Screen name="private-thread" options={{ href: null }} />
          <Tabs.Screen name="devices" options={{ href: null }} />
          <Tabs.Screen name="guest-passes" options={{ href: null }} />
          <Tabs.Screen name="guest-list" options={{ href: null }} />
          <Tabs.Screen name="guest-schedules" options={{ href: null }} />
          <Tabs.Screen name="guest-arrival-messages" options={{ href: null }} />
          <Tabs.Screen name="api-docs" options={{ href: null }} />
        </Tabs>
        <GlobalSheets />
      </ComposeProvider>
    </AlarmInboxProvider>
  );
}
