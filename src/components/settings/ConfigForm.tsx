import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormSelect } from "@/components/ui/FormSelect";
import {
  DEFAULT_MEMBER_JOIN_WELCOME,
  QUICK_MESSAGE_LABELS,
  QUICK_MESSAGE_TYPES,
  updateAppSettings,
  useAppSettings,
  type AppSettings,
} from "@/lib/appSettings";
import { getRemoteAppSettings, updateRemoteAppSettings } from "@/api";
import { getDevices } from "@/api/devices";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { normalizeAccountType } from "@/lib/accountLimits";
import { isSmartHomeHid } from "@/lib/deviceSync";
import { toastSmartHomeSettingsSaved } from "@/lib/smartHomeToast";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const FIELD_HINT_STYLE = {
  color: colors.textDim,
  fontSize: 11,
  lineHeight: 15,
  marginTop: -4,
};

const CARD_GAP = 12;

type SmartHomeHubOption = { hid: string; name: string; active: boolean };
export type ConfigFormSection = "smartHome" | "quickAlerts" | "memberJoin";
type SaveSection = ConfigFormSection;

function mergeHubOptions(
  ...lists: Array<SmartHomeHubOption[] | undefined>
): SmartHomeHubOption[] {
  const byHid = new Map<string, SmartHomeHubOption>();
  for (const list of lists) {
    for (const hub of list ?? []) {
      const hid = hub.hid.trim();
      if (!hid || !isSmartHomeHid(hid)) continue;
      const key = hid.toUpperCase();
      const prev = byHid.get(key);
      byHid.set(key, {
        hid: prev?.hid ?? hid,
        name: (hub.name || prev?.name || hid).trim() || hid,
        active: hub.active && (prev?.active ?? true),
      });
    }
  }
  return [...byHid.values()].sort((a, b) => a.hid.localeCompare(b.hid));
}

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
          paddingVertical: multiline ? 12 : 11,
          color: editable ? colors.text : colors.textDim,
          fontSize: 15,
          minHeight: multiline ? 64 : 44,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export function ConfigForm({
  section,
}: {
  /** When set, only that settings block is shown (detail pages). */
  section: ConfigFormSection;
}) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const isIndividual =
    normalizeAccountType(user?.accountType, user?.account_type) === "EXCLUSIVE";
  const settings = useAppSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [hubs, setHubs] = useState<SmartHomeHubOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<SaveSection | null>(null);
  const [savedSection, setSavedSection] = useState<SaveSection | null>(null);

  // Reload hubs whenever Account settings is focused. Tab screens stay mounted,
  // so a one-shot mount effect would miss hubs added on the Devices screen.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void (async () => {
        setLoading(true);
        const ownerId = String(user?.id ?? "").trim();
        const [settingsRes, devicesRes] = await Promise.all([
          getRemoteAppSettings(),
          getDevices(),
        ]);
        if (!mounted) return;

        const fromSettings = (settingsRes.data?.smartHomeDevices ?? [])
          .filter((d) => typeof d.hid === "string" && d.hid.trim())
          .map((d) => ({
            hid: d.hid.trim(),
            name: (d.name ?? d.hid).trim() || d.hid.trim(),
            active: d.active !== false,
          }));

        const allSmartHomes = (devicesRes.data ?? [])
          .filter((d) => isSmartHomeHid(d.hid))
          .map((d) => ({
            hid: String(d.hid).trim(),
            name: (d.name ?? d.hid).trim() || String(d.hid).trim(),
            active: d.active !== false,
          }));

        const ownedSmartHomes = ownerId
          ? (devicesRes.data ?? [])
              .filter((d) => {
                if (!isSmartHomeHid(d.hid)) return false;
                const deviceOwner = String(
                  d.owner_id ?? d.owner?.id ?? "",
                ).trim();
                return deviceOwner === ownerId;
              })
              .map((d) => ({
                hid: String(d.hid).trim(),
                name: (d.name ?? d.hid).trim() || String(d.hid).trim(),
                active: d.active !== false,
              }))
          : allSmartHomes;

        // Prefer hubs owned by this account; if none match (stale owner_id),
        // still show every smart-home device visible on the Devices list.
        const fromDevices =
          ownedSmartHomes.length > 0 ? ownedSmartHomes : allSmartHomes;

        const mergedHubs = mergeHubOptions(fromSettings, fromDevices);

        if (settingsRes.data) {
          const remoteSn = settingsRes.data.sharedNotification ?? {};
          let hid =
            typeof remoteSn.hid === "string" ? remoteSn.hid.trim() : "";
          if (!isSmartHomeHid(hid)) hid = "";
          if (!hid && mergedHubs[0]) hid = mergedHubs[0].hid;
          if (
            hid &&
            mergedHubs.length > 0 &&
            !mergedHubs.some((h) => h.hid.toUpperCase() === hid.toUpperCase())
          ) {
            hid = mergedHubs[0].hid;
          }

          const merged = await updateAppSettings({
            ...settingsRes.data,
            sharedNotification: {
              ...remoteSn,
              hid,
            },
          } as Partial<AppSettings>);
          if (mounted) {
            setHubs(mergedHubs);
            setDraft(merged);
          }
        } else {
          if (mergedHubs.length) {
            setHubs(mergedHubs);
            setDraft((prev) => ({
              ...prev,
              sharedNotification: {
                ...prev.sharedNotification,
                hid: prev.sharedNotification.hid || mergedHubs[0].hid,
              },
            }));
          }
          if (settingsRes.error) toast.error(settingsRes.error);
          else if (devicesRes.error) toast.error(devicesRes.error);
        }
        if (mounted) setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [user?.id]),
  );

  const hidOptions = useMemo(
    () =>
      hubs.map((hub) => ({
        value: hub.hid,
        label:
          hub.name && hub.name !== hub.hid
            ? `${hub.name} (${hub.hid})`
            : hub.hid,
        description: hub.active ? "Smart-home hub" : "Inactive hub",
      })),
    [hubs],
  );

  const update = (patch: Partial<AppSettings>) => {
    setSavedSection(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const persistDraft = async (section: SaveSection) => {
    setSavingSection(section);
    setSavedSection(null);
    const res = await updateRemoteAppSettings(draft);
    if (res.error) {
      toast.error(res.error);
      setSavingSection(null);
      return;
    }
    if (res.data?.smartHomeDevices?.length) {
      setHubs(
        mergeHubOptions(
          hubs,
          res.data.smartHomeDevices
            .filter((d) => typeof d.hid === "string" && d.hid.trim())
            .map((d) => ({
              hid: d.hid.trim(),
              name: (d.name ?? d.hid).trim() || d.hid.trim(),
              active: d.active !== false,
            })),
        ),
      );
    }
    const merged = await updateAppSettings(
      (res.data as Partial<AppSettings>) ?? draft,
    );
    setDraft(merged);
    setSavedSection(section);
    setSavingSection(null);

    if (section === "smartHome") {
      toastSmartHomeSettingsSaved({
        webhook: merged.sharedNotification.webhook,
        hid: merged.sharedNotification.hid,
      });
    } else if (section === "quickAlerts") {
      toast.success("Quick alert messages saved.", {
        title: "Quick alerts",
      });
    } else {
      toast.success("Member join welcome message saved.", {
        title: "Welcome message",
      });
    }
  };

  const busy = loading || savingSection != null;
  const showSmartHome = section === "smartHome";
  const showQuickAlerts = section === "quickAlerts";
  const showMemberJoin = section === "memberJoin" && isAdmin;

  return (
    <View style={{ paddingHorizontal: 20, gap: 0 }}>
      {loading ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 4,
          }}
        >
          <ActivityIndicator color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Loading your settings…
          </Text>
        </View>
      ) : null}

      {showSmartHome ? (
        <Card style={{ gap: CARD_GAP, marginTop: 4 }}>
          {isIndividual ? (
            <>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
                Smart-home hubs are not available on Individual accounts. Your
                network ID is shown below for reference.
              </Text>
              <Field
                label="Network ID"
                value={draft.sharedNotification.networkId}
                onChangeText={() => {}}
                placeholder="ZONE-ABC123"
                editable={false}
              />
            </>
          ) : (
            <>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
                Add hubs on Devices (DEV- ID), select which hub to use, then copy
                the API key and Network ID onto that hub. Paste a public webhook
                URL to receive Alarm/Alert messages from this network only.
              </Text>
              {hidOptions.length > 0 ? (
                <FormSelect
                  label="Hardware identification (HID)"
                  value={draft.sharedNotification.hid || hidOptions[0].value}
                  options={hidOptions}
                  onChange={(hid) =>
                    update({
                      sharedNotification: {
                        ...draft.sharedNotification,
                        hid,
                      },
                    })
                  }
                  disabled={busy}
                />
              ) : (
                <Field
                  label="Hardware identification (HID)"
                  value="No smart-home hub yet"
                  onChangeText={() => {}}
                  editable={false}
                />
              )}
              <Text style={FIELD_HINT_STYLE}>
                {hidOptions.length > 1
                  ? "Tap to choose which registered hub to use."
                  : hidOptions.length === 1
                    ? "Your registered smart-home hub (tap if you add more later)."
                    : "Register a hub on Devices first, then return here to select it."}
              </Text>
              <Field
                label="Network ID"
                value={draft.sharedNotification.networkId}
                onChangeText={() => {}}
                placeholder="ZONE-ABC123"
                editable={false}
              />
              <Text style={FIELD_HINT_STYLE}>
                Assigned to your account. Copy this onto the hub; it cannot be
                changed here. Your hub only receives alarms from this network.
              </Text>
              <Field
                label="API key"
                value={draft.sharedNotification.apiKey}
                onChangeText={() => {}}
                placeholder="66c5b8a0-e30c-…"
                editable={false}
              />
              <Text style={FIELD_HINT_STYLE}>
                Authenticates the smart-home device with the server.
              </Text>
              <Field
                label="Webhook"
                value={draft.sharedNotification.webhook}
                onChangeText={(v) =>
                  update({
                    sharedNotification: {
                      ...draft.sharedNotification,
                      webhook: v,
                    },
                  })
                }
                placeholder="https://hub.example.com/hooks/hex-zone"
              />
              <Text style={FIELD_HINT_STYLE}>
                Must start with https:// (or http://). Requires a registered
                smart-home hub (DEV- HID). Hex Zone POSTs {" { title, message } "}
                for Alarm/Alert messages on your network.
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
              <Text style={FIELD_HINT_STYLE}>
                Hint for hubs that poll instead of webhook push.
              </Text>
              <Button
                label={
                  savingSection === "smartHome"
                    ? "Saving…"
                    : savedSection === "smartHome"
                      ? "Saved"
                      : "Save smart-home settings"
                }
                size="sm"
                onPress={() => void persistDraft("smartHome")}
                disabled={busy}
                fullWidth
              />
            </>
          )}
        </Card>
      ) : null}

      {showQuickAlerts ? (
        <Card style={{ gap: CARD_GAP, marginTop: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
            Pre-programmed text sent when a Quick Alert button is pressed. Leave
            blank to compose manually.
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
          <Button
            label={
              savingSection === "quickAlerts"
                ? "Saving…"
                : savedSection === "quickAlerts"
                  ? "Saved"
                  : "Save quick alert messages"
            }
            size="sm"
            onPress={() => void persistDraft("quickAlerts")}
            disabled={busy}
            fullWidth
          />
        </Card>
      ) : null}

      {showMemberJoin ? (
        <Card style={{ gap: CARD_GAP, marginTop: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
            Shown as a toast and SERVICE message when an invited member joins
            your network. Leave blank to use the default.
          </Text>
          <Field
            label="Welcome message"
            value={draft.memberJoinWelcome}
            onChangeText={(v) => update({ memberJoinWelcome: v })}
            placeholder={DEFAULT_MEMBER_JOIN_WELCOME}
            multiline
          />
          <Text style={FIELD_HINT_STYLE}>
            Placeholders: {"{member_name}"}, {"{network_name}"},{" "}
            {"{first_name}"}, {"{last_name}"}.
          </Text>
          <Button
            label={
              savingSection === "memberJoin"
                ? "Saving…"
                : savedSection === "memberJoin"
                  ? "Saved"
                  : "Save welcome message"
            }
            size="sm"
            onPress={() => void persistDraft("memberJoin")}
            disabled={busy}
            fullWidth
          />
        </Card>
      ) : null}

      {section === "memberJoin" && !isAdmin ? (
        <Card style={{ marginTop: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            Member join welcome messages can only be edited by network
            administrators.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}
