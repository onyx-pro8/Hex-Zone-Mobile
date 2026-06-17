import { useMemo } from "react";
import { Tabs } from "expo-router";
import {
  LayoutGrid,
  MessageSquare,
  QrCode,
  Settings,
  UserPlus,
  Users,
} from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { useLocationSync } from "@/hooks/useLocationSync";
import { colors } from "@/theme/colors";

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.4,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <LayoutGrid size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="access-admin"
        options={{
          title: "Access",
          tabBarIcon: ({ color, size }) => <QrCode size={size} color={color} />,
          href: isAdmin ? "/(tabs)/access-admin" : null,
        }}
      />
      <Tabs.Screen
        name="guest"
        options={{
          title: "Guest",
          tabBarIcon: ({ color, size }) => (
            <UserPlus size={size} color={color} />
          ),
          href: isAdmin ? null : "/(tabs)/guest",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="emergency-log" options={{ href: null }} />
      <Tabs.Screen name="private-thread" options={{ href: null }} />
      <Tabs.Screen name="devices" options={{ href: null }} />
      <Tabs.Screen name="guest-passes" options={{ href: null }} />
      <Tabs.Screen name="guest-list" options={{ href: null }} />
      <Tabs.Screen name="guest-schedules" options={{ href: null }} />
      <Tabs.Screen name="guest-arrival-messages" options={{ href: null }} />
      <Tabs.Screen name="api-docs" options={{ href: null }} />
    </Tabs>
  );
}
