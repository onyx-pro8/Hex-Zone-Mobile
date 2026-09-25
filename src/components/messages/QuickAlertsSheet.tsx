import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  BellRing,
  HeartPulse,
  HelpCircle,
  Radar,
  Siren,
} from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useAuth } from "@/context/AuthContext";
import { propagateMessageFeatureMessage } from "@/api/messageFeature";
import { resolveBroadcastName, useAppSettings, type QuickMessageType } from "@/lib/appSettings";
import { presentLocalMessageNotification } from "@/lib/notifications";
import { toastSmartHomeWebhookDelivery } from "@/lib/smartHomeToast";
import {
  messagePositionSourceLabel,
  resolveMessagePropagationPositionForType,
} from "@/lib/messagePosition";
import { getOrCreateDeviceHid } from "@/lib/storage";
import { isSystemAdministrator } from "@/lib/accountLimits";
import { toMessageTypeLabel, type MessageType } from "@/lib/messageTypes";
import {
  isEmergencyMessageType,
  isUnknownMessageType,
  UNKNOWN_HOLD_MS,
  UNKNOWN_MESSAGE_UI,
} from "@/lib/messageWorkflow";
import { useBottomSafeInset } from "@/hooks/useBottomSafeInset";
import { colors } from "@/theme/colors";

type AlarmAction = {
  type: QuickMessageType;
  label: string;
  icon: typeof BellRing;
};

const ALARM_ACTIONS: AlarmAction[] = [
  { type: "PANIC", label: "PANIC", icon: BellRing },
  { type: "SENSOR", label: "HOME ALARM", icon: Radar },
  { type: "NS_PANIC", label: "NS PANIC", icon: Siren },
  { type: "UNKNOWN", label: "UNKNOWN", icon: HelpCircle },
  { type: "WELLNESS_CHECK", label: "WELLNESS CHECK", icon: HeartPulse },
];

function confirmEmergencySend(type: MessageType): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isEmergencyMessageType(type)) {
      resolve(true);
      return;
    }
    Alert.alert(
      "Emergency alert",
      `${toMessageTypeLabel(type)} uses your current location. Inside the admin primary zone, all invited members and the administrator are notified; outside the primary zone, no one receives it. Block filters are bypassed.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Send", style: "destructive", onPress: () => resolve(true) },
      ],
    );
  });
}

function QuickActionButton({
  action,
  onPress,
  disabled,
  sending,
}: {
  action: AlarmAction;
  onPress: () => void;
  disabled: boolean;
  sending: boolean;
}) {
  const Icon = action.icon;
  const isUnknown = isUnknownMessageType(action.type as MessageType);
  const urgent = isEmergencyMessageType(action.type as MessageType);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdTickRef.current != null) {
      clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }
    holdStartedAtRef.current = null;
    holdTriggeredRef.current = false;
    setHoldProgress(0);
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const handleUnknownPressIn = useCallback(() => {
    if (disabled || sending || !isUnknown) return;
    clearHold();
    holdStartedAtRef.current = Date.now();
    holdTickRef.current = setInterval(() => {
      const startedAt = holdStartedAtRef.current;
      if (startedAt == null) return;
      const elapsed = Date.now() - startedAt;
      setHoldProgress(Math.min(1, elapsed / UNKNOWN_HOLD_MS));
    }, 50);
    holdTimerRef.current = setTimeout(() => {
      holdTriggeredRef.current = true;
      clearHold();
      onPress();
    }, UNKNOWN_HOLD_MS);
  }, [clearHold, disabled, isUnknown, onPress, sending]);

  const handleUnknownPressOut = useCallback(() => {
    if (!isUnknown || holdTriggeredRef.current) return;
    clearHold();
  }, [clearHold, isUnknown]);

  const holdSecondsLeft =
    holdProgress > 0
      ? Math.max(1, Math.ceil((1 - holdProgress) * (UNKNOWN_HOLD_MS / 1000)))
      : UNKNOWN_HOLD_MS / 1000;

  const bg = isUnknown
    ? UNKNOWN_MESSAGE_UI.badge
    : urgent
      ? colors.danger
      : "#FCE7EA";
  const border = isUnknown
    ? UNKNOWN_MESSAGE_UI.border
    : urgent
      ? colors.danger
      : "#F3C2CA";
  const fg = isUnknown || urgent ? "#fff" : colors.danger;

  return (
    <Pressable
      onPress={isUnknown ? undefined : onPress}
      onPressIn={isUnknown ? handleUnknownPressIn : undefined}
      onPressOut={isUnknown ? handleUnknownPressOut : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        isUnknown
          ? `Hold for ${UNKNOWN_HOLD_MS / 1000} seconds to send unknown alert`
          : action.label
      }
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.6 : 1,
        overflow: "hidden",
      }}
    >
      {isUnknown && holdProgress > 0 && !sending ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 4,
            backgroundColor: "rgba(255,255,255,0.25)",
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${holdProgress * 100}%`,
              backgroundColor: "#fff",
            }}
          />
        </View>
      ) : null}
      {sending ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Icon size={28} color={fg} />
      )}
      <Text
        style={{
          color: fg,
          fontSize: 13,
          fontWeight: "800",
          letterSpacing: 0.5,
          textAlign: "center",
        }}
      >
        {sending
          ? "Sending…"
          : isUnknown && holdProgress > 0
            ? `Hold… ${holdSecondsLeft}s`
            : action.label}
      </Text>
    </Pressable>
  );
}

export function QuickAlertsSheet({
  visible,
  onClose,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  const settings = useAppSettings();
  const bottomInset = useBottomSafeInset();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<QuickMessageType | null>(null);

  const selfRealName =
    (user?.name ?? "").trim() ||
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const selfBroadcastName = resolveBroadcastName(selfRealName || user?.name);
  const isSystemAdmin = isSystemAdministrator({
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
    role: user?.role,
  });

  useEffect(() => {
    if (!visible) {
      setStatus("");
      setBusy(null);
    }
  }, [visible]);

  const sendQuickAlert = useCallback(
    async (type: QuickMessageType) => {
      if (busy) return;
      if (!(await confirmEmergencySend(type as MessageType))) return;
      const presetText = (settings.quickMessages[type] ?? "").trim();
      if (!presetText) {
        setStatus("No preset message is configured for this alert type.");
        return;
      }
      setBusy(type);
      setStatus(`Sending ${toMessageTypeLabel(type as MessageType)}…`);
      try {
        const resolved = await resolveMessagePropagationPositionForType(
          type as MessageType,
          user?.mapCenter ?? user?.map_center ?? null,
        );
        if ("error" in resolved && !isSystemAdmin) throw new Error(resolved.error);
        const hid = await getOrCreateDeviceHid();
        const result = await propagateMessageFeatureMessage({
          type: type as MessageType,
          hid,
          msg: { description: presetText, broadcast_name: selfBroadcastName },
          ...("error" in resolved ? {} : { position: resolved.position }),
        });
        if (result.error) throw new Error(result.error);
        toastSmartHomeWebhookDelivery(result.data);
        setStatus(
          "error" in resolved
            ? `${toMessageTypeLabel(type as MessageType)} sent to all zones.`
            : `${toMessageTypeLabel(type as MessageType)} sent · ${messagePositionSourceLabel(resolved.source)}`,
        );
        onSent?.();
        onClose();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not send the alert.";
        setStatus(msg);
        await presentLocalMessageNotification({
          title: "Send failed",
          body: msg.slice(0, 120),
          data: { type: "error" },
        });
      } finally {
        setBusy(null);
      }
    },
    [
      busy,
      settings.quickMessages,
      user?.mapCenter,
      user?.map_center,
      selfBroadcastName,
      isSystemAdmin,
      onClose,
      onSent,
    ],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="82%">
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(bottomInset, 16) + 12,
        }}
      >
        <View style={{ alignItems: "center", paddingBottom: 10 }}>
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
            }}
          />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 14,
          }}
        >
          Quick Alerts
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {ALARM_ACTIONS.map((action) => (
                <QuickActionButton
                  key={action.type}
                  action={action}
                  disabled={!!busy}
                  sending={busy === action.type}
                  onPress={() => void sendQuickAlert(action.type)}
                />
              ))}
            </View>
            {status ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {status}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
