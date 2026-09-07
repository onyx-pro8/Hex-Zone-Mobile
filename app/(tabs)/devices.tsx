import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  CircleDot,
  Home,
  MapPin,
  Plus,
  Smartphone,
  User,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { createDevice, getDevices, type DeviceRecord } from "@/api/devices";
import {
  accountTypeLabel,
  deviceLimitDescription,
  formatLimit,
  getDeviceLimit,
  normalizeAccountType,
} from "@/lib/accountLimits";
import {
  deriveDeviceOnline,
  isClientSessionHid,
  isSmartHomeHid,
  removeDevice,
  signOutDevice,
} from "@/lib/deviceSync";
import { toast } from "@/lib/toast";
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

function generateSmartHomeHid(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return `DEV-${s}`;
}

/** Normalize to DEV- + alphanumeric (min 3 chars after prefix). */
function normalizeSmartHomeHid(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.startsWith("MOB-") || upper.startsWith("WEB-")) return null;
  let suffix: string;
  if (upper.startsWith("DEV-")) {
    suffix = upper.slice(4).replace(/[^A-Z0-9]/g, "");
  } else {
    suffix = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }
  if (suffix.length < 3) return null;
  return `DEV-${suffix}`;
}

function deviceKindLabel(hid: string): string {
  const upper = String(hid).toUpperCase();
  if (upper.startsWith("MOB-")) return "Phone";
  if (upper.startsWith("WEB-")) return "Browser";
  return "Smart home";
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
  const kind = deviceKindLabel(device.hid);
  const isHub = isSmartHomeHid(device.hid);
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
          {isHub ? (
            <Home size={22} color={colors.accent} />
          ) : (
            <Smartphone size={22} color={colors.accent} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
              numberOfLines={1}
            >
              {device.name ?? device.hid}
            </Text>
            {isThisPhone ? <Chip label="This phone" tone="default" /> : null}
            <Chip label={kind} tone={isHub ? "default" : "muted"} />
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
          {online && isClientSessionHid(device.hid) ? (
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

function AddSmartHomeModal({
  visible,
  submitting,
  name,
  hid,
  address,
  onChangeName,
  onChangeHid,
  onChangeAddress,
  onGenerateHid,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  submitting: boolean;
  name: string;
  hid: string;
  address: string;
  onChangeName: (v: string) => void;
  onChangeHid: (v: string) => void;
  onChangeAddress: (v: string) => void;
  onGenerateHid: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(8, 14, 28, 0.72)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            maxHeight: "88%",
            paddingBottom: 24,
          }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: 6,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
              Add smart-home device
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              Register a hub with a DEV- ID. Then open Account settings → Smart-home
              integration to copy the API key and Network ID onto the device.
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Device name"
              value={name}
              onChangeText={onChangeName}
              placeholder="Living room hub"
              autoCapitalize="words"
            />
            <View style={{ gap: 8 }}>
              <Input
                label="Hardware ID (HID)"
                value={hid}
                onChangeText={onChangeHid}
                placeholder="DEV-A1B2C3"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                onPress={onGenerateHid}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                  Generate HID
                </Text>
              </Pressable>
              <Text style={{ color: colors.textDim, fontSize: 11 }}>
                Use Generate or enter DEV- plus at least 3 letters/numbers. Do not use
                MOB- or WEB- (those are phone/browser sessions).
              </Text>
            </View>
            <Input
              label="Address (optional)"
              value={address}
              onChangeText={onChangeAddress}
              placeholder="Home address"
            />
            <Button
              label={submitting ? "Saving…" : "Save smart-home device"}
              onPress={onSubmit}
              loading={submitting}
              disabled={submitting}
              fullWidth
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              disabled={submitting}
              fullWidth
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function DevicesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [localHid, setLocalHid] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addName, setAddName] = useState("");
  const [addHid, setAddHid] = useState(generateSmartHomeHid());
  const [addAddress, setAddAddress] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hid, result] = await Promise.all([
        getOrCreateDeviceHid(),
        getDevices(),
      ]);
      setLocalHid(hid);
      if (result.error) {
        toast.error(result.error);
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

  const smartHomeCount = useMemo(
    () => myDevices.filter((d) => isSmartHomeHid(d.hid)).length,
    [myDevices],
  );

  const atSmartHomeLimit =
    Number.isFinite(limit) && smartHomeCount >= limit;

  const sorted = useMemo(() => {
    return [...devices].sort((a, b) => {
      const at = new Date(a.last_seen ?? a.updated_at ?? 0).getTime();
      const bt = new Date(b.last_seen ?? b.updated_at ?? 0).getTime();
      return bt - at;
    });
  }, [devices]);

  const openAddModal = () => {
    setAddName("");
    setAddHid(generateSmartHomeHid());
    setAddAddress("");
    setAddOpen(true);
  };

  const handleAddSmartHome = async () => {
    const normalizedHid = normalizeSmartHomeHid(addHid);
    if (!normalizedHid) {
      toast.error("Enter a valid HID (DEV- plus at least 3 letters or numbers).");
      return;
    }
    if (devices.some((d) => String(d.hid).toUpperCase() === normalizedHid)) {
      toast.error("This Device ID is already in use.");
      return;
    }
    if (atSmartHomeLimit) {
      toast.error(deviceLimitDescription(accountType));
      return;
    }
    const label =
      addName.trim() ||
      `${(user?.name?.split(/\s+/)[0] || "Home").replace(/[^a-zA-Z]/g, "") || "Home"} hub`;

    setAddSubmitting(true);
    try {
      const result = await createDevice({
        hid: normalizedHid,
        name: label,
        address: addAddress.trim() || undefined,
        enable_notification: true,
        propagate_enabled: true,
        is_online: false,
        active: true,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAddOpen(false);
      await load();
      toast.success(
        `HID ${normalizedHid} is registered. Open Account settings → Smart-home integration to copy the API key and Network ID to your hub.`,
        { title: "Smart-home device added" },
      );
    } finally {
      setAddSubmitting(false);
    }
  };

  const confirmRemove = (device: DeviceRecord) => {
    const isHub = isSmartHomeHid(device.hid);
    Alert.alert(
      "Remove device?",
      isHub
        ? `Remove smart-home hub "${device.name ?? device.hid}"? Smart-home settings HID will update after you refresh settings.`
        : `Remove "${device.name ?? device.hid}" from your account? You can sign in again on that phone later.`,
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
                toast.error(
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
        toast.error(
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
          subtitle={`${accountTypeLabel(accountType)} · ${formatLimit(smartHomeCount, limit)} smart-home`}
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

          <Button
            label="Add smart-home device"
            leftIcon={<Plus size={18} color="#fff" />}
            onPress={openAddModal}
            disabled={atSmartHomeLimit}
            fullWidth
            size="md"
          />
          {atSmartHomeLimit ? (
            <Text style={{ color: colors.textDim, fontSize: 12 }}>
              Smart-home limit reached for this account. Remove a hub to add another.
            </Text>
          ) : null}
        </View>

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
                  No devices yet. This phone registers automatically on login. Tap
                  Add smart-home device to register a hub.
                </Text>
              </Card>
            }
          />
        )}

        <AddSmartHomeModal
          visible={addOpen}
          submitting={addSubmitting}
          name={addName}
          hid={addHid}
          address={addAddress}
          onChangeName={setAddName}
          onChangeHid={setAddHid}
          onChangeAddress={setAddAddress}
          onGenerateHid={() => setAddHid(generateSmartHomeHid())}
          onClose={() => {
            if (!addSubmitting) setAddOpen(false);
          }}
          onSubmit={() => void handleAddSmartHome()}
        />
      </SafeAreaView>
    </GradientBackground>
  );
}
