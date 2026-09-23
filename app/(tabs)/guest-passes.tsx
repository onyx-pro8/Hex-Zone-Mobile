import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshCw, Ticket } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { useGuestManagementBack } from "@/hooks/useGuestManagementBack";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  createGuestPass,
  listGuestPasses,
  revokeGuestPass,
  type GuestPass,
} from "@/api/guest";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const QUICK_EXPIRY: { label: string; hours: number }[] = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

function isoFromNow(offsetHours: number): string {
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

function PassRow({
  pass,
  zoneId,
  isAdmin,
  onChanged,
}: {
  pass: GuestPass;
  zoneId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const tone =
    pass.status === "ACCEPTED"
      ? "success"
      : pass.status === "PENDING"
        ? "warning"
        : "danger";

  const onRevoke = async () => {
    const result = await revokeGuestPass(pass.id, zoneId);
    if (result.error) {
      toast.error(result.error, { title: "Action failed" });
      return;
    }
    onChanged();
  };

  return (
    <Card style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Ticket size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {pass.guest_name ?? pass.event_id}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Event {pass.event_id}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}>
            Expires {new Date(pass.expires_at).toLocaleString()}
          </Text>
        </View>
        <Chip label={pass.status} tone={tone} />
      </View>
      {isAdmin && pass.status === "ACCEPTED" ? (
        <Button
          label="Revoke"
          size="sm"
          variant="outline"
          onPress={() => void onRevoke()}
          style={{ marginTop: 12 }}
        />
      ) : null}
    </Card>
  );
}

export default function GuestPassesScreen() {
  const isAdmin = useIsAdmin();
  const onBack = useGuestManagementBack();
  const {
    effectiveZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [eventId, setEventId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => isoFromNow(24));

  const load = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoading(true);
    try {
      const result = await listGuestPasses(effectiveZoneId);
      setPasses(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [effectiveZoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(async () => {
    if (!effectiveZoneId) {
      toast.error("Set up a primary zone before creating a guest pass.");
      return;
    }
    const eid = eventId.trim();
    if (!eid) {
      toast.error("Event ID is required.");
      return;
    }
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) {
      toast.error("Expiry must be a future date (ISO).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createGuestPass({
        zone_id: effectiveZoneId,
        event_id: eid,
        expires_at: exp.toISOString(),
        ...(guestName.trim() ? { guest_name: guestName.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Could not create guest pass.");
      }
      toast.success(
        `Guest pass is active. Share Event ID ${result.data.event_id} with your guest.`,
      );
      setEventId("");
      setGuestName("");
      setNotes("");
      setExpiresAt(isoFromNow(24));
      void load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create guest pass.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [effectiveZoneId, eventId, expiresAt, guestName, notes, load]);

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest passes"
          subtitle={
            effectiveZoneId
              ? `New Event IDs are accepted immediately · ${effectiveZoneId}`
              : "New Event IDs are accepted immediately"
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
            data={passes}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={{ gap: 12, marginBottom: 8 }}>
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
                <Card style={{ gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ticket size={18} color={colors.accent} />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      Create guest pass
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    A new Event ID is accepted immediately. Share it with your
                    guest for arrival.
                  </Text>
                  <TextInput
                    placeholder="Event ID (required, e.g. EVT-2026-GALA)"
                    placeholderTextColor={colors.textDim}
                    value={eventId}
                    onChangeText={setEventId}
                    autoCapitalize="none"
                    style={inputStyle()}
                  />
                  <TextInput
                    placeholder="Guest name (optional)"
                    placeholderTextColor={colors.textDim}
                    value={guestName}
                    onChangeText={setGuestName}
                    style={inputStyle()}
                  />
                  <TextInput
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.textDim}
                    value={notes}
                    onChangeText={setNotes}
                    style={inputStyle()}
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    Expires
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {QUICK_EXPIRY.map((w) => (
                      <Pressable
                        key={w.hours}
                        onPress={() => setExpiresAt(isoFromNow(w.hours))}
                      >
                        <Chip label={w.label} />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    placeholder="Expires at (ISO)"
                    placeholderTextColor={colors.textDim}
                    value={expiresAt}
                    onChangeText={setExpiresAt}
                    autoCapitalize="none"
                    style={inputStyle()}
                  />
                  <Button
                    label="Create guest pass"
                    onPress={() => void onCreate()}
                    loading={submitting}
                    fullWidth
                  />
                </Card>
              </View>
            }
            renderItem={({ item }) => (
              <PassRow
                pass={item}
                zoneId={effectiveZoneId}
                isAdmin={isAdmin}
                onChanged={() => void load()}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 120,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void load()}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={
              <Card>
                <Text
                  style={{ color: colors.textMuted, textAlign: "center" }}
                >
                  No guest passes yet for this zone.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
