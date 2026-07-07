import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  MapPin,
  ShieldCheck,
  UserCheck,
  UserCircle2,
  UserX,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { AlertBellButton } from "@/components/ui/AlertBellButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { getMembers, setMemberActive, type Member } from "@/api/members";
import {
  accountTypeLabel,
  formatLimit,
  getMemberLimit,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { devLog, devWarn } from "@/lib/devConsole";
import { colors } from "@/theme/colors";

type Filter = "same-zone" | "all";

function MemberRow({
  member,
  isSelf,
  sameZone,
  canManage,
  busy,
  onToggleActive,
}: {
  member: Member;
  isSelf: boolean;
  sameZone: boolean;
  canManage: boolean;
  busy: boolean;
  onToggleActive: (member: Member) => void;
}) {
  const isAdmin = String(member.role ?? "").toLowerCase() === "administrator";
  const isActive = member.active !== false;
  return (
    <Card
      style={{
        marginBottom: 10,
        gap: 10,
        borderColor: isSelf ? colors.accent : colors.border,
        opacity: isActive ? 1 : 0.78,
      }}
    >
      <View style={{ flexDirection: "row", gap: 14 }}>
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
          {isAdmin ? (
            <ShieldCheck size={24} color={colors.accent} />
          ) : (
            <UserCircle2 size={28} color={colors.accent} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
              numberOfLines={1}
            >
              {member.name}
            </Text>
            {isSelf ? <Chip label="You" tone="default" /> : null}
          </View>
          {member.email ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}
              numberOfLines={1}
            >
              {member.email}
            </Text>
          ) : null}
          {member.address ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <MapPin size={12} color={colors.textDim} />
              <Text
                style={{ color: colors.textDim, fontSize: 12, flex: 1 }}
                numberOfLines={1}
              >
                {member.address}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip label={isAdmin ? "Administrator" : "Member"} tone="muted" />
        <Chip
          label={isActive ? "Active" : "Inactive"}
          tone={isActive ? "success" : "danger"}
        />
        {member.zone_id ? (
          <Chip
            label={member.zone_id}
            tone={sameZone ? "default" : "muted"}
          />
        ) : (
          <Chip label="No network ID" tone="muted" />
        )}
      </View>

      {canManage ? (
        <Button
          label={isActive ? "Deactivate user" : "Activate user"}
          variant={isActive ? "danger" : "outline"}
          size="sm"
          loading={busy}
          onPress={() => onToggleActive(member)}
          leftIcon={
            isActive ? (
              <UserX size={16} color={colors.danger} />
            ) : (
              <UserCheck size={16} color={colors.text} />
            )
          }
        />
      ) : null}
    </Card>
  );
}

export default function MembersScreen() {
  const { user, ownerZoneId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("same-zone");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMembers();
      if (result.error) {
        setError(result.error);
        return;
      }
      const rows = result.data ?? [];
      devLog("Members: loaded", {
        count: rows.length,
        myZoneId: user?.zoneId ?? null,
      });
      setMembers(rows);
    } finally {
      setLoading(false);
    }
  }, [user?.zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountType = useMemo(
    () => normalizeAccountType(user?.accountType, user?.account_type),
    [user?.accountType, user?.account_type],
  );
  const memberLimit = useMemo(() => getMemberLimit(accountType), [accountType]);
  // Members on the same account share the administrator's zone id, so prefer
  // the resolved ownerZoneId from the auth context (admins: their own value;
  // invited users: looked up from /owners/{id}).
  const myZoneId = (ownerZoneId || String(user?.zoneId ?? "")).trim();
  const myId = String(user?.id ?? "").trim();
  const isAdmin = String(user?.role ?? "").toLowerCase() === "administrator";

  const applyActiveChange = useCallback(
    (memberId: string, active: boolean) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, active } : m)),
      );
    },
    [],
  );

  const runToggleActive = useCallback(
    async (member: Member) => {
      const target = member.active === false;
      setPendingId(member.id);
      applyActiveChange(member.id, target);
      const result = await setMemberActive(member.id, target);
      setPendingId(null);
      if (result.error) {
        devWarn("Members: toggle active failed", {
          memberId: member.id,
          target,
          error: result.error,
        });
        applyActiveChange(member.id, !target);
        Alert.alert(
          "Could not update member",
          /admin|403|forbidden/i.test(result.error)
            ? "Only administrators can change active status."
            : result.error,
        );
        return;
      }
      devLog("Members: active state updated", {
        memberId: member.id,
        active: target,
      });
    },
    [applyActiveChange],
  );

  const onToggleActive = useCallback(
    (member: Member) => {
      if (!isAdmin || pendingId) return;
      const willActivate = member.active === false;
      const verb = willActivate ? "Activate" : "Deactivate";
      const detail = willActivate
        ? `${member.name} will be able to sign in again.`
        : `${member.name} will be signed out and unable to log in until reactivated.`;
      Alert.alert(`${verb} member?`, detail, [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: willActivate ? "default" : "destructive",
          onPress: () => void runToggleActive(member),
        },
      ]);
    },
    [isAdmin, pendingId, runToggleActive],
  );

  const sameZoneMembers = useMemo(() => {
    if (!myZoneId) return members;
    return members.filter((m) => String(m.zone_id ?? "") === myZoneId);
  }, [members, myZoneId]);

  const visible = filter === "same-zone" ? sameZoneMembers : members;

  const subtitle = useMemo(() => {
    const inZone = sameZoneMembers.length;
    if (filter === "same-zone") {
      return myZoneId
        ? `${myZoneId} · ${formatLimit(inZone, memberLimit)} members`
        : `${visible.length} member${visible.length === 1 ? "" : "s"}`;
    }
    return `${members.length} member${members.length === 1 ? "" : "s"} on this account`;
  }, [filter, sameZoneMembers.length, memberLimit, myZoneId, members.length, visible.length]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Members"
          subtitle={subtitle}
          right={<AlertBellButton />}
        />

        <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              borderColor: "rgba(255,179,71,0.3)",
              backgroundColor: "rgba(255,179,71,0.06)",
            }}
          >
            <AlertTriangle size={18} color={colors.warning} />
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                lineHeight: 18,
                flex: 1,
              }}
            >
              {accountTypeLabel(accountType)} account
              {Number.isFinite(memberLimit)
                ? ` · up to ${memberLimit} member${memberLimit === 1 ? "" : "s"} per account`
                : " · unlimited members"}
              . Each user shares zones defined by the account owner.
              {isAdmin
                ? " As administrator you can activate or deactivate other members in your zone — inactive users cannot sign in."
                : ""}
            </Text>
          </Card>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setFilter("same-zone")}
            >
              <Chip
                label={myZoneId ? "Same zone" : "Same zone (none)"}
                tone="muted"
                active={filter === "same-zone"}
                style={{ opacity: myZoneId ? 1 : 0.6 }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setFilter("all")}
            >
              <Chip label="All members" tone="muted" active={filter === "all"} />
            </TouchableOpacity>
          </View>
        </View>

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
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const sameZone =
                !!myZoneId && String(item.zone_id ?? "") === myZoneId;
              const isSelf = myId !== "" && item.id === myId;
              // Admins manage other members in their own zone only. Don't show
              // the toggle on yourself (use logout/account flows for that) or
              // on rows that belong to a different account/zone.
              const canManage =
                isAdmin && !isSelf && sameZone && !!item.zone_id;
              return (
                <MemberRow
                  member={item}
                  isSelf={isSelf}
                  sameZone={sameZone}
                  canManage={canManage}
                  busy={pendingId === item.id}
                  onToggleActive={onToggleActive}
                />
              );
            }}
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
                  {filter === "same-zone" && myZoneId
                    ? `No members share zone ${myZoneId} yet.`
                    : "No members found for your account."}
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

