import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { getPrivateThread, type PrivateThreadMessage } from "@/api/messageFeature";
import { colors } from "@/theme/colors";

export default function PrivateThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    otherOwnerId?: string;
    selfOwnerId?: string;
  }>();
  const otherOwnerId = Number(params.otherOwnerId);
  const selfOwnerId = Number(params.selfOwnerId);

  const [messages, setMessages] = useState<PrivateThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(otherOwnerId) || otherOwnerId <= 0) {
      setError("Missing conversation participant.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getPrivateThread(otherOwnerId);
    if (result.error) {
      setError(result.error);
      setMessages([]);
    } else {
      setMessages(result.data ?? []);
    }
    setLoading(false);
  }, [otherOwnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Private thread"
          subtitle={
            Number.isFinite(otherOwnerId)
              ? `Conversation with member ${otherOwnerId}`
              : undefined
          }
          showBack
          onBack={() => router.back()}
        />

        {error ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
            </Card>
          </View>
        ) : loading && messages.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={() => void load()} />
            }
            ListEmptyComponent={
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No private messages in this thread yet.
                </Text>
              </Card>
            }
            renderItem={({ item }) => {
              const mine = item.senderId === selfOwnerId;
              return (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: mine ? "flex-end" : "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      maxWidth: "82%",
                      backgroundColor: mine ? colors.accent : colors.bgCard,
                      borderWidth: mine ? 0 : 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: mine ? "#fff" : colors.text,
                        fontSize: 14,
                        lineHeight: 19,
                      }}
                    >
                      {item.text}
                    </Text>
                    <Text
                      style={{
                        color: mine ? "rgba(255,255,255,0.7)" : colors.textDim,
                        fontSize: 10,
                        marginTop: 4,
                      }}
                    >
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
