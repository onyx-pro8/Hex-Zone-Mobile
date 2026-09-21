import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarPlus, CalendarRange, RefreshCw } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { useGuestManagementBack } from "@/hooks/useGuestManagementBack";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  acceptAccessSchedule,
  createAccessSchedule,
  listAccessSchedules,
  rejectAccessSchedule,
  revokeAccessSchedule,
  type AccessSchedule,
  type AccessScheduleStatus,
} from "@/api/guest";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const QUICK_WINDOWS: { label: string; hours: number }[] = [
  { label: "Next 1 h", hours: 1 },
  { label: "Next 4 h", hours: 4 },
  { label: "Next 24 h", hours: 24 },
];

function isoNow(offsetHours = 0): string {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours);
  return d.toISOString();
}

function inputStyle() {
  return {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  } as const;
}

function isValidIso(value: string): boolean {
  if (!value.trim()) return true;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function statusTone(
  status: AccessScheduleStatus | string | undefined,
): "success" | "warning" | "danger" | "muted" {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "PENDING":
      return "warning";
    case "REJECTED":
    case "REVOKED":
      return "danger";
    default:
      return "muted";
  }
}

function ScheduleRow({
  item,
  isAdmin,
  onChanged,
}: {
  item: AccessSchedule;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const status = (item.status || (item.active ? "ACCEPTED" : "PENDING")) as AccessScheduleStatus;
  const [busy, setBusy] = useState(false);

  const act = async (action: "accept" | "reject" | "revoke") => {
    setBusy(true);
    try {
      const fn =
        action === "accept"
          ? acceptAccessSchedule
          : action === "reject"
            ? rejectAccessSchedule
            : revokeAccessSchedule;
      const result = await fn(item.id);
      if (result.error) {
        toast.error(result.error, { title: "Action failed" });
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            flex: 1,
          }}
        >
          <CalendarRange size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 14,
              }}
              numberOfLines={1}
            >
              {item.guest_name?.trim() ||
                item.event_id ||
                (item.guest_id
                  ? `Guest ${item.guest_id.slice(0, 10)}`
                  : "Schedule")}
            </Text>
            <Text
              style={{
                color: colors.textDim,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {item.starts_at
                ? new Date(item.starts_at).toLocaleString()
                : "open"}{" "}
              →{" "}
              {item.ends_at ? new Date(item.ends_at).toLocaleString() : "open"}
            </Text>
          </View>
        </View>
        <Chip label={status} tone={statusTone(status)} />
      </View>

      {isAdmin && status === "PENDING" ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Button
            label="Accept"
            size="sm"
            loading={busy}
            onPress={() => void act("accept")}
            style={{ flex: 1 }}
          />
          <Button
            label="Reject"
            size="sm"
            variant="danger"
            loading={busy}
            onPress={() => void act("reject")}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      {isAdmin && status === "ACCEPTED" ? (
        <Button
          label="Revoke"
          size="sm"
          variant="outline"
          loading={busy}
          onPress={() => void act("revoke")}
          style={{ marginTop: 12 }}
        />
      ) : null}
    </Card>
  );
}

export default function GuestSchedulesScreen() {
  const isAdmin = useIsAdmin();
  const onBack = useGuestManagementBack();
  const {
    effectiveZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();
  const [schedules, setSchedules] = useState<AccessSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [eventId, setEventId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notifyAssist, setNotifyAssist] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoading(true);
    try {
      const result = await listAccessSchedules(effectiveZoneId);
      setSchedules(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [effectiveZoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyQuickWindow = (hours: number) => {
    setStartsAt(isoNow(0));
    setEndsAt(isoNow(hours));
  };

  const onSave = useCallback(async () => {
    if (!effectiveZoneId) {
      toast.error("Set up a primary zone before adding a schedule.");
      return;
    }
    if (!isValidIso(startsAt) || !isValidIso(endsAt)) {
      toast.error("Use ISO timestamps (e.g. 2026-06-01T15:00:00Z).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAccessSchedule({
        zone_id: effectiveZoneId,
        guest_name: guestName.trim() || undefined,
        event_id: eventId.trim() || undefined,
        guest_id: guestId.trim() || undefined,
        starts_at: startsAt.trim() || undefined,
        ends_at: endsAt.trim() || undefined,
        notify_member_assist: notifyAssist,
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Could not save schedule.");
      }
      const created = result.data;
      if (created.status === "PENDING") {
        toast.success("Schedule submitted — waiting for admin approval.");
      } else {
        toast.success("Schedule approved and active.");
      }
      setGuestName("");
      setEventId("");
      setGuestId("");
      setStartsAt("");
      setEndsAt("");
      setNotifyAssist(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setSubmitting(false);
    }
  }, [
    effectiveZoneId,
    guestName,
    eventId,
    guestId,
    startsAt,
    endsAt,
    notifyAssist,
    load,
  ]);

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest schedules"
          subtitle={
            effectiveZoneId
              ? `Expected guest windows · admin approval · ${effectiveZoneId}`
              : "Expected guest windows · admin approval"
          }
          showBack
          onBack={onBack}
        />
        {!effectiveZoneId ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              {zonesLoading ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.textMuted }}>
                    Looking up your zones…
                  </Text>
                </View>
              ) : (
                <Text style={{ color: colors.textMuted }}>
                  {isAdmin
                    ? "No zones are linked to this account yet. Create a zone from the Dashboard, then come back here."
                    : "Your account is not linked to a zone yet. Ask your administrator to invite you to a zone."}
                </Text>
              )}
            </Card>
          </View>
        ) : (
          <FlatList
            data={schedules}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                {showZonePicker ? (
                  <Card style={{ gap: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          fontWeight: "700",
                        }}
                      >
                        Network
                      </Text>
                      <Pressable
                        onPress={() => void refreshZones()}
                        hitSlop={8}
                      >
                        <RefreshCw size={14} color={colors.accent} />
                      </Pressable>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {candidateZoneIds.map((zid) => (
                        <Pressable
                          key={zid}
                          onPress={() => setPickedZoneId(zid)}
                        >
                          <Chip
                            label={zid}
                            active={zid === effectiveZoneId}
                          />
                        </Pressable>
                      ))}
                    </View>
                  </Card>
                ) : null}
                <Card style={{ marginBottom: 16, gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <CalendarPlus size={18} color={colors.accent} />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      New schedule request
                    </Text>
                  </View>
                  {!isAdmin ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Submissions stay pending until a network administrator
                      accepts them.
                    </Text>
                  ) : null}
                  <TextInput
                    placeholder="Guest name (optional)"
                    placeholderTextColor={colors.textDim}
                    value={guestName}
                    onChangeText={setGuestName}
                    style={inputStyle()}
                  />
                  <TextInput
                    placeholder="Event ID (optional, e.g. EVT-1234)"
                    placeholderTextColor={colors.textDim}
                    value={eventId}
                    onChangeText={setEventId}
                    style={inputStyle()}
                  />
                  <TextInput
                    placeholder="Guest ID (optional, opaque guest UUID)"
                    placeholderTextColor={colors.textDim}
                    value={guestId}
                    onChangeText={setGuestId}
                    autoCapitalize="none"
                    style={inputStyle()}
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    Window
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {QUICK_WINDOWS.map((w) => (
                      <Pressable
                        key={w.hours}
                        onPress={() => applyQuickWindow(w.hours)}
                      >
                        <Chip label={w.label} />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    placeholder="Starts at (ISO, optional)"
                    placeholderTextColor={colors.textDim}
                    value={startsAt}
                    onChangeText={setStartsAt}
                    autoCapitalize="none"
                    style={inputStyle()}
                  />
                  <TextInput
                    placeholder="Ends at (ISO, optional)"
                    placeholderTextColor={colors.textDim}
                    value={endsAt}
                    onChangeText={setEndsAt}
                    autoCapitalize="none"
                    style={inputStyle()}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      Notify zone members on arrival
                    </Text>
                    <Switch
                      value={notifyAssist}
                      onValueChange={setNotifyAssist}
                      trackColor={{ false: colors.border, true: colors.accent }}
                    />
                  </View>
                  <Button
                    label={isAdmin ? "Save schedule" : "Submit for approval"}
                    onPress={() => void onSave()}
                    loading={submitting}
                    fullWidth
                  />
                </Card>
              </View>
            }
            renderItem={({ item }) => (
              <ScheduleRow
                item={item}
                isAdmin={isAdmin}
                onChanged={() => void load()}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
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
                  No schedules yet.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
