import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Smartphone } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getDevices, type DeviceRecord } from "@/api/devices";
import { colors } from "@/theme/colors";

function DeviceRow({ device }: { device: DeviceRecord }) {
  const online = device.is_online ?? device.status ?? false;
  return (
    <Card style={{ marginBottom: 10, flexDirection: "row", gap: 14 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.bgSurface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Smartphone size={24} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
          {device.name ?? device.hid}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          HID {device.hid}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Chip
            label={online ? "Online" : "Offline"}
            tone={online ? "success" : "muted"}
          />
          <Chip
            label={
              device.enable_notification ? "Notifications on" : "Notifications off"
            }
            tone={device.enable_notification ? "default" : "muted"}
          />
        </View>
      </View>
    </Card>
  );
}

export default function DevicesScreen() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDevices();
      if (result.error) {
        setError(result.error);
        return;
      }
      setDevices(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Devices"
          subtitle={`${devices.length} registered`}
          showBack
          onBack={() => router.replace("/(tabs)/settings")}
        />
        {error ? (
          <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>
            {error}
          </Text>
        ) : null}
        {loading && devices.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={devices}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <DeviceRow device={item} />}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void load()}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No devices registered yet. This phone registers automatically on
                  login.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
