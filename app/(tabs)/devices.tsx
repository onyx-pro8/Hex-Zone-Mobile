import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
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
import {
  deriveDeviceOnline,
  removeDevice,
  signOutDevice,
} from "@/lib/deviceSync";
import { getOrCreateDeviceHid } from "@/lib/storage";
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

function DeviceRow({
  device,
  isThisPhone,
  busy,
  onSignOut,
  onRemove,
}: {
  device: DeviceRecord;
  isThisPhone: boolean;
  busy: boolean;
  onSignOut: () => void;
  onRemove: () => void;
}) {
  const online = deriveDeviceOnline(device);
  const owner = ownerLabel(device);
  const zone = zoneLabel(device.h3_cell_id);
  return (
    <Card
      style={{
        marginBottom: 10,
        gap: 10,
        borderColor: isThisPhone ? colors.accent : colors.border,
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
            {isThisPhone ? (
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

      {!isThisPhone ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          {online ? (
            <Pressable
              onPress={onSignOut}
              disabled={busy}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                Sign out device
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onRemove}
            disabled={busy}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(255, 77, 109, 0.4)",
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600" }}>
              Remove
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

export default function DevicesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localHid, setLocalHid] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hid, result] = await Promise.all([
        getOrCreateDeviceHid(),
        getDevices(),
      ]);
      setLocalHid(hid);
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

  const confirmRemove = (device: DeviceRecord) => {
    Alert.alert(
      "Remove device?",
      `Remove "${device.name ?? device.hid}" from your account? You can sign in again on that phone later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (!device.id) return;
              setActionId(String(device.id));
              try {
                await removeDevice(device.id);
                await load();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not remove device.",
                );
              } finally {
                setActionId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleSignOut = (device: DeviceRecord) => {
    void (async () => {
      if (!device.id) return;
      setActionId(String(device.id));
      try {
        await signOutDevice(device.id);
        await load();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not sign out device.",
        );
      } finally {
        setActionId(null);
      }
    })();
  };

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
            renderItem={({ item }) => {
              const isThisPhone =
                localHid.length > 0 &&
                String(item.hid).toUpperCase() === localHid.toUpperCase();
              return (
                <DeviceRow
                  device={item}
                  isThisPhone={isThisPhone}
                  busy={actionId === String(item.id)}
                  onSignOut={() => handleSignOut(item)}
                  onRemove={() => confirmRemove(item)}
                />
              );
            }}
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
