import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Check, RefreshCw, UserCheck, X } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { useGuestManagementBack } from "@/hooks/useGuestManagementBack";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  approveGuestRequest,
  guestRequestShowsApprovalActions,
  listGuestRequests,
  rejectGuestRequest,
  type GuestRequest,
} from "@/api/guest";
import { colors } from "@/theme/colors";

export default function GuestListScreen() {
  const isAdmin = useIsAdmin();
  const onBack = useGuestManagementBack();
  const {
    effectiveZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoading(true);
    setListError(null);
    try {
      const result = await listGuestRequests(effectiveZoneId);
      if (result.error) {
        setListError(result.error);
        setRequests([]);
        return;
      }
      setRequests(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [effectiveZoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApprove = async (requestId: string) => {
    const res = await approveGuestRequest(requestId, effectiveZoneId);
    if (res.error) {
      Alert.alert("Approve failed", res.error);
      return;
    }
    void load();
  };

  const onReject = async (requestId: string) => {
    const res = await rejectGuestRequest(requestId, effectiveZoneId);
    if (res.error) {
      Alert.alert("Reject failed", res.error);
      return;
    }
    void load();
  };

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;
  const headerSubtitle = useMemo(() => {
    if (!effectiveZoneId) return "Active and recent arrivals for your zone";
    return `Active and recent arrivals · ${effectiveZoneId}`;
  }, [effectiveZoneId]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest list"
          subtitle={headerSubtitle}
          showBack
          onBack={onBack}
        />
        {!effectiveZoneId ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              {zonesLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
              <View style={{ paddingHorizontal: 20, marginBottom: 8, gap: 8 }}>
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
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
            {listError ? (
              <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                <Card>
                  <Text style={{ color: colors.danger, fontSize: 12 }}>
                    {listError}
                  </Text>
                </Card>
              </View>
            ) : null}
            {loading && requests.length === 0 ? (
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
                data={requests}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Card style={{ marginBottom: 10 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <UserCheck size={20} color={colors.accent} />
                        <View>
                          <Text
                            style={{
                              color: colors.text,
                              fontWeight: "700",
                              fontSize: 15,
                            }}
                          >
                            {item.guest_name ?? "Guest"}
                          </Text>
                          <Text
                            style={{
                              color: colors.textDim,
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            {new Date(item.created_at).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Chip
                        label={item.approval_status}
                        tone={
                          item.approval_status === "PENDING"
                            ? "warning"
                            : item.approval_status === "APPROVED"
                              ? "success"
                              : "danger"
                        }
                      />
                    </View>
                    {guestRequestShowsApprovalActions(item) ? (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          marginTop: 14,
                        }}
                      >
                        <Button
                          label="Approve"
                          size="sm"
                          onPress={() => void onApprove(item.id)}
                          leftIcon={<Check size={14} color="#fff" />}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label="Reject"
                          size="sm"
                          variant="danger"
                          onPress={() => void onReject(item.id)}
                          leftIcon={<X size={14} color={colors.danger} />}
                          style={{ flex: 1 }}
                        />
                      </View>
                    ) : null}
                  </Card>
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
                      No guest arrivals for this zone yet.
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
