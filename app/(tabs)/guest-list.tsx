import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Phone, RefreshCw, UserCheck, X } from "lucide-react-native";
import { useGuestCallOptional } from "@/context/GuestCallContext";
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
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

function SheetPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accent : "transparent",
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          color: active ? "#fff" : colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function GuestListScreen({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const isAdmin = useIsAdmin();
  const guestCall = useGuestCallOptional();
  const onBack = useGuestManagementBack("list");
  const {
    effectiveZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "PENDING" | "APPROVED" | "REJECTED"
  >("all");

  const load = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoading(true);
    try {
      const result = await listGuestRequests(effectiveZoneId);
      if (result.error) {
        toast.error(result.error);
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
      toast.error(res.error, { title: "Approve failed" });
      return;
    }
    void load();
  };

  const onReject = async (requestId: string) => {
    const res = await rejectGuestRequest(requestId, effectiveZoneId);
    if (res.error) {
      toast.error(res.error, { title: "Reject failed" });
      return;
    }
    void load();
  };

  const showZonePicker = isAdmin && candidateZoneIds.length > 1;
  const headerSubtitle = useMemo(() => {
    if (!effectiveZoneId) return "Active and recent arrivals for your zone";
    return `Active and recent arrivals · ${effectiveZoneId}`;
  }, [effectiveZoneId]);

  if (embedded) {
    const visible = requests.filter((item) =>
      statusFilter === "all"
        ? true
        : item.approval_status.toUpperCase() === statusFilter,
    );
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
          Pending and recent guest arrivals for this zone.
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => void load()}
            disabled={loading}
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
              {loading ? "Refreshing…" : "Refresh"}
            </Text>
          </Pressable>
        </View>
        {showZonePicker ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {candidateZoneIds.map((zid) => (
              <SheetPill
                key={zid}
                label={zid}
                active={zid === effectiveZoneId}
                onPress={() => setPickedZoneId(zid)}
              />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(
            [
              ["all", "All"],
              ["PENDING", "Pending"],
              ["APPROVED", "Approved"],
              ["REJECTED", "Rejected"],
            ] as const
          ).map(([value, label]) => (
            <SheetPill
              key={value}
              label={label}
              active={statusFilter === value}
              onPress={() => setStatusFilter(value)}
            />
          ))}
        </View>
        {!effectiveZoneId ? (
          zonesLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={{ color: colors.textMuted }}>
              No zones are linked to this account yet.
            </Text>
          )
        ) : loading && requests.length === 0 ? (
          <ActivityIndicator color={colors.accent} />
        ) : visible.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>Nothing here yet.</Text>
        ) : (
          visible.map((item, index) => {
            const isLast = index === visible.length - 1;
            return (
              <View
                key={item.id}
                style={{
                  gap: 6,
                  paddingBottom: isLast ? 0 : 10,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "800" }}>
                  {item.guest_name ?? "Guest"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "capitalize",
                  }}
                >
                  {item.approval_status.toLowerCase()}
                </Text>
                {guestRequestShowsApprovalActions(item) ? (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <Button
                      label="Approve"
                      size="sm"
                      tone="green"
                      onPress={() => void onApprove(item.id)}
                    />
                    <Button
                      label="Reject"
                      size="sm"
                      tone="red"
                      onPress={() => void onReject(item.id)}
                    />
                    <Button
                      label={guestCall?.callRequesting ? "Calling…" : "Call"}
                      size="sm"
                      tone="blue"
                      loading={Boolean(guestCall?.callRequesting)}
                      disabled={
                        Boolean(guestCall?.session) ||
                        Boolean(guestCall?.callRequesting)
                      }
                      onPress={() => {
                        guestCall?.startAdminCall({
                          guestId: item.guest_id,
                          zoneId: item.zone_id || effectiveZoneId,
                          guestName: item.guest_name,
                          fullscreen: false,
                        });
                      }}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    );
  }

  const body = (
    <>
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
                    Network
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
                style={{ flex: 1 }}
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
                        <Button
                          label={guestCall?.callRequesting ? "Calling…" : "Call"}
                          size="sm"
                          variant="outline"
                          loading={Boolean(guestCall?.callRequesting)}
                          disabled={Boolean(guestCall?.session) || Boolean(guestCall?.callRequesting)}
                          onPress={() => {
                            guestCall?.startAdminCall({
                              guestId: item.guest_id,
                              zoneId: item.zone_id || effectiveZoneId,
                              guestName: item.guest_name,
                              fullscreen: false,
                            });
                          }}
                          leftIcon={<Phone size={14} color={colors.accent} />}
                          style={{ flex: 1 }}
                        />
                      </View>
                    ) : null}
                  </Card>
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
                      No guest arrivals for this zone yet.
                    </Text>
                  </Card>
                }
              />
            )}
          </>
        )}
    </>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest list"
          subtitle={headerSubtitle}
          showBack
          onBack={onBack}
        />
        {body}
      </SafeAreaView>
    </GradientBackground>
  );
}
