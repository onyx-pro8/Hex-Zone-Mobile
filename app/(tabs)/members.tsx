import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UserCircle2 } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getMembers, type Member } from "@/api/members";
import { colors } from "@/theme/colors";

function MemberRow({ member }: { member: Member }) {
  return (
    <Card style={{ marginBottom: 10, flexDirection: "row", gap: 14 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.bgSurface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UserCircle2 size={28} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
          {member.name}
        </Text>
        {member.email ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {member.email}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={member.role ?? "member"}
            tone="muted"
          />
          <Chip
            label={member.active === false ? "Inactive" : "Active"}
            tone={member.active === false ? "danger" : "success"}
          />
        </View>
      </View>
    </Card>
  );
}

export default function MembersScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMembers();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMembers(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Members"
          subtitle={`${members.length} linked account${members.length === 1 ? "" : "s"}`}
        />
        {error ? (
          <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>
            {error}
          </Text>
        ) : null}
        {loading && members.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MemberRow member={item} />}
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
                  No members found for your account.
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
