import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Check,
  Copy,
  Link as LinkIcon,
  QrCode,
  RefreshCw,
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
  createGuestAccessQrToken,
  generateMemberInviteQr,
  getGuestAccessQrLink,
  getGuestAccessQrTokenLink,
  listGuestAccessQrTokens,
  listGuestRequests,
  rejectGuestRequest,
  revokeGuestAccessQrToken,
  toAccessDeepLink,
  type GuestAccessQrToken,
  type GuestRequest,
} from "@/api/guest";
import { getZones, type SavedZone } from "@/api/zones";
import { devLog } from "@/lib/devConsole";
import { colors } from "@/theme/colors";

type Tab = "member" | "guest";

const EXPIRY_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 h", hours: 1 },
  { label: "24 h", hours: 24 },
  { label: "7 d", hours: 24 * 7 },
  { label: "30 d", hours: 24 * 30 },
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

function MemberInviteSection({ disabled }: { disabled: boolean }) {
  const [hours, setHours] = useState<number>(24);
  const [generated, setGenerated] = useState<{
    token: string;
    url: string;
    expires_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateMemberInviteQr({ expires_in_hours: hours });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Could not generate invite QR.");
      }
      setGenerated({
        token: result.data.token,
        url: result.data.url,
        expires_at: result.data.expires_at,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate QR.");
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
        Generates a single-use registration link your invitee can open to join
        your account (Private / Exclusive admin only).
      </Text>

      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
        Token expiry
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {EXPIRY_OPTIONS.map((opt) => (
          <Pressable key={opt.hours} onPress={() => setHours(opt.hours)}>
            <Chip label={opt.label} active={hours === opt.hours} />
          </Pressable>
        ))}
      </View>

      <QrPreview
        value={generated?.url ?? null}
        label="Generate to encode a join URL into a QR"
      />
      {generated ? (
        <Text style={{ color: colors.textDim, fontSize: 11, textAlign: "center" }}>
          Expires {new Date(generated.expires_at).toLocaleString()}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
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
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          Member invite QR is only available to administrators of Private and
          Exclusive accounts.
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
  const [hours, setHours] = useState<number>(24 * 7);
  const [generated, setGenerated] = useState<{
    url: string;
    token: string;
    id: number | null;
  } | null>(null);
  const [tokens, setTokens] = useState<GuestAccessQrToken[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Set up a primary zone before generating guest QR.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const create = await createGuestAccessQrToken({
        zone_id: zoneId,
        expires_in_hours: hours,
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
      setError(err instanceof Error ? err.message : "Could not generate QR.");
    } finally {
      setSubmitting(false);
    }
  }, [zoneId, hours, label, eventId, refreshTokens]);

  const onPickToken = useCallback(
    async (id: number) => {
      const link = await getGuestAccessQrTokenLink(id, zoneId);
      if (link.error || !link.data) {
        Alert.alert("QR error", link.error ?? "Could not resolve token URL.");
        return;
      }
      const url = toAccessDeepLink(link.data.path_with_query);
      if (!url) {
        Alert.alert("QR error", "Could not build the guest access link.");
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
              Alert.alert("Failed", res.error);
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
        Mints a stored guest token and embeds it in a deep link for this app.
        Guests scan and arrive into your zone; revoke anytime.
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
            <Pressable key={opt.hours} onPress={() => setHours(opt.hours)}>
              <Chip label={opt.label} active={hours === opt.hours} />
            </Pressable>
          ))}
        </View>
      </View>

      <QrPreview value={generated?.url ?? null} label="Generate to mint a guest URL" />

      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
      ) : null}

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
            : "No zone id is linked to this account yet. Create a zone on the Dashboard, then come back here."}
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

export default function AccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const accountZoneId = user?.zoneId ?? "";
  const [tab, setTab] = useState<Tab>("member");
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [savedZones, setSavedZones] = useState<SavedZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [pickedZoneId, setPickedZoneId] = useState<string>("");

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

  const memberInviteDisabled = useMemo(() => {
    const role = String(user?.role ?? "").toLowerCase();
    if (role !== "administrator") return true;
    const accountType = String(
      user?.accountType ?? user?.account_type ?? "",
    ).toUpperCase();
    return !(accountType === "PRIVATE" || accountType === "EXCLUSIVE");
  }, [user]);

  const refreshZones = useCallback(async () => {
    setZonesLoading(true);
    try {
      const result = await getZones();
      const rows = result.data ?? [];
      setSavedZones(rows);
      devLog("Access: loaded zones", {
        count: rows.length,
        zone_ids: rows.map((z) => z.zone_id).filter(Boolean),
        error: result.error,
      });
    } finally {
      setZonesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshZones();
  }, [refreshZones]);

  const candidateZoneIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: unknown) => {
      if (raw == null) return;
      const str = String(raw).trim();
      if (!str || seen.has(str)) return;
      seen.add(str);
      out.push(str);
    };
    push(accountZoneId);
    for (const z of savedZones) push(z.zone_id);
    return out;
  }, [accountZoneId, savedZones]);

  const effectiveZoneId =
    pickedZoneId || accountZoneId || candidateZoneIds[0] || "";

  useEffect(() => {
    devLog("Access: effective zone id", {
      effectiveZoneId,
      accountZoneId,
      pickedZoneId,
      candidateZoneIds,
    });
  }, [effectiveZoneId, accountZoneId, pickedZoneId, candidateZoneIds]);

  const loadRequests = useCallback(async () => {
    if (!effectiveZoneId) return;
    setLoadingRequests(true);
    try {
      const result = await listGuestRequests(effectiveZoneId);
      setRequests(result.data ?? []);
    } finally {
      setLoadingRequests(false);
    }
  }, [effectiveZoneId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

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
          <ScreenHeader title="Access" subtitle="QR invites & guest arrivals" />

          <SegmentedTabs tab={tab} onChange={setTab} />

          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            {tab === "member" ? (
              <MemberInviteSection disabled={memberInviteDisabled} />
            ) : (
              <GuestAccessSection
                zoneId={effectiveZoneId}
                candidateZoneIds={candidateZoneIds}
                zonesLoading={zonesLoading}
                onPickZoneId={setPickedZoneId}
                onRefreshZones={() => void refreshZones()}
              />
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
