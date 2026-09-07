import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  QUICK_MESSAGE_LABELS,
  QUICK_MESSAGE_TYPES,
  updateAppSettings,
  useAppSettings,
  type AppSettings,
} from "@/lib/appSettings";
import { getRemoteAppSettings, updateRemoteAppSettings } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { canEditNetworkId } from "@/lib/accountLimits";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
  editable?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        style={{
          backgroundColor: editable ? colors.bgSurface : colors.bgMuted,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: editable ? colors.text : colors.textDim,
          fontSize: 15,
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 11,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        fontWeight: "700",
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

export function ConfigForm() {
  const { user } = useAuth();
  const networkIdEditable = canEditNetworkId({
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
  });
  const settings = useAppSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const res = await getRemoteAppSettings();
      if (!mounted) return;
      if (res.data) {
        const merged = await updateAppSettings(res.data as Partial<AppSettings>);
        if (mounted) setDraft(merged);
      } else if (res.error) {
        toast.error(res.error);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const onSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await updateRemoteAppSettings(draft);
    if (res.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    const merged = await updateAppSettings(
      (res.data as Partial<AppSettings>) ?? draft,
    );
    setDraft(merged);
    setSaved(true);
    setSaving(false);
  };

  return (
    <View style={{ paddingHorizontal: 20 }}>
      {loading ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 8,
          }}
        >
          <ActivityIndicator color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Loading your settings…
          </Text>
        </View>
      ) : null}

      <SectionTitle>Smart-home integration</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          First add a smart-home hub on the Devices page (DEV- ID). Copy the API
          key and Network ID onto that hub. To receive Hex Zone alarms on the hub,
          paste the hub’s public webhook URL below — Hex Zone will POST alarms
          there. Leave webhook blank if the hub only polls.
        </Text>
        <Field
          label="Hardware identification (HID)"
          value={draft.sharedNotification.hid}
          onChangeText={() => {}}
          placeholder="DEV-A1B2C3"
          editable={false}
        />
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
          Filled from your registered smart-home device (Devices → Add smart-home
          device). MOB-/WEB- login clients are ignored here.
        </Text>
        <Field
          label="Network ID"
          value={draft.sharedNotification.networkId}
          onChangeText={(v) =>
            update({
              sharedNotification: { ...draft.sharedNotification, networkId: v },
            })
          }
          placeholder="ZONE-ABC123"
          editable={networkIdEditable}
        />
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
          {networkIdEditable
            ? "System administrators may personalize the network ID (e.g. DISTRICT 11)."
            : "Network ID is assigned by your administrator and cannot be changed."}
        </Text>
        <Field
          label="API key"
          value={draft.sharedNotification.apiKey}
          onChangeText={() => {}}
          placeholder="66c5b8a0-e30c-…"
          editable={false}
        />
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
          Authenticates the smart-home device when talking to the server.
        </Text>
        <Field
          label="Webhook"
          value={draft.sharedNotification.webhook}
          onChangeText={(v) =>
            update({
              sharedNotification: { ...draft.sharedNotification, webhook: v },
            })
          }
          placeholder="https://hub.example.com/hooks/hex-zone"
        />
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
          When set, Hex Zone POSTs SENSOR/PANIC/WELLNESS and other zone alerts to
          this URL (JSON event SMART_HOME_ALARM). Use a publicly reachable hub
          URL.
        </Text>
        <Field
          label="Periodical check (sec)"
          value={draft.sharedNotification.periodicalCheckSec}
          onChangeText={(v) =>
            update({
              sharedNotification: {
                ...draft.sharedNotification,
                periodicalCheckSec: v,
              },
            })
          }
          placeholder="86400"
          keyboardType="numeric"
        />
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
          Hint for hubs that poll instead of (or in addition to) webhook push.
        </Text>
        <Button
          label={
            saving ? "Saving…" : saved ? "Saved" : "Update smart-home settings"
          }
          onPress={() => void onSave()}
          disabled={loading || saving}
          fullWidth
        />
      </Card>

      <SectionTitle>Quick alert messages</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Pre-programmed text sent when a Quick Alert button is pressed. Leave blank to
          compose manually.
        </Text>
        {QUICK_MESSAGE_TYPES.map((type) => (
          <Field
            key={type}
            label={QUICK_MESSAGE_LABELS[type]}
            value={draft.quickMessages[type]}
            onChangeText={(v) =>
              update({
                quickMessages: { ...draft.quickMessages, [type]: v },
              })
            }
            multiline
          />
        ))}
      </Card>

      <Button
        label={saving ? "Saving…" : saved ? "Saved" : "Save quick messages"}
        onPress={() => void onSave()}
        disabled={loading || saving}
        fullWidth
        style={{ marginTop: 20 }}
      />
    </View>
  );
}
