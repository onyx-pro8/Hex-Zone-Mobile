import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { alertCopyResult, copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import {
  CalendarRange,
  Check,
  Copy,
  Link as LinkIcon,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Ticket,
  UserCheck,
  X,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  parseGuestRequestChangedSocketEvent,
} from "@/lib/messageSocket";
import {
  approveGuestRequest,
  createGuestAccessQrToken,
  fetchNetworkAccessQrToken,
  generateMemberInviteQr,
  getGuestAccessQrLink,
  getGuestAccessQrTokenLink,
  guestRequestShowsApprovalActions,
  listGuestAccessQrTokens,
  listGuestRequests,
  rejectGuestRequest,
  revokeGuestAccessQrToken,
  toAccessDeepLink,
  type GuestAccessQrToken,
  type GuestRequest,
} from "@/api/guest";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { devLog } from "@/lib/devConsole";
import { presentLocalMessageNotification } from "@/lib/notifications";
import {
  canAdministratorInviteUserMember,
  memberInviteUnavailableHint,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { colors } from "@/theme/colors";

type Tab = "member" | "guest";

type ExpiryHours = number | null;

const EXPIRY_OPTIONS: { label: string; hours: ExpiryHours }[] = [
  { label: "1 h", hours: 1 },
  { label: "24 h", hours: 24 },
  { label: "7 d", hours: 24 * 7 },
  { label: "30 d", hours: 24 * 30 },
  { label: "∞", hours: null },
];

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.bgSurface,
        borderRadius: 14,
        padding: 4,
        marginHorizontal: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 4,
      }}
    >
      {(["member", "guest"] as Tab[]).map((value) => {
        const active = tab === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: active ? colors.accent : colors.bgCard,
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.border,
            }}
          >
            <Text
              style={{
                color: active ? "#fff" : colors.text,
                fontWeight: "700",
                fontSize: 13,
                letterSpacing: 0.4,
              }}
            >
              {value === "member" ? "Member invite" : "Guest access"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QrPreview({ value, label }: { value: string | null; label?: string }) {
  if (!value) {
    return (
      <View
        style={{
          alignItems: "center",
          paddingVertical: 28,
          gap: 8,
        }}
      >
        <QrCode size={42} color={colors.textDim} />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {label ?? "Tap Generate to mint a QR code"}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: "center", marginTop: 12, gap: 12 }}>
      <View
        style={{
          padding: 16,
          borderRadius: 18,
          backgroundColor: "#fff",
        }}
      >
        <QRCode value={value} size={200} />
      </View>
      <Pressable
        onPress={() => {
          void copyToClipboard(value).then((result) =>
            alertCopyResult(result, value),
          );
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Copy size={14} color={colors.accent} />
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
          Copy link
        </Text>
      </Pressable>
      <Text
        selectable
        style={{
          color: colors.textDim,
          fontSize: 11,
          textAlign: "center",
          paddingHorizontal: 16,
        }}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

function MemberInviteSection({
  disabled,
  unavailableHint,
}: {
  disabled: boolean;
  unavailableHint: string;
}) {
  const [hours, setHours] = useState<ExpiryHours>(24);
  const [generated, setGenerated] = useState<{
    token: string;
    url: string;
    expires_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const onGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await generateMemberInviteQr({ expires_in_hours: hours });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Could not generate invite QR.");
      }
      setGenerated({
        token: result.data.token,
        url: result.data.url,
        expires_at: result.data.expires_at ?? null,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate QR.",
      );
    } finally {
      setLoading(false);
    }
  }, [hours]);

  return (
    <Card glow style={{ gap: 14 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: "700",
        }}
      >
        Member invite link
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 18 }}>
        Timed links (1 h, 24 h, 7 d, 30 d) are single-use. ∞ never expires and
        can be scanned by multiple members — use that for a printed outdoor sign.
        Joins still stop when this account reaches its member limit.
      </Text>

      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
        Token expiry
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {EXPIRY_OPTIONS.map((opt) => (
          <Pressable key={opt.label} onPress={() => setHours(opt.hours)}>
            <Chip
              label={opt.label}
              active={hours === opt.hours}
            />
          </Pressable>
        ))}
      </View>

      <QrPreview
        value={generated?.url ?? null}
        label="Generate to encode a join URL into a QR"
      />
      {generated ? (
        <Text style={{ color: colors.textDim, fontSize: 11, textAlign: "center" }}>
          {generated.expires_at
            ? `Single-use · expires ${new Date(generated.expires_at).toLocaleString()}`
            : "Multi-use · does not expire"}
        </Text>
      ) : null}

      <Button
        label={generated ? "Generate new link" : "Generate link"}
        variant="primary"
        onPress={() => void onGenerate()}
        loading={loading}
        leftIcon={<LinkIcon size={16} color="#fff" />}
        disabled={disabled}
        fullWidth
      />
      {disabled ? (
        <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 18 }}>
          {unavailableHint}
        </Text>
      ) : null}
    </Card>
  );
}

function GuestAccessSection({
  zoneId,
  candidateZoneIds = [],
  zonesLoading = false,
  onPickZoneId = () => {},
  onRefreshZones = () => {},
}: {
  zoneId: string;
  candidateZoneIds?: string[];
  zonesLoading?: boolean;
  onPickZoneId?: (next: string) => void;
  onRefreshZones?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [eventId, setEventId] = useState("");
  const [hours, setHours] = useState<ExpiryHours>(24 * 7);
  const [generated, setGenerated] = useState<{
    url: string;
    token: string;
    id: number | null;
  } | null>(null);
  const [tokens, setTokens] = useState<GuestAccessQrToken[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refreshTokens = useCallback(async () => {
    if (!zoneId) return;
    setLoadingList(true);
    try {
      const result = await listGuestAccessQrTokens({
        zone_id: zoneId,
        include_revoked: false,
      });
      setTokens(result.data ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  const onGenerate = useCallback(async () => {
    if (!zoneId) {
      toast.error("Set up a primary zone before generating guest QR.");
      return;
    }
    setSubmitting(true);
    try {
      const create = await createGuestAccessQrToken({
        zone_id: zoneId,
        ...(hours == null ? { expires_in_hours: 0 } : { expires_in_hours: hours }),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(eventId.trim() ? { event_id: eventId.trim() } : {}),
      });
      devLog("Access: create guest QR result", {
        zoneId,
        ok: !create.error && Boolean(create.data),
        error: create.error,
      });
      if (create.error || !create.data) {
        throw new Error(create.error ?? "Could not mint guest QR token.");
      }
      const urlFromPath = toAccessDeepLink(create.data.path_with_query);
      let url = urlFromPath;
      if (!url) {
        const link = await getGuestAccessQrLink({ zone_id: zoneId });
        url = toAccessDeepLink(link.data?.path_with_query);
      }
      if (!url) {
        throw new Error("Could not build the guest access link.");
      }
      setGenerated({ url, token: create.data.token, id: create.data.id });
      void refreshTokens();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate QR.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [zoneId, hours, label, eventId, refreshTokens]);

  const onPickToken = useCallback(
    async (id: number) => {
      const link = await getGuestAccessQrTokenLink(id, zoneId);
      if (link.error || !link.data) {
        toast.error(link.error ?? "Could not resolve token URL.", {
          title: "QR error",
        });
        return;
      }
      const url = toAccessDeepLink(link.data.path_with_query);
      if (!url) {
        toast.error("Could not build the guest access link.", {
          title: "QR error",
        });
        return;
      }
      setGenerated({ url, token: "", id });
    },
    [zoneId],
  );

  const onRevoke = useCallback(
    (id: number) => {
      Alert.alert("Revoke QR token", "Stops accepting new arrivals immediately.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            const res = await revokeGuestAccessQrToken(id, zoneId);
            if (res.error) {
              toast.error(res.error, { title: "Failed" });
              return;
            }
            void refreshTokens();
            if (generated?.id === id) setGenerated(null);
          },
        },
      ]);
    },
    [zoneId, refreshTokens, generated?.id],
  );

  return (
    <Card glow style={{ gap: 14 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: "700",
        }}
      >
        Guest access QR
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 18 }}>
        Mints a stored guest token and embeds it in an https link. Camera scan
        opens this app when it is installed (App Links), or a web page if not.
      </Text>

      {candidateZoneIds.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: "700",
              }}
            >
              Zone
            </Text>
            <Pressable onPress={onRefreshZones} hitSlop={8}>
              <RefreshCw size={14} color={colors.accent} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {candidateZoneIds.map((zid) => (
              <Pressable key={zid} onPress={() => onPickZoneId(zid)}>
                <Chip label={zid} active={zid === zoneId} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <TextInput
          placeholder="Label (optional)"
          placeholderTextColor={colors.textDim}
          value={label}
          onChangeText={setLabel}
          style={{
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 14,
          }}
        />
        <TextInput
          placeholder="Event ID (optional)"
          placeholderTextColor={colors.textDim}
          value={eventId}
          onChangeText={setEventId}
          style={{
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 14,
          }}
        />
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Token TTL</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EXPIRY_OPTIONS.map((opt) => (
            <Pressable key={opt.label} onPress={() => setHours(opt.hours)}>
              <Chip label={opt.label} active={hours === opt.hours} />
            </Pressable>
          ))}
        </View>
      </View>

      <QrPreview value={generated?.url ?? null} label="Generate to mint a guest URL" />

      <Button
        label={generated ? "Generate new link" : "Generate link"}
        variant="primary"
        onPress={() => void onGenerate()}
        loading={submitting}
        leftIcon={<LinkIcon size={16} color="#fff" />}
        disabled={!zoneId}
        fullWidth
      />
      {!zoneId ? (
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          {zonesLoading
            ? "Looking up your zones…"
            : "No network id is linked to this account yet. Create a zone on the Dashboard, then come back here."}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text
          style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}
        >
          Active guest tokens
        </Text>
        <Pressable onPress={() => void refreshTokens()} hitSlop={8}>
          <RefreshCw size={16} color={colors.accent} />
        </Pressable>
      </View>
      {loadingList ? (
        <ActivityIndicator color={colors.accent} />
      ) : tokens.length === 0 ? (
        <Text style={{ color: colors.textDim, fontSize: 12 }}>
          No active QR tokens for this zone.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {tokens.map((row) => (
            <View
              key={row.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.bgCard,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {row.label?.trim() || `Token ${row.token_suffix}`}
                </Text>
                <Text
                  style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}
                >
                  {row.expires_at
                    ? `Expires ${new Date(row.expires_at).toLocaleString()}`
                    : "No expiry"}
                  {row.max_uses != null
                    ? ` · ${row.use_count}/${row.max_uses} uses`
                    : ""}
                </Text>
              </View>
              <Pressable onPress={() => void onPickToken(row.id)} hitSlop={6}>
                <Chip label="Show" tone="default" />
              </Pressable>
              <Pressable onPress={() => onRevoke(row.id)} hitSlop={6}>
                <Chip label="Revoke" tone="danger" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function NetworkAccessSection({ zoneId }: { zoneId: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const res = await fetchNetworkAccessQrToken(zoneId);
      if (res.error || !res.data) {
        throw new Error(res.error ?? "Could not load network access QR.");
      }
      const next = toAccessDeepLink(res.data.path_with_query);
      if (!next) throw new Error("Could not build network access link.");
      setUrl(next);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load network QR.",
      );
      setUrl("");
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!zoneId) return null;

  return (
    <Card glow style={{ gap: 12 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: "700",
        }}
      >
        Network guest QR
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 18 }}>
        One reusable link per network. Guests request access; an administrator must approve before
        they can sign in. After approval they can use access messages (CHAT); map zones are optional.
      </Text>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {url ? (
        <View style={{ alignItems: "center", gap: 10 }}>
          <QRCode value={url} size={160} />
          <Pressable
            onPress={async () => {
              const ok = await copyToClipboard(url);
              alertCopyResult(ok);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Copy size={14} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 12 }}>Copy link</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
      <Button label="Refresh network QR" variant="secondary" onPress={() => void refresh()} />
    </Card>
  );
}

export default function AccessScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const {
    effectiveZoneId,
    accountZoneId,
    candidateZoneIds,
    zonesLoading,
    setPickedZoneId,
    refresh: refreshZones,
  } = useEffectiveZoneId();
  const [tab, setTab] = useState<Tab>("member");
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  // Track which pending arrivals we've already alerted on, and skip the first
  // load so we don't fire a burst of notifications for pre-existing requests.
  const notifiedRequestIdsRef = useRef<Set<string>>(new Set());
  const notifyPrimedRef = useRef(false);

  const { lastMessage, status: wsStatus } = useWebSocket({
    token,
    zoneIds: effectiveZoneId ? [effectiveZoneId] : [],
    enabled: Boolean(token && effectiveZoneId),
  });

  const params = useLocalSearchParams<{
    gt?: string;
    zid?: string;
    tab?: string;
    mode?: string;
  }>();

  useEffect(() => {
    const gt = typeof params.gt === "string" ? params.gt.trim() : "";
    const tabParam = typeof params.tab === "string" ? params.tab : "";
    const mode = typeof params.mode === "string" ? params.mode : "";
    if (gt || tabParam === "guest" || mode === "guest") {
      setTab("guest");
    }
  }, [params.gt, params.tab, params.mode]);

  const accountType = useMemo(
    () => normalizeAccountType(user?.accountType, user?.account_type),
    [user?.accountType, user?.account_type],
  );

  const memberInviteDisabled = useMemo(
    () =>
      !canAdministratorInviteUserMember({
        role: user?.role,
        accountType: user?.accountType,
        legacyAccountType: user?.account_type,
      }),
    [user],
  );

  const memberInviteHint = useMemo(
    () => memberInviteUnavailableHint(accountType),
    [accountType],
  );

  useEffect(() => {
    if (memberInviteDisabled) {
      setTab("guest");
    }
  }, [memberInviteDisabled]);

  const loadRequests = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const result = await listGuestRequests(effectiveZoneId);
      if (result.error) {
        setRequestsError(result.error);
        setRequests([]);
        return;
      }
      const rows = result.data ?? [];
      setRequests(rows);

      const pending = rows.filter(
        (r) => r.approval_status === "PENDING" || r.approval_status === "ARRIVED",
      );
      const fresh = pending.filter(
        (r) => !notifiedRequestIdsRef.current.has(r.id),
      );
      if (notifyPrimedRef.current && fresh.length > 0) {
        const title =
          fresh.length === 1
            ? "New guest request"
            : `${fresh.length} new guest requests`;
        const body =
          fresh.length === 1
            ? `${fresh[0]?.guest_name ?? "A guest"} is requesting access to this zone.`
            : "Several guests are requesting access to this zone.";
        void presentLocalMessageNotification({
          title,
          body,
          channelId: "messages",
          data: { event: "GUEST_ACCESS_REQUEST", zone_id: effectiveZoneId },
        });
      }
      for (const r of pending) notifiedRequestIdsRef.current.add(r.id);
      notifyPrimedRef.current = true;
    } finally {
      setLoadingRequests(false);
    }
  }, [effectiveZoneId]);

  // Reset notification de-dupe state when switching zones.
  useEffect(() => {
    notifiedRequestIdsRef.current = new Set();
    notifyPrimedRef.current = false;
  }, [effectiveZoneId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Poll so the admin is alerted to new arrivals while this screen is open —
  // only when the WebSocket is not connected.
  useEffect(() => {
    if (!effectiveZoneId) return;
    if (wsStatus === "open") return;
    const interval = setInterval(() => {
      void loadRequests();
    }, 20_000);
    return () => clearInterval(interval);
  }, [effectiveZoneId, loadRequests, wsStatus]);

  useEffect(() => {
    if (wsStatus === "open") void loadRequests();
  }, [wsStatus, loadRequests]);

  useEffect(() => {
    if (!lastMessage) return;
    const changed = parseGuestRequestChangedSocketEvent(lastMessage);
    if (changed) {
      if (
        changed.zone_id &&
        effectiveZoneId &&
        changed.zone_id !== effectiveZoneId
      ) {
        return;
      }
      void loadRequests();
      return;
    }
    try {
      const parsed = JSON.parse(lastMessage) as { type?: string };
      if (
        parsed.type === "unexpected_guest" ||
        parsed.type === "guest_is_here" ||
        parsed.type === "PERMISSION_MESSAGE"
      ) {
        void loadRequests();
      }
    } catch {
      /* ignore */
    }
  }, [lastMessage, loadRequests, effectiveZoneId]);

  const onApprove = async (requestId: string) => {
    const result = await approveGuestRequest(requestId, effectiveZoneId);
    if (result.error) {
      toast.error(result.error, { title: "Approve failed" });
      return;
    }
    void loadRequests();
  };

  const onReject = async (requestId: string) => {
    const result = await rejectGuestRequest(requestId, effectiveZoneId);
    if (result.error) {
      toast.error(result.error, { title: "Reject failed" });
      return;
    }
    void loadRequests();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <AppHeader
            title="Access"
            subtitle="QR invites & guest arrivals"
          />

          <SegmentedTabs tab={tab} onChange={setTab} />

          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            {tab === "member" ? (
              <MemberInviteSection
                disabled={memberInviteDisabled}
                unavailableHint={memberInviteHint}
              />
            ) : (
              <>
                <NetworkAccessSection zoneId={effectiveZoneId} />
              </>
            )}

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

            <Pressable onPress={() => router.push("/(tabs)/guest-schedules")}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <CalendarRange size={24} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    Guest schedules
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Pre-approve expected guest time windows
                  </Text>
                </View>
              </Card>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(tabs)/guest-arrival-messages")}
            >
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <MessageSquareText size={24} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    Arrival messages
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Set the &quot;expected&quot; and &quot;waiting for approval&quot; wording
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

            {requestsError ? (
              <Card>
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {requestsError}
                </Text>
              </Card>
            ) : null}

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
                <Card key={req.id} style={{ marginBottom: 10 }}>
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
                  {guestRequestShowsApprovalActions(req) ? (
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
                        onPress={() => void onApprove(req.id)}
                        leftIcon={<Check size={14} color="#fff" />}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Reject"
                        size="sm"
                        variant="danger"
                        onPress={() => void onReject(req.id)}
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
