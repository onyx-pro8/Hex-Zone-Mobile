import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  getMembers,
  listTechnicalSupport,
  setPlatformStaffRole,
  type Member,
} from "@/api/members";
import {
  accountTypeLabel,
  isSystemAdministrator,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

function isTechnicalSupport(member: Member): boolean {
  const key = String(member.platform_staff_role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return key === "technical_support" || key === "tech_support";
}

function isBuiltinSystemAdmin(member: Member): boolean {
  if (isTechnicalSupport(member)) return false;
  return (
    String(member.role ?? "").toLowerCase() === "administrator" &&
    String(member.account_type ?? "").trim().toLowerCase() === "private"
  );
}

function roleLabel(member: Member): string {
  if (isTechnicalSupport(member)) return "Technical Support";
  if (isBuiltinSystemAdmin(member)) return "System Admin";
  return member.role === "administrator" ? "Administrator" : "User";
}

export default function GivePermissionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const allowed = isSystemAdministrator({
    role: user?.role,
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
    platformStaffRole: user?.platformStaffRole ?? user?.platform_staff_role,
  });
  const myId = String(user?.id ?? "").trim();

  const load = useCallback(async () => {
    setLoading(true);
    const [result, support] = await Promise.all([
      getMembers(),
      listTechnicalSupport(),
    ]);
    if (result.error) toast.error(result.error);
    const supportIds = new Set((support.data ?? []).map((row) => row.id));
    setMembers(
      (result.data ?? []).map((row) =>
        supportIds.has(row.id) || isTechnicalSupport(row)
          ? { ...row, platform_staff_role: "technical_support" }
          : row,
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members
      .filter((member) => {
        if (!needle) return true;
        return [member.name, member.email, member.username, member.zone_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => {
        const rank = (member: Member) =>
          isTechnicalSupport(member) ? 0 : isBuiltinSystemAdmin(member) ? 2 : 1;
        const byRole = rank(left) - rank(right);
        if (byRole !== 0) return byRole;
        return left.name.localeCompare(right.name);
      });
  }, [members, query]);

  async function grant(member: Member, next: "technical_support" | "none") {
    setPendingId(member.id);
    const result = await setPlatformStaffRole(member.id, next);
    setPendingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setMembers((current) =>
      current.map((row) =>
        row.id === member.id
          ? {
              ...row,
              platform_staff_role: next,
              account_type: next === "technical_support" ? "private" : row.account_type,
              zone_id:
                next === "technical_support"
                  ? String(user?.zoneId ?? user?.zone_id ?? row.zone_id ?? "")
                  : row.zone_id,
            }
          : row,
      ),
    );
    toast.success(
      next === "technical_support"
        ? `${member.name} is now Technical Support.`
        : `${member.name} no longer has Technical Support permission.`,
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Permission"
            subtitle="Technical Support uses your network and the same access"
            showBack
            onBack={() => router.back()}
          />
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            {!allowed ? (
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                Only the system administrator can give this permission.
              </Text>
            ) : (
              <>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Name, username, or email"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: colors.text,
                    fontSize: 15,
                  }}
                />
                {loading ? (
                  <Text style={{ color: colors.textMuted }}>Loading users…</Text>
                ) : null}
                {visible.map((member) => {
                  const isSelf = myId !== "" && member.id === myId;
                  const support = isTechnicalSupport(member);
                  const admin = isBuiltinSystemAdmin(member);
                  return (
                    <Card key={member.id} style={{ gap: 10 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
                        {member.name}
                        {isSelf ? " · You" : ""}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {[
                          member.email,
                          accountTypeLabel(normalizeAccountType(member.account_type)),
                          roleLabel(member),
                          member.zone_id,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {isSelf || admin ? null : (
                        <Button
                          label={
                            pendingId === member.id
                              ? "Saving…"
                              : support
                                ? "Remove permission"
                                : "Give permission"
                          }
                          variant={support ? "outline" : "primary"}
                          size="sm"
                          disabled={pendingId === member.id}
                          onPress={() =>
                            void grant(member, support ? "none" : "technical_support")
                          }
                        />
                      )}
                    </Card>
                  );
                })}
                {!loading && visible.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>No users match this search.</Text>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
