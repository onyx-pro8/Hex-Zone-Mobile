import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, UserCheck, X } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  approveGuestRequest,
  listGuestRequests,
  rejectGuestRequest,
  type GuestRequest,
} from "@/api/guest";
import { colors } from "@/theme/colors";

export default function GuestListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const zoneId = user?.zoneId ?? "";
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const result = await listGuestRequests(zoneId);
      setRequests(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApprove = async (guestId: string) => {
    const res = await approveGuestRequest(guestId);
    if (res.error) {
      Alert.alert("Approve failed", res.error);
      return;
    }
    void load();
  };

  const onReject = async (guestId: string) => {
    const res = await rejectGuestRequest(guestId);
    if (res.error) {
      Alert.alert("Reject failed", res.error);
      return;
    }
    void load();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest list"
          subtitle="Active and recent arrivals for your zone"
          showBack
          onBack={() => router.back()}
        />
        {!zoneId ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.textMuted }}>
                Set up a primary zone before reviewing guest arrivals.
              </Text>
            </Card>
          </View>
        ) : loading && requests.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.guest_id}
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
                {item.approval_status === "PENDING" ? (
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
                      onPress={() => void onApprove(item.guest_id)}
                      leftIcon={<Check size={14} color="#fff" />}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Reject"
                      size="sm"
                      variant="danger"
                      onPress={() => void onReject(item.guest_id)}
                      leftIcon={<X size={14} color={colors.danger} />}
                      style={{ flex: 1 }}
                    />
                  </View>
                ) : null}
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
                  No guest arrivals for this zone yet.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
