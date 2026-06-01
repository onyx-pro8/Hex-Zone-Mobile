import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarPlus, CalendarRange } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import {
  createAccessSchedule,
  listAccessSchedules,
  type AccessSchedule,
} from "@/api/guest";
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

export default function GuestSchedulesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const zoneId = user?.zoneId ?? "";
  const [schedules, setSchedules] = useState<AccessSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [eventId, setEventId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notifyAssist, setNotifyAssist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const result = await listAccessSchedules(zoneId);
      setSchedules(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyQuickWindow = (hours: number) => {
    setStartsAt(isoNow(0));
    setEndsAt(isoNow(hours));
  };

  const onSave = useCallback(async () => {
    if (!zoneId) {
      setError("Set up a primary zone before adding a schedule.");
      return;
    }
    if (!isValidIso(startsAt) || !isValidIso(endsAt)) {
      setError("Use ISO timestamps (e.g. 2026-06-01T15:00:00Z).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createAccessSchedule({
        zone_id: zoneId,
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
      setGuestName("");
      setEventId("");
      setGuestId("");
      setStartsAt("");
      setEndsAt("");
      setNotifyAssist(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setSubmitting(false);
    }
  }, [zoneId, guestName, eventId, guestId, startsAt, endsAt, notifyAssist, load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest schedules"
          subtitle="Pre-approve expected guest windows"
          showBack
          onBack={() => router.back()}
        />
        {!zoneId ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.textMuted }}>
                Set up a primary zone before adding access schedules.
              </Text>
            </Card>
          </View>
        ) : (
          <FlatList
            data={schedules}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={
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
                    style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}
                  >
                    New schedule
                  </Text>
                </View>
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
                    Notify zone members
                  </Text>
                  <Switch
                    value={notifyAssist}
                    onValueChange={setNotifyAssist}
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
                {error ? (
                  <Text style={{ color: colors.danger, fontSize: 12 }}>
                    {error}
                  </Text>
                ) : null}
                <Button
                  label="Save schedule"
                  onPress={() => void onSave()}
                  loading={submitting}
                  fullWidth
                />
              </Card>
            }
            renderItem={({ item }) => (
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
                          (item.guest_id ? `Guest ${item.guest_id.slice(0, 10)}` : "Schedule")}
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
                        {item.ends_at
                          ? new Date(item.ends_at).toLocaleString()
                          : "open"}
                      </Text>
                    </View>
                  </View>
                  <Chip
                    label={item.active ? "Active" : "Off"}
                    tone={item.active ? "success" : "muted"}
                  />
                </View>
              </Card>
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
                  No active schedules.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
