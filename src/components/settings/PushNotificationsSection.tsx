import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Bell, BellRing } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { useNotifications } from "@/context/NotificationContext";
import { sendTestPush, type PushDeliveryError } from "@/api/devices";
import {
  getNotificationPermissionStatus,
  registerForPushNotificationsAsync,
} from "@/lib/notifications";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const KILLED_APP_DELAY_SECONDS = 10;

export function PushNotificationsSection() {
  const { pushToken, permissionError } = useNotifications();
  const [testingPush, setTestingPush] = useState<"none" | "now" | "delayed">(
    "none",
  );
  const [osNotificationsGranted, setOsNotificationsGranted] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    void getNotificationPermissionStatus().then(({ granted }) => {
      setOsNotificationsGranted(granted);
    });
  }, [pushToken]);

  const retryPush = async () => {
    const result = await registerForPushNotificationsAsync();
    if (result.token) {
      toast.success("This device is registered for message notifications.", {
        title: "Push enabled",
      });
    } else {
      toast.warning(
        result.error ?? "Could not register for push notifications.",
        { title: "Push unavailable" },
      );
    }
  };

  const formatDeliveryErrors = (errors: PushDeliveryError[] | undefined) => {
    if (!errors?.length) return "";
    const first = errors[0];
    const code = first.error ?? first.message ?? "unknown";
    return ` Delivery error: ${code}.`;
  };

  const triggerTestPush = async (mode: "now" | "delayed") => {
    if (testingPush !== "none") return;
    const { granted } = await getNotificationPermissionStatus();
    setOsNotificationsGranted(granted);
    if (!granted) {
      toast.warning(
        "Android is not allowed to show notifications for Safe Zone Patrol. Open system Settings → Apps → Safe Zone Patrol → Notifications and enable them, then try again.",
        { title: "Notifications blocked" },
      );
      return;
    }
    setTestingPush(mode);
    try {
      const delaySeconds = mode === "delayed" ? KILLED_APP_DELAY_SECONDS : 0;
      const result = await sendTestPush({ delaySeconds });
      if (result.error) throw new Error(result.error);
      const data = result.data ?? {};
      if (data.push_no_tokens || (data.tokens ?? 0) === 0) {
        toast.warning(
          "This account has no active push tokens on the server. Tap Push notifications above to re-register, then try again.",
          { title: "No push tokens registered" },
        );
        return;
      }
      if (mode === "delayed") {
        toast.info(
          `Server will send to ${data.tokens} token(s) in ${KILLED_APP_DELAY_SECONDS}s on channel "${data.channel_id ?? "default"}". Swipe the app away from recents (do not Force stop). If nothing appears, rebuild the installed APK after the latest app.json notification changes (eas build).`,
          { title: "Test push scheduled", duration: 6000 },
        );
        return;
      }
      const sent = data.push_sent ?? 0;
      const failed = data.push_failed ?? 0;
      const deliveryHint = formatDeliveryErrors(data.delivery_errors);
      if (sent > 0 && failed === 0) {
        toast.success(
          `Push reached Google/FCM for ${sent} device(s). If you still see nothing in the tray, open Android Settings → Apps → Safe Zone Patrol → Notifications and enable "Safe Zone Patrol" / pop on screen. After updating notification config, run a new EAS build and reinstall.${deliveryHint}`,
          { title: "Expo reports delivery OK", duration: 6000 },
        );
        return;
      }
      toast.error(
        `Tried ${data.tokens ?? 0} token(s); ${failed} failed.${deliveryHint} Check server logs for Expo push receipt errors.`,
        { title: "Push delivery failed" },
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not send a test push.";
      toast.error(msg, { title: "Test push failed" });
    } finally {
      setTestingPush("none");
    }
  };

  return (
    <View>
      <SettingsNavRow
        icon={<Bell size={18} color={colors.accent} />}
        title="Push notifications"
        subtitle={
          pushToken
            ? osNotificationsGranted === false
              ? "Token registered — system notifications are OFF"
              : "Enabled — messages arrive as push alerts"
            : (permissionError ?? "Tap to enable notifications")
        }
        onPress={() => void retryPush()}
        showChevron={false}
      />
      {pushToken ? (
        <Card
          style={{
            marginBottom: 10,
            paddingVertical: 14,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.bgSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BellRing size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                Diagnose push delivery
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                Test now checks foreground delivery. Killed-app waits{" "}
                {KILLED_APP_DELAY_SECONDS}s so you can close the app first.
              </Text>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Button
              label="Test now"
              variant="secondary"
              size="sm"
              onPress={() => void triggerTestPush("now")}
              loading={testingPush === "now"}
              disabled={testingPush !== "none"}
              fullWidth
            />
            <Button
              label={`Test killed app (${KILLED_APP_DELAY_SECONDS}s)`}
              size="sm"
              onPress={() => void triggerTestPush("delayed")}
              loading={testingPush === "delayed"}
              disabled={testingPush !== "none"}
              fullWidth
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
