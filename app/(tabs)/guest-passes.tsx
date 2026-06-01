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
import { Ticket } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
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
  const router = useRouter();
  const { user } = useAuth();
  const zoneId = user?.zoneId ?? "";
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const result = await listGuestPasses(zoneId);
      setPasses(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest passes"
          subtitle="Pre-registered arrivals"
          showBack
          onBack={() => router.replace("/(tabs)/settings")}
        />
        {!zoneId ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.textMuted }}>
                Set up a primary zone before managing guest passes.
              </Text>
            </Card>
          </View>
        ) : loading && passes.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={passes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PassRow pass={item} zoneId={zoneId} onChanged={() => void load()} />
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
