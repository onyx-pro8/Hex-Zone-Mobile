import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, MapPin, UserCircle2, X } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  getMembers,
  setMemberAccountType,
  setMemberActive,
  setMemberRole,
  type Member,
} from "@/api/members";
import {
  accountTypeLabel,
  ADMIN_ASSIGNABLE_ACCOUNT_TYPES,
  formatLimit,
  getMemberLimit,
  isSystemAdministrator,
  normalizeAccountType,
  toApiAccountType,
  type NormalizedAccountType,
} from "@/lib/accountLimits";
import { useResolvedAvatarUri } from "@/lib/resolveAvatarUri";
import { initialsForUser } from "@/components/ui/ProfileAvatarButton";
import { useWebSocket } from "@/hooks/useWebSocket";
import { parseMemberPresenceSocketEvent } from "@/lib/messageSocket";
import { toast } from "@/lib/toast";
import { devLog } from "@/lib/devConsole";
import { colors } from "@/theme/colors";

type Filter = "same-zone" | "all";

function MemberAvatar({ member }: { member: Member }) {
  const uri = useResolvedAvatarUri(member.avatar_url);
  const initials = initialsForUser(member.name, member.email);
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
  onPress,
}: {
  member: Member;
  isSelf: boolean;
  sameZone: boolean;
  onPress?: () => void;
}) {
  const isActive = member.active !== false;
  const memberAccountType = normalizeAccountType(member.account_type);
  const memberAccountTypeText = isSystemAdministrator({
    role: member.role,
    accountType: member.account_type,
  })
    ? `${accountTypeLabel(memberAccountType)} (System Admin)`
    : accountTypeLabel(memberAccountType);

  const content = (
    <Card
      style={{
        marginBottom: 10,
        gap: 10,
        borderColor: isSelf ? colors.accent : colors.border,
        opacity: isActive ? 1 : 0.78,
      }}
    >
      <View style={{ flexDirection: "row", gap: 14 }}>
        <MemberAvatar member={member} />
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

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {content}
    </Pressable>
  );
}

function ManageMemberModal({
  member,
  visible,
  busy,
  onClose,
  onSave,
}: {
  member: Member | null;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (next: {
    accountType: NormalizedAccountType;
    role: "administrator" | "user";
    active: boolean;
  }) => void;
}) {
  const [accountType, setAccountType] = useState<NormalizedAccountType>("EXCLUSIVE");
  const [role, setRole] = useState<"administrator" | "user">("user");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!member) return;
    setAccountType(normalizeAccountType(member.account_type));
    setRole(
      String(member.role ?? "").toLowerCase() === "administrator"
        ? "administrator"
        : "user",
    );
    setActive(member.active !== false);
  }, [member]);

  if (!member) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 44, 92, 0.35)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Pressable
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
          onPress={busy ? undefined : onClose}
        />
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            gap: 12,
            maxWidth: 400,
            width: "100%",
            alignSelf: "center",
            shadowColor: "#0F2C5C",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
              Manage member
            </Text>
            <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
              <X size={20} color={colors.accent} />
            </Pressable>
          </View>

          <View>
            <Text
              style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
              numberOfLines={1}
            >
              {member.name}
            </Text>
            {member.email ? (
              <Text
                style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {member.email}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Role
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  { value: "administrator" as const, label: "Administrator" },
                  { value: "user" as const, label: "User" },
                ] as const
              ).map((option) => {
                const selected = role === option.value;
                return (
                  <Pressable
                    key={option.value}
                    disabled={busy}
                    onPress={() => setRole(option.value)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      backgroundColor: selected
                        ? colors.accent
                        : colors.bgSurface,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? "#fff" : colors.text,
                        fontWeight: "700",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Account type
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ADMIN_ASSIGNABLE_ACCOUNT_TYPES.map((option) => {
                const selected = accountType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    disabled={busy}
                    onPress={() => setAccountType(option.value)}
                    style={{
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      backgroundColor: selected
                        ? colors.accent
                        : colors.bgSurface,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? "#fff" : colors.text,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Active status
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                disabled={busy}
                onPress={() => setActive(true)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 9,
                  alignItems: "center",
                  backgroundColor: active ? colors.accent : colors.bgSurface,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.border,
                }}
              >
                <Text
                  style={{
                    color: active ? "#fff" : colors.text,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Active
                </Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => setActive(false)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 9,
                  alignItems: "center",
                  backgroundColor: !active ? colors.danger : colors.bgSurface,
                  borderWidth: 1,
                  borderColor: !active ? colors.danger : colors.border,
                }}
              >
                <Text
                  style={{
                    color: !active ? "#fff" : colors.text,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Inactive
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                variant="ghost"
                size="sm"
                onPress={onClose}
                disabled={busy}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={busy ? "Saving…" : "Save"}
                size="sm"
                onPress={() => onSave({ accountType, role, active })}
                disabled={busy}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function MembersScreen() {
  const { user, token, ownerZoneId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("same-zone");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [managing, setManaging] = useState<Member | null>(null);

  const { lastMessage } = useWebSocket({
    token,
    zoneIds: [],
    enabled: Boolean(token),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMembers();
      if (result.error) {
        toast.error(result.error);
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

  useEffect(() => {
    if (!lastMessage) return;
    const evt = parseMemberPresenceSocketEvent(lastMessage);
    if (!evt) return;
    const ownerKey = String(evt.ownerId);
    setMembers((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (row.id !== ownerKey) return row;
        if (row.online === evt.online) return row;
        changed = true;
        return { ...row, online: evt.online };
      });
      return changed ? next : prev;
    });
  }, [lastMessage]);

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

  const onSaveManagedMember = useCallback(
    async (next: {
      accountType: NormalizedAccountType;
      role: "administrator" | "user";
      active: boolean;
    }) => {
      if (!managing) return;
      const member = managing;
      const apiType = toApiAccountType(next.accountType);
      const prevType = String(member.account_type ?? "");
      const prevRole =
        String(member.role ?? "").toLowerCase() === "administrator"
          ? ("administrator" as const)
          : ("user" as const);
      const prevActive = member.active !== false;

      setPendingId(member.id);
      setMembers((prev) =>
        prev.map((row) =>
          row.id === member.id
            ? {
                ...row,
                account_type: apiType,
                role: next.role,
                active: next.active,
              }
            : row,
        ),
      );

      const typeChanged =
        normalizeAccountType(member.account_type) !== next.accountType;
      const roleChanged = prevRole !== next.role;
      const activeChanged = prevActive !== next.active;

      if (roleChanged) {
        const roleRes = await setMemberRole(member.id, next.role);
        if (roleRes.error) {
          setPendingId(null);
          setMembers((prev) =>
            prev.map((row) =>
              row.id === member.id
                ? {
                    ...row,
                    account_type: prevType,
                    role: prevRole,
                    active: prevActive,
                  }
                : row,
            ),
          );
          toast.error(roleRes.error, { title: "Could not update role" });
          return;
        }
      }

      if (typeChanged) {
        const typeRes = await setMemberAccountType(member.id, apiType);
        if (typeRes.error) {
          setPendingId(null);
          setMembers((prev) =>
            prev.map((row) =>
              row.id === member.id
                ? {
                    ...row,
                    account_type: prevType,
                    role: roleChanged ? next.role : prevRole,
                    active: prevActive,
                  }
                : row,
            ),
          );
          toast.error(typeRes.error, { title: "Could not update account type" });
          return;
        }
      }

      if (activeChanged) {
        const activeRes = await setMemberActive(member.id, next.active);
        if (activeRes.error) {
          setPendingId(null);
          setMembers((prev) =>
            prev.map((row) =>
              row.id === member.id
                ? {
                    ...row,
                    account_type: typeChanged ? apiType : prevType,
                    role: roleChanged ? next.role : prevRole,
                    active: prevActive,
                  }
                : row,
            ),
          );
          toast.error(
            /admin|403|forbidden/i.test(activeRes.error)
              ? "Only administrators can change active status."
              : activeRes.error,
            { title: "Could not update active status" },
          );
          return;
        }
      }

      setPendingId(null);
      setManaging(null);
      toast.success("Member updated.");
      devLog("Members: managed member updated", {
        memberId: member.id,
        accountType: apiType,
        role: next.role,
        active: next.active,
      });
    },
    [managing],
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
              {isSystemAdmin
                ? " Open All members and tap a user to change their role, account type, or active status. Inactive users cannot sign in."
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
              const sameZone =
                !!myZoneId && String(item.zone_id ?? "") === myZoneId;
              const isSelf = myId !== "" && item.id === myId;
              const canOpenManage =
                isSystemAdmin && filter === "all" && !isSelf;
              return (
                <MemberRow
                  member={item}
                  isSelf={isSelf}
                  sameZone={sameZone}
                  onPress={
                    canOpenManage
                      ? () => setManaging(item)
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

        <ManageMemberModal
          member={managing}
          visible={managing != null}
          busy={pendingId != null}
          onClose={() => {
            if (pendingId) return;
            setManaging(null);
          }}
          onSave={(next) => void onSaveManagedMember(next)}
        />
      </SafeAreaView>
    </GradientBackground>
  );
}
