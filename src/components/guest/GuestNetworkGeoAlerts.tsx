import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { propagateNetworkGuestMessage, searchNetworkGuestPrivateRecipients } from "@/api/networkGuestMessages";
import { readDeviceLocation } from "@/lib/expoLocation";
import {
  privateLocationStatusMessage,
  type PrivateLocationStatus,
} from "@/lib/privateMessageLocation";
import {
  guestAllowedNetworkGeoTypes,
  guestGeoAlertButtonTone,
  guestGeoAlertConfirmPrompt,
  guestGeoAlertLabel,
  guestHasNetworkGeoMessaging,
  type GuestNetworkGeoType,
} from "@/lib/guestNetworkGeoAlerts";
import { colors } from "@/theme/colors";

type Props = {
  primaryZone: string;
  allowedMessageTypes?: string[];
  networkGeoMessaging?: boolean;
};

function toneColors(tone: ReturnType<typeof guestGeoAlertButtonTone>) {
  switch (tone) {
    case "danger":
      return { bg: colors.danger, text: "#fff" };
    case "warning":
      return { bg: colors.warning, text: "#fff" };
    case "muted":
      return { bg: colors.textDim, text: "#fff" };
    default:
      return { bg: colors.accent, text: "#fff" };
  }
}

export function GuestNetworkGeoAlerts({
  primaryZone,
  allowedMessageTypes,
  networkGeoMessaging,
}: Props) {
  const zone = primaryZone.trim();
  const networkGeo = guestHasNetworkGeoMessaging({
    network_geo_messaging: networkGeoMessaging,
    allowed_message_types: allowedMessageTypes,
  });
  const allowedTypes = useMemo(
    () => guestAllowedNetworkGeoTypes(allowedMessageTypes),
    [allowedMessageTypes],
  );

  const [busyType, setBusyType] = useState<GuestNetworkGeoType | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [privatePeers, setPrivatePeers] = useState<
    { owner_id: string; display_name: string }[]
  >([]);
  const [privateRecipientId, setPrivateRecipientId] = useState("");
  const [privateLocationStatus, setPrivateLocationStatus] =
    useState<PrivateLocationStatus | null>(null);
  const [peersNote, setPeersNote] = useState<string | null>(null);

  const needsPrivate = allowedTypes.includes("PRIVATE");

  useEffect(() => {
    if (!zone || !needsPrivate) return;
    let active = true;
    void (async () => {
      const loc = await readDeviceLocation({ timeoutMs: 12000 });
      if (!active) return;
      if (!loc) {
        setPrivateLocationStatus("no_coordinates");
        setPeersNote(privateLocationStatusMessage("no_coordinates"));
        setPrivatePeers([]);
        return;
      }
      const res = await searchNetworkGuestPrivateRecipients("", {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (!active) return;
      if (res.error && !res.data) {
        setPeersNote(res.error);
        setPrivatePeers([]);
        setPrivateLocationStatus(null);
        return;
      }
      const locationStatus = res.data?.location_status ?? null;
      setPrivateLocationStatus(locationStatus);
      if (locationStatus !== "inside_zone") {
        setPeersNote(privateLocationStatusMessage(locationStatus));
        setPrivatePeers([]);
        return;
      }
      setPeersNote(null);
      const list = (res.data?.members ?? []).map((m) => ({
        owner_id: String(m.id),
        display_name: m.display_name,
      }));
      setPrivatePeers(list);
      if (list.length === 1) {
        setPrivateRecipientId(list[0].owner_id);
      }
    })();
    return () => {
      active = false;
    };
  }, [zone, needsPrivate]);

  const sendAlert = useCallback(
    async (type: GuestNetworkGeoType) => {
      if (!zone || busyType) return;

      const run = async () => {
        if (type === "PRIVATE") {
          const rid = Number(privateRecipientId);
          if (!Number.isFinite(rid) || rid <= 0) {
            setStatus("Select a recipient for PRIVATE.");
            return;
          }
        }
        setBusyType(type);
        setStatus(null);
        try {
          const loc = await readDeviceLocation({ timeoutMs: 12000 });
          if (!loc) {
            setStatus("Could not read GPS. Allow location access and try again.");
            return;
          }
          const res = await propagateNetworkGuestMessage({
            type,
            hid: `guest-${Date.now()}`,
            tt: new Date().toISOString(),
            msg: { description: `Guest ${guestGeoAlertLabel(type)} alert` },
            position: {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            },
            to: zone,
            ...(type === "PRIVATE" && privateRecipientId
              ? { receiver_owner_id: Number(privateRecipientId) }
              : {}),
          });
          if (res.error) {
            setStatus(res.error);
          } else if (res.data?.skipped) {
            setStatus(
              `${guestGeoAlertLabel(type)}: no recipients — you may be outside an acceptable zone.`,
            );
          } else {
            setStatus(`${guestGeoAlertLabel(type)} sent to network members.`);
          }
        } catch (e: unknown) {
          setStatus(
            e instanceof Error ? e.message : `Could not send ${guestGeoAlertLabel(type)}.`,
          );
        } finally {
          setBusyType(null);
        }
      };

      const confirm = guestGeoAlertConfirmPrompt(type);
      if (confirm) {
        Alert.alert(guestGeoAlertLabel(type), confirm, [
          { text: "Cancel", style: "cancel" },
          { text: "Send", style: "destructive", onPress: () => void run() },
        ]);
        return;
      }
      await run();
    },
    [zone, busyType, privateRecipientId],
  );

  if (!networkGeo || !zone || allowedTypes.length === 0) return null;

  return (
    <Card style={{ gap: 10, borderColor: `${colors.danger}55` }}>
      <Text
        style={{
          color: colors.danger,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: "700",
        }}
      >
        Network safety alerts
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 18 }}>
        Send alarms and alerts using your current location. Routing follows primary vs
        secondary zone rules for {zone}.
      </Text>

      {needsPrivate && privateLocationStatus === "inside_zone" && privatePeers.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
            PRIVATE recipient
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {privatePeers.map((p) => (
              <Pressable key={p.owner_id} onPress={() => setPrivateRecipientId(p.owner_id)}>
                <Chip
                  label={p.display_name || `#${p.owner_id}`}
                  active={privateRecipientId === p.owner_id}
                />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {needsPrivate && peersNote ? (
        <Text style={{ color: colors.warning, fontSize: 11 }}>{peersNote}</Text>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {allowedTypes.map((type) => {
          const tone = guestGeoAlertButtonTone(type);
          const palette = toneColors(tone);
          const busy = busyType === type;
          return (
            <Pressable
              key={type}
              disabled={busyType !== null}
              onPress={() => void sendAlert(type)}
              style={{
                opacity: busyType !== null && !busy ? 0.5 : 1,
                backgroundColor: palette.bg,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              {busy ? <ActivityIndicator color={palette.text} size="small" /> : null}
              <Text style={{ color: palette.text, fontWeight: "700", fontSize: 12 }}>
                {guestGeoAlertLabel(type)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {status ? (
        <Text style={{ color: colors.textDim, fontSize: 12 }} accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}
    </Card>
  );
}
