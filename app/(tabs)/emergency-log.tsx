import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AlertTriangle, Siren } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { listEmergencyEvents, type EmergencyEvent } from "@/api/messageFeature";
import { colors } from "@/theme/colors";

type TypeFilter = "all" | "PANIC" | "NS_PANIC";

function isNsPanic(type: string): boolean {
  return String(type || "").toUpperCase().replace(/-/g, "_") === "NS_PANIC";
}

export default function EmergencyLogScreen() {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listEmergencyEvents({
      limit: 200,
      type: typeFilter === "all" ? undefined : typeFilter,
    });
    if (result.error) {
      setError(result.error);
      setEvents([]);
    } else {
      setEvents(result.data ?? []);
    }
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const filters: { id: TypeFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "PANIC", label: "PANIC" },
    { id: "NS_PANIC", label: "NS-PANIC" },
  ];

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Emergency log"
          subtitle="PANIC & NS-PANIC alarm history"
          showBack
          onBack={() => router.back()}
        />

        {!isAdmin ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.textMuted }}>
                Only administrators can view the emergency log.
              </Text>
            </Card>
          </View>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                paddingHorizontal: 20,
                marginBottom: 10,
              }}
            >
              {filters.map((f) => (
                <Pressable key={f.id} onPress={() => setTypeFilter(f.id)}>
                  <Chip label={f.label} active={typeFilter === f.id} />
                </Pressable>
              ))}
            </View>

            {error ? (
              <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                <Card>
                  <Text style={{ color: colors.danger, fontSize: 12 }}>
                    {error}
                  </Text>
                </Card>
              </View>
            ) : null}

            {loading && events.length === 0 ? (
              <View
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <FlatList
                data={events}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                refreshControl={
                  <RefreshControl refreshing={loading} onRefresh={() => void load()} />
                }
                ListEmptyComponent={
                  <Card>
                    <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                      No emergency events recorded.
                    </Text>
                  </Card>
                }
                renderItem={({ item }) => {
                  const nsPanic = isNsPanic(item.type);
                  const accent = nsPanic ? "#B5179E" : colors.danger;
                  return (
                    <Card style={{ marginBottom: 10, borderColor: `${accent}55` }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {nsPanic ? (
                            <Siren size={18} color={accent} />
                          ) : (
                            <AlertTriangle size={18} color={accent} />
                          )}
                          <Text
                            style={{
                              color: accent,
                              fontWeight: "800",
                              fontSize: 13,
                              letterSpacing: 0.5,
                            }}
                          >
                            {String(item.type).replace(/_/g, "-")}
                          </Text>
                        </View>
                        <Text style={{ color: colors.textDim, fontSize: 11 }}>
                          {new Date(item.createdAt).toLocaleString()}
                        </Text>
                      </View>

                      {item.text ? (
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 13,
                            marginTop: 10,
                            lineHeight: 18,
                          }}
                        >
                          {item.text}
                        </Text>
                      ) : null}

                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 10,
                        }}
                      >
                        {item.senderId != null ? (
                          <Chip label={`Sender ${item.senderId}`} />
                        ) : null}
                        {item.zoneId ? <Chip label={item.zoneId} /> : null}
                        <Chip label={`Reached ${item.recipientCount}`} />
                        {item.latitude != null && item.longitude != null ? (
                          <Pressable
                            onPress={() =>
                              void Linking.openURL(
                                `https://www.google.com/maps?q=${item.latitude},${item.longitude}`,
                              )
                            }
                          >
                            <Chip
                              label={`${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}`}
                              active
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    </Card>
                  );
                }}
              />
            )}
          </>
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
