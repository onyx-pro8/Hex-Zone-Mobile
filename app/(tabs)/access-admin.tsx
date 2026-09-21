import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { alertCopyResult, copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import {
  Copy,
  Download,
  Link as LinkIcon,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormSelect } from "@/components/ui/FormSelect";
import { ToastHost } from "@/components/ui/ToastHost";
import { useAuth } from "@/context/AuthContext";
import {
  createGuestAccessQrToken,
  fetchNetworkAccessQrToken,
  generateMemberInviteQr,
  getGuestAccessQrLink,
  getGuestAccessQrTokenLink,
  listGuestAccessQrTokens,
  revokeGuestAccessQrToken,
  toAccessDeepLink,
  type GuestAccessQrToken,
} from "@/api/guest";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { devLog } from "@/lib/devConsole";
import {
  canAdministratorInviteUserMember,
  isSystemAdministrator,
  memberInviteUnavailableHint,
  normalizeAccountType,
} from "@/lib/accountLimits";
import { downloadInviteQrCsv } from "@/lib/inviteQrExport";
import { colors } from "@/theme/colors";

type Tab = "member" | "guest";

type ExpiryHours = number | null;

const EXPIRY_OPTIONS: {
  value: string;
  hours: ExpiryHours;
  label: string;
  description: string;
}[] = [
  {
    value: "1",
    hours: 1,
    label: "1H",
    description: "Single-use · expires in 1 hour",
  },
  {
    value: "24",
    hours: 24,
    label: "24H",
    description: "Single-use · expires in 24 hours",
  },
  {
    value: "168",
    hours: 24 * 7,
    label: "7D",
    description: "Single-use · expires in 7 days",
  },
  {
    value: "720",
    hours: 24 * 30,
    label: "30D",
    description: "Single-use · expires in 30 days",
  },
  {
    value: "never",
    hours: null,
    label: "∞",
    description: "Single-use · never expires",
  },
];

const QR_COUNT_OPTIONS: {
  value: string;
  count: number;
  label: string;
  description: string;
}[] = [
  { value: "1", count: 1, label: "1", description: "1 QR code" },
  { value: "5", count: 5, label: "5", description: "5 QR codes" },
  { value: "25", count: 25, label: "25", description: "25 QR codes" },
  { value: "100", count: 100, label: "100", description: "100 QR codes" },
  { value: "200", count: 200, label: "200", description: "200 QR codes" },
];

type GeneratedInvite = {
  token: string;
  url: string;
  expires_at: string | null;
};

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

function inviteExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "Single-use · does not expire";
  return `Single-use · expires ${new Date(expiresAt).toLocaleString()}`;
}

function MemberInviteSection({
  disabled,
  unavailableHint,
  isSystemAdmin = false,
}: {
  disabled: boolean;
  unavailableHint: string;
  isSystemAdmin?: boolean;
}) {
  const [expiryKey, setExpiryKey] = useState("24");
  const [countKey, setCountKey] = useState("1");
  const [items, setItems] = useState<GeneratedInvite[]>([]);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);

  const hours = useMemo(
    () => EXPIRY_OPTIONS.find((o) => o.value === expiryKey)?.hours ?? 24,
    [expiryKey],
  );
  // Network admins are limited to a single QR; only system admin may bulk mint.
  const count = useMemo(() => {
    if (!isSystemAdmin) return 1;
    return QR_COUNT_OPTIONS.find((o) => o.value === countKey)?.count ?? 1;
  }, [countKey, isSystemAdmin]);
  const detail =
    detailIndex != null && items[detailIndex] ? items[detailIndex] : null;

  const onGenerate = useCallback(async () => {
    setLoading(true);
    setDetailIndex(null);
    setDownloadLink(null);
    const batchSize = isSystemAdmin ? count : 1;
    try {
      const next: GeneratedInvite[] = [];
      for (let i = 0; i < batchSize; i += 1) {
        const result = await generateMemberInviteQr({
          expires_in_hours: hours,
        });
        if (result.error || !result.data) {
          throw new Error(
            result.error ??
              `Could not generate invite QR ${i + 1} of ${batchSize}.`,
          );
        }
        next.push({
          token: result.data.token,
          url: result.data.url,
          expires_at: result.data.expires_at ?? null,
        });
      }
      setItems(next);
      toast.success(
        next.length === 1
          ? "Invite QR ready."
          : `Generated ${next.length} single-use invite QR codes.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate QR.",
      );
    } finally {
      setLoading(false);
    }
  }, [count, hours, isSystemAdmin]);

  const downloadRows = useCallback(
    async (rows: GeneratedInvite[], fileName: string) => {
      if (!isSystemAdmin) {
        toast.error("Only the system administrator can download invite QR codes.");
        return;
      }
      setDownloading(true);
      try {
        const result = await downloadInviteQrCsv({
          fileName,
          rows: rows.map((row, index) => ({
            index: index + 1,
            token: row.token,
            url: row.url,
            expires_at: row.expires_at,
          })),
        });
        if (result.ok && result.uri) {
          setDownloadLink(result.uri);
        }
      } finally {
        setDownloading(false);
      }
    },
    [isSystemAdmin],
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
        {isSystemAdmin ? "New network admin invite" : "Member invite link"}
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 18 }}>
        {isSystemAdmin
          ? "Invitees create an Individual user account for a new network and choose their own network ID on the join form. Every link is single-use, including ones that never expire. Generate multiple codes when you need a batch for handout or printing."
          : "Invitees join this network as user-role members (Family/Organization keep your account type; Individual Pro invites one Individual). Every link is single-use (including never-expiring). You can generate one invite QR at a time."}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <FormSelect
          label="Expire time"
          value={expiryKey}
          options={EXPIRY_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
          }))}
          onChange={setExpiryKey}
          disabled={disabled || loading}
          compact
          style={{ flex: 1 }}
        />
        {isSystemAdmin ? (
          <>
            <FormSelect
              label="Number of QR codes"
              value={countKey}
              options={QR_COUNT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                description: o.description,
              }))}
              onChange={setCountKey}
              disabled={disabled || loading}
              compact
              style={{ flex: 0.85 }}
            />
            <Pressable
              onPress={() =>
                void downloadRows(
                  items,
                  `member-invites-${items.length || count}.csv`,
                )
              }
              disabled={disabled || items.length === 0 || downloading}
              accessibilityRole="button"
              accessibilityLabel="Download all"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor:
                  disabled || items.length === 0
                    ? colors.bgMuted
                    : colors.bgCard,
                opacity:
                  disabled || items.length === 0 || downloading ? 0.45 : 1,
              }}
            >
              {downloading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Download
                  size={18}
                  color={
                    items.length === 0 ? colors.textDim : colors.accent
                  }
                />
              )}
            </Pressable>
          </>
        ) : null}
      </View>

      <Button
        label={items.length ? "Generate new" : "Generate"}
        variant="primary"
        onPress={() => void onGenerate()}
        loading={loading}
        leftIcon={<LinkIcon size={16} color="#fff" />}
        disabled={disabled}
        fullWidth
      />

      {isSystemAdmin && downloadLink ? (
        <View
          style={{
            gap: 6,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Download link (Excel + QR images)
          </Text>
          <Text
            selectable
            style={{ color: colors.accentDeep, fontSize: 12, lineHeight: 18 }}
          >
            {downloadLink}
          </Text>
          <Pressable
            onPress={() => {
              void copyToClipboard(downloadLink).then((result) =>
                alertCopyResult(result, downloadLink),
              );
            }}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 6,
            }}
          >
            <Copy size={14} color={colors.accent} />
            <Text
              style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}
            >
              Copy download link
            </Text>
          </Pressable>
        </View>
      ) : null}

      {items.length === 0 ? (
        <QrPreview
          value={null}
          label={
            isSystemAdmin
              ? "Generate to mint invite QR code(s)"
              : "Generate to mint an invite QR code"
          }
        />
      ) : items.length === 1 ? (
        <>
          <QrPreview value={items[0]?.url ?? null} />
          <Text
            style={{
              color: colors.textDim,
              fontSize: 11,
              textAlign: "center",
            }}
          >
            {inviteExpiryLabel(items[0]?.expires_at ?? null)}
          </Text>
          {isSystemAdmin ? (
            <Button
              label="Download"
              variant="secondary"
              onPress={() =>
                void downloadRows(
                  items,
                  `member-invite-${items[0]?.token ?? "1"}.csv`,
                )
              }
              loading={downloading}
              leftIcon={<Download size={16} color={colors.text} />}
              disabled={downloading}
              fullWidth
            />
          ) : null}
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Generated ({items.length})
          </Text>
          <ScrollView
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {items.map((item, index) => (
              <Pressable
                key={item.token}
                onPress={() => setDetailIndex(index)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgCard,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.accentGlow,
                  }}
                >
                  <QrCode size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Invite #{index + 1}
                  </Text>
                  <Text
                    style={{ color: colors.textDim, fontSize: 11 }}
                    numberOfLines={1}
                  >
                    {inviteExpiryLabel(item.expires_at)}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.accent,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  Details
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {disabled ? (
        <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 18 }}>
          {unavailableHint}
        </Text>
      ) : null}

      <Modal
        visible={detail != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailIndex(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(15, 44, 92, 0.4)",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
          onPress={() => setDetailIndex(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 18,
              gap: 12,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
              >
                Invite #{(detailIndex ?? 0) + 1}
              </Text>
              <Pressable onPress={() => setDetailIndex(null)} hitSlop={10}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            {detail ? (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ gap: 12, alignItems: "center" }}
                keyboardShouldPersistTaps="handled"
              >
                <View
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <QRCode value={detail.url} size={180} />
                </View>
                <Text
                  style={{
                    color: colors.textDim,
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {inviteExpiryLabel(detail.expires_at)}
                </Text>
                <Pressable
                  onPress={() => {
                    void copyToClipboard(detail.url).then((result) =>
                      alertCopyResult(result, detail.url),
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
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Copy link
                  </Text>
                </Pressable>
                <Text
                  selectable
                  style={{
                    color: colors.textDim,
                    fontSize: 11,
                    textAlign: "center",
                  }}
                  numberOfLines={4}
                >
                  {detail.url}
                </Text>
                {isSystemAdmin ? (
                  <Button
                    label="Download"
                    variant="primary"
                    onPress={() =>
                      void downloadRows(
                        [detail],
                        `member-invite-${detail.token}.csv`,
                      )
                    }
                    loading={downloading}
                    leftIcon={<Download size={16} color="#fff" />}
                    disabled={downloading}
                    fullWidth
                  />
                ) : null}
                {isSystemAdmin && downloadLink ? (
                  <View style={{ width: "100%", gap: 4 }}>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      Download link (Excel + QR images)
                    </Text>
                    <Text
                      selectable
                      style={{
                        color: colors.accentDeep,
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      {downloadLink}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
            <ToastHost />
          </Pressable>
        </Pressable>
      </Modal>
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
  const { user } = useAuth();
  const { effectiveZoneId } = useEffectiveZoneId();
  const [tab, setTab] = useState<Tab>("member");

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

  const isSystemAdmin = useMemo(
    () =>
      isSystemAdministrator({
        role: user?.role,
        accountType: user?.accountType,
        legacyAccountType: user?.account_type,
      }),
    [user],
  );

  useEffect(() => {
    if (memberInviteDisabled) {
      setTab("guest");
    }
  }, [memberInviteDisabled]);

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <AppHeader
            title="Access"
            subtitle="QR invites"
          />

          <SegmentedTabs tab={tab} onChange={setTab} />

          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            {tab === "member" ? (
              <MemberInviteSection
                disabled={memberInviteDisabled}
                unavailableHint={memberInviteHint}
                isSystemAdmin={isSystemAdmin}
              />
            ) : (
              <NetworkAccessSection zoneId={effectiveZoneId} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
