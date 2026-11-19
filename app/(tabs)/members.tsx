import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, MapPin, UserCircle2 } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import {
  getMembers,
  listNetworkAdmins,
  setMemberActive,
  type Member,
} from "@/api/members";
import {
  accountTypeLabel,
  formatLimit,
  getMemberLimit,
  isSystemAdministrator,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { useResolvedAvatarUri } from "@/lib/resolveAvatarUri";
import { initialsForUser } from "@/components/ui/ProfileAvatarButton";
import {
  memberPresenceSnapshot,
  subscribeRealtimeMessages,
  useWebSocket,
} from "@/hooks/useWebSocket";
import { parseMemberPresenceSocketEvent } from "@/lib/messageSocket";
import { toast } from "@/lib/toast";
import { devLog } from "@/lib/devConsole";
import { colors } from "@/theme/colors";

type Filter = "same-zone" | "all" | "admins";

function sameNetwork(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return Boolean(a) && a === b;
}

function MemberAvatar({ member }: { member: Member }) {
  const uri = useResolvedAvatarUri(member.avatar_url);
  const initials = initialsForUser(member.name, member.username ?? member.email);
  const isOnline = member.online === true;

  return (
    <View style={{ width: 48, height: 48 }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: 48, height: 48, borderRadius: 24 }}
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: "#C8DFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initials ? (
            <Text
              style={{
                color: colors.accentDeep,
                fontWeight: "800",
                fontSize: 14,
              }}
            >
              {initials}
            </Text>
          ) : (
            <UserCircle2 size={28} color={colors.accent} />
          )}
        </View>
      )}
      <View
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: isOnline ? "#22C55E" : "#EF4444",
          borderWidth: 2,
          borderColor: "#fff",
        }}
        accessibilityLabel={isOnline ? "Online" : "Offline"}
      />
    </View>
  );
}

function MemberRow({
  member,
  isSelf,
  sameZone,
  onActiveChange,
  activeBusy,
}: {
  member: Member;
  isSelf: boolean;
  sameZone: boolean;
  onActiveChange?: (next: boolean) => void;
  activeBusy?: boolean;
}) {
  const isActive = member.active !== false;
  const memberAccountType = normalizeAccountType(member.account_type);
  const memberAccountTypeText = isSystemAdministrator({
    role: member.role,
    accountType: member.account_type,
  })
    ? `${accountTypeLabel(memberAccountType)} (System Admin)`
    : accountTypeLabel(memberAccountType);

  return (
    <Card
      style={{
        marginBottom: 10,
        gap: 10,
        borderColor: isSelf ? colors.accent : colors.border,
        opacity: isActive ? 1 : 0.78,
      }}
    >
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <MemberAvatar member={member} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 }}
              numberOfLines={1}
            >
              {member.name}
            </Text>
            {isSelf ? <Chip label="You" tone="default" /> : null}
          </View>
          {member.username ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}
              numberOfLines={1}
            >
              @{member.username}
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
        {onActiveChange ? (
          <Switch
            value={isActive}
            disabled={activeBusy}
            onValueChange={onActiveChange}
            trackColor={{ false: "#CBD5E1", true: colors.accent }}
            thumbColor="#ffffff"
            accessibilityLabel={
              isActive
                ? `${member.name} can sign in`
                : `${member.name} cannot sign in`
            }
          />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip label={memberAccountTypeText} tone="muted" />
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
    </Card>
  );
}


function applyLivePresence(rows: Member[]): Member[] {
  const live = memberPresenceSnapshot();
  if (live.size === 0) return rows;
  let changed = false;
  const next = rows.map((row) => {
    const id = Number(row.id);
    if (!live.has(id)) return row;
    const online = live.get(id) === true;
    if (row.online === online) return row;
    changed = true;
    return { ...row, online };
  });
  return changed ? next : rows;
}

export default function MembersScreen() {
  const { user, token, ownerZoneId } = useAuth();
  const { status: socketStatus } = useWebSocket({
    token,
    zoneIds: [],
    enabled: Boolean(token),
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [networkAdmins, setNetworkAdmins] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("same-zone");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getMembers();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const rows = result.data ?? [];
      if (
        isSystemAdministrator({
          role: user?.role,
          accountType: user?.accountType ?? user?.account_type,
        })
      ) {
        const admins = await listNetworkAdmins();
        if (!admins.error) setNetworkAdmins(applyLivePresence(admins.data ?? []));
      } else {
        setNetworkAdmins([]);
      }
      devLog("Members: loaded", {
        count: rows.length,
        myZoneId: user?.zoneId ?? null,
      });
      setMembers(applyLivePresence(rows));
    } finally {
      setLoading(false);
    }
  }, [user?.zoneId, user?.role, user?.accountType, user?.account_type]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (socketStatus !== "open") return;
    void load(true);
  }, [socketStatus, load]);

  useEffect(() => {
    return subscribeRealtimeMessages((raw) => {
      const evt = parseMemberPresenceSocketEvent(raw);
      if (!evt) return;
      const ownerKey = String(evt.ownerId);
      const patch = (prev: Member[]) => {
        let changed = false;
        const next = prev.map((row) => {
          if (row.id !== ownerKey) return row;
          if (row.online === evt.online) return row;
          changed = true;
          return { ...row, online: evt.online };
        });
        return changed ? next : prev;
      };
      setMembers(patch);
      setNetworkAdmins(patch);
    });
  }, []);

  const accountType = useMemo(
    () => normalizeAccountType(user?.accountType, user?.account_type),
    [user?.accountType, user?.account_type],
  );
  const tierLevel = user?.tierLevel ?? user?.tier_level ?? null;
  const memberLimit = useMemo(
    () => getMemberLimit(accountType, tierLevel),
    [accountType, tierLevel],
  );
  const myZoneId = (ownerZoneId || String(user?.zoneId ?? "")).trim();
  const myId = String(user?.id ?? "").trim();
  const isSystemAdmin = isSystemAdministrator({
    role: user?.role,
    accountType: user?.accountType ?? user?.account_type,
  });

  useEffect(() => {
    if (!isSystemAdmin && filter === "all") {
      setFilter("same-zone");
    }
  }, [isSystemAdmin, filter]);

  const toggleMemberActive = useCallback(async (member: Member, next: boolean) => {
    const previous = member.active !== false;
    if (next === previous || pendingId) return;
    setPendingId(member.id);
    const apply = (rows: Member[]) =>
      rows.map((row) => (row.id === member.id ? { ...row, active: next } : row));
    setMembers(apply);
    setNetworkAdmins(apply);
    const result = await setMemberActive(member.id, next);
    setPendingId(null);
    if (result.error) {
      const revert = (rows: Member[]) =>
        rows.map((row) =>
          row.id === member.id ? { ...row, active: previous } : row,
        );
      setMembers(revert);
      setNetworkAdmins(revert);
      toast.error(result.error);
      return;
    }
    toast.success(next ? `${member.name} can sign in.` : `${member.name} cannot sign in.`);
  }, [pendingId]);

  const sameZoneMembers = useMemo(() => {
    if (!myZoneId) return members;
    return members.filter((m) => sameNetwork(m.zone_id, myZoneId));
  }, [members, myZoneId]);

  const visible =
    filter === "admins"
      ? networkAdmins
      : filter === "same-zone"
        ? sameZoneMembers
        : members;

  const subtitle = useMemo(() => {
    const inZone = sameZoneMembers.length;
    if (filter === "same-zone") {
      return myZoneId
        ? `${myZoneId} · ${formatLimit(inZone, memberLimit)} members`
        : `${visible.length} member${visible.length === 1 ? "" : "s"}`;
    }
    return `${members.length} member${members.length === 1 ? "" : "s"} platform-wide`;
  }, [
    filter,
    sameZoneMembers.length,
    memberLimit,
    myZoneId,
    members.length,
    visible.length,
  ]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <AppHeader title="Members" subtitle={subtitle} />

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
              {accountType === "ENHANCED_PLUS" && tierLevel != null
                ? ` · Level ${tierLevel}`
                : ""}
              {Number.isFinite(memberLimit)
                ? ` · up to ${memberLimit} member${memberLimit === 1 ? "" : "s"} per account`
                : " · unlimited members"}
              .
              {String(user?.role ?? "").toLowerCase() === "administrator"
                ? " Use the switch on a member to allow or block sign-in. Role and account type cannot be changed here."
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
            {isSystemAdmin ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setFilter("all")}
              >
                <Chip
                  label="All members"
                  tone="muted"
                  active={filter === "all"}
                />
              </TouchableOpacity>
            ) : null}
            {isSystemAdmin ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setFilter("admins")}
              >
                <Chip
                  label="Network admins"
                  tone="muted"
                  active={filter === "admins"}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {loading && members.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const sameZone = sameNetwork(item.zone_id, myZoneId);
              const isSelf = myId !== "" && item.id === myId;
              const canToggle =
                String(user?.role ?? "").toLowerCase() === "administrator" &&
                !isSelf;
              return (
                <MemberRow
                  member={item}
                  isSelf={isSelf}
                  sameZone={sameZone}
                  activeBusy={pendingId === item.id}
                  onActiveChange={
                    canToggle
                      ? (next) => {
                          void toggleMemberActive(item, next);
                        }
                      : undefined
                  }
                />
              );
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 110,
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
                  {filter === "same-zone" && myZoneId
                    ? `No members share zone ${myZoneId} yet.`
                    : "No members found."}
                </Text>
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}
