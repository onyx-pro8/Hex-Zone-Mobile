import { useCallback, useEffect, useState } from "react";
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
  acceptGuestPass,
  listGuestPasses,
  rejectGuestPass,
  revokeGuestPass,
  type GuestPass,
} from "@/api/guest";
import { colors } from "@/theme/colors";

function PassRow({
  pass,
  zoneId,
  onChanged,
}: {
  pass: GuestPass;
  zoneId: string;
  onChanged: () => void;
}) {
  const tone =
    pass.status === "ACCEPTED"
      ? "success"
      : pass.status === "PENDING"
        ? "warning"
        : "danger";

  const act = async (action: "accept" | "reject" | "revoke") => {
    const fn =
      action === "accept"
        ? acceptGuestPass
        : action === "reject"
          ? rejectGuestPass
          : revokeGuestPass;
    const result = await fn(pass.id, zoneId);
    if (result.error) {
      Alert.alert("Action failed", result.error);
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
      {pass.status === "PENDING" ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Button
            label="Accept"
            size="sm"
            onPress={() => void act("accept")}
            style={{ flex: 1 }}
          />
          <Button
            label="Reject"
            size="sm"
            variant="danger"
            onPress={() => void act("reject")}
            style={{ flex: 1 }}
          />
        </View>
      ) : pass.status === "ACCEPTED" ? (
        <Button
          label="Revoke"
          size="sm"
          variant="outline"
          onPress={() => void act("revoke")}
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

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest passes"
          subtitle={
            effectiveZoneId
              ? `Pre-registered arrivals · ${effectiveZoneId}`
              : "Pre-registered arrivals"
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
          <>
            {showZonePicker ? (
              <View
                style={{ paddingHorizontal: 20, marginBottom: 8, gap: 8 }}
              >
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
                    Zone
                  </Text>
                  <Pressable onPress={() => void refreshZones()} hitSlop={8}>
                    <RefreshCw size={14} color={colors.accent} />
                  </Pressable>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
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
              </View>
            ) : null}
            {loading && passes.length === 0 ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <FlatList
                data={passes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <PassRow
                    pass={item}
                    zoneId={effectiveZoneId}
                    onChanged={() => void load()}
                  />
                )}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 24,
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
          </>
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
