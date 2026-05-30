import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import {
  Check,
  QrCode,
  Ticket,
  UserCheck,
  X,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import {
  approveGuestRequest,
  generateAccessQrToken,
  generateMemberInviteQr,
  listGuestRequests,
  rejectGuestRequest,
  type GuestRequest,
} from "@/api/guest";
import { colors } from "@/theme/colors";

export default function AccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const zoneId = user?.zoneId ?? "";
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!zoneId) return;
    setLoadingRequests(true);
    try {
      const result = await listGuestRequests(zoneId);
      setRequests(result.data ?? []);
    } finally {
      setLoadingRequests(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const generateMemberQr = async () => {
    setLoadingQr(true);
    try {
      const ownerId = Number(user?.accountOwnerId ?? user?.id);
      const result = await generateMemberInviteQr({
        account_owner_id: Number.isFinite(ownerId) ? ownerId : undefined,
        zone_id: zoneId || undefined,
      });
      if (result.error || !result.data?.token) {
        throw new Error(result.error ?? "Could not generate invite QR.");
      }
      setQrValue(result.data.url ?? result.data.token);
    } catch (err) {
      Alert.alert(
        "QR error",
        err instanceof Error ? err.message : "Could not generate QR.",
      );
    } finally {
      setLoadingQr(false);
    }
  };

  const generateGuestAccessQr = async () => {
    if (!zoneId) {
      Alert.alert("Zone required", "Set up a zone before generating guest QR.");
      return;
    }
    setLoadingQr(true);
    try {
      const result = await generateAccessQrToken({ zone_id: zoneId });
      if (result.error || !result.data?.token) {
        throw new Error(result.error ?? "Could not generate access QR.");
      }
      setQrValue(result.data.url ?? result.data.token);
    } catch (err) {
      Alert.alert(
        "QR error",
        err instanceof Error ? err.message : "Could not generate QR.",
      );
    } finally {
      setLoadingQr(false);
    }
  };

  const onApprove = async (guestId: string) => {
    const result = await approveGuestRequest(guestId);
    if (result.error) {
      Alert.alert("Approve failed", result.error);
      return;
    }
    void loadRequests();
  };

  const onReject = async (guestId: string) => {
    const result = await rejectGuestRequest(guestId);
    if (result.error) {
      Alert.alert("Reject failed", result.error);
      return;
    }
    void loadRequests();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <ScreenHeader
            title="Access"
            subtitle="QR invites & guest arrivals"
          />

          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            <Card glow>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontWeight: "600",
                }}
              >
                QR codes
              </Text>
              {qrValue ? (
                <View style={{ alignItems: "center", marginTop: 16 }}>
                  <View
                    style={{
                      padding: 16,
                      borderRadius: 18,
                      backgroundColor: "#fff",
                    }}
                  >
                    <QRCode value={qrValue} size={180} />
                  </View>
                  <Text
                    style={{
                      color: colors.textDim,
                      fontSize: 11,
                      marginTop: 12,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                  >
                    {qrValue}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    alignItems: "center",
                    paddingVertical: 28,
                    gap: 8,
                  }}
                >
                  <QrCode size={42} color={colors.textDim} />
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Generate a member invite or guest access QR
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Button
                  label="Member invite"
                  onPress={() => void generateMemberQr()}
                  loading={loadingQr}
                  style={{ flex: 1 }}
                  size="sm"
                />
                <Button
                  label="Guest access"
                  variant="secondary"
                  onPress={() => void generateGuestAccessQr()}
                  loading={loadingQr}
                  style={{ flex: 1 }}
                  size="sm"
                />
              </View>
            </Card>

            <Pressable onPress={() => router.push("/(tabs)/guest-passes")}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Ticket size={24} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    Guest passes
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Pre-register expected guests with event IDs
                  </Text>
                </View>
              </Card>
            </Pressable>

            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "700",
                marginTop: 8,
              }}
            >
              Pending arrivals
            </Text>

            {loadingRequests ? (
              <ActivityIndicator color={colors.accent} />
            ) : requests.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No pending guest requests for this zone.
                </Text>
              </Card>
            ) : (
              requests.map((req) => (
                <Card key={req.guest_id} style={{ marginBottom: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                      <UserCheck size={20} color={colors.accent} />
                      <View>
                        <Text
                          style={{
                            color: colors.text,
                            fontWeight: "700",
                            fontSize: 15,
                          }}
                        >
                          {req.guest_name ?? "Guest"}
                        </Text>
                        <Text
                          style={{
                            color: colors.textDim,
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          {new Date(req.created_at).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <Chip
                      label={req.approval_status}
                      tone={
                        req.approval_status === "PENDING"
                          ? "warning"
                          : req.approval_status === "APPROVED"
                            ? "success"
                            : "danger"
                      }
                    />
                  </View>
                  {req.approval_status === "PENDING" ? (
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
                        onPress={() => void onApprove(req.guest_id)}
                        leftIcon={<Check size={14} color="#fff" />}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Reject"
                        size="sm"
                        variant="danger"
                        onPress={() => void onReject(req.guest_id)}
                        leftIcon={<X size={14} color={colors.danger} />}
                        style={{ flex: 1 }}
                      />
                    </View>
                  ) : null}
                </Card>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
