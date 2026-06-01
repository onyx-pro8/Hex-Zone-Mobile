import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AlertTriangle, CircleDot, MapPin, Smartphone, User } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import { getDevices, type DeviceRecord } from "@/api/devices";
import {
  accountTypeLabel,
  deviceLimitDescription,
  formatLimit,
  getDeviceLimit,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { colors } from "@/theme/colors";

function ownerLabel(device: DeviceRecord): string {
  const owner = device.owner;
  if (!owner) return "—";
  const full = `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim();
  return full || owner.email?.trim() || (owner.id != null ? `User ${owner.id}` : "—");
}

function zoneLabel(h3?: string | null): string | null {
  if (!h3 || h3.length < 6) return null;
  return `ZN-${h3.replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}

function formatLastSeen(value?: string): string {
  if (!value) return "Never";
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return "Never";
  return t.toLocaleString();
}

function deriveOnline(device: DeviceRecord): boolean {
  if (typeof device.is_online === "boolean") return device.is_online;
  if (typeof device.status === "boolean") return device.status;
  return device.active !== false;
}

function DeviceRow({
  device,
  isMine,
}: {
  device: DeviceRecord;
  isMine: boolean;
}) {
  const online = deriveOnline(device);
  const owner = ownerLabel(device);
  const zone = zoneLabel(device.h3_cell_id);
  return (
    <Card
      style={{
        marginBottom: 10,
        gap: 10,
        borderColor: isMine ? colors.accent : colors.border,
      }}
    >
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
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
          <Smartphone size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
              numberOfLines={1}
            >
              {device.name ?? device.hid}
            </Text>
            {isMine ? (
              <Chip label="This phone" tone="default" />
            ) : null}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            HID {device.hid}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <CircleDot
            size={12}
            color={online ? colors.success : colors.textDim}
          />
          <Text
            style={{
              color: online ? colors.success : colors.textDim,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {online ? "Online" : "Offline"}
          </Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <User size={14} color={colors.textDim} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{owner}</Text>
        </View>
        {device.address ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MapPin size={14} color={colors.textDim} />
            <Text
              style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}
              numberOfLines={1}
            >
              {device.address}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          Last seen {formatLastSeen(device.last_seen ?? device.updated_at)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {zone ? <Chip label={zone} tone="default" /> : null}
        <Chip
          label={device.enable_notification ? "Notifications on" : "Notifications off"}
          tone={device.enable_notification ? "default" : "muted"}
        />
        <Chip
          label={device.propagate_enabled ? "Propagate on" : "Propagate off"}
          tone={device.propagate_enabled ? "default" : "muted"}
        />
      </View>
    </Card>
  );
}

export default function DevicesScreen() {
  const router = useRouter();
  const { user } = useAuth();
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

  const accountType = useMemo(
    () => normalizeAccountType(user?.accountType, user?.account_type),
    [user?.accountType, user?.account_type],
  );
  const limit = useMemo(() => getDeviceLimit(accountType), [accountType]);

  // Owner-scoped device count drives the "X / Y" tracker.
  const ownerId = String(user?.id ?? user?.accountOwnerId ?? "").trim();
  const myDevices = useMemo(() => {
    if (!ownerId) return devices;
    return devices.filter((d) => String(d.owner_id ?? "") === ownerId);
  }, [devices, ownerId]);

  const sorted = useMemo(() => {
    return [...devices].sort((a, b) => {
      const at = new Date(a.last_seen ?? a.updated_at ?? 0).getTime();
      const bt = new Date(b.last_seen ?? b.updated_at ?? 0).getTime();
      return bt - at;
    });
  }, [devices]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Devices"
          subtitle={`${accountTypeLabel(accountType)} account · ${formatLimit(myDevices.length, limit)} devices`}
          showBack
          onBack={() => router.replace("/(tabs)/settings")}
        />

        <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              borderColor: "rgba(255,179,71,0.3)",
              backgroundColor: "rgba(255,179,71,0.06)",
            }}
          >
            <AlertTriangle size={18} color={colors.warning} />
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                lineHeight: 18,
                flex: 1,
              }}
            >
              {deviceLimitDescription(accountType)}
            </Text>
          </Card>
        </View>

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
            data={sorted}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <DeviceRow
                device={item}
                isMine={ownerId ? String(item.owner_id ?? "") === ownerId : false}
              />
            )}
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
