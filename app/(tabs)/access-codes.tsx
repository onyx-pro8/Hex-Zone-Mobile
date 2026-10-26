import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  approveUniversalAccessRequest,
  createInviteUniversalAccessRequest,
  createPlaceAccessUniversalRequest,
  deleteUniversalAccessRequest,
  getUniversalAccessRequest,
  listShareableUniversalZones,
  listUniversalAccessRequests,
  rejectUniversalAccessRequest,
  searchUniversalAccessInvitees,
  searchUniversalAccessTargets,
  setUniversalAccessEnabled,
  updateUniversalAccessDocs,
  type UniversalAccessInvitee,
  type UniversalAccessRequestRow,
  type UniversalAccessTargetNetwork,
  type UniversalAccessZone,
} from "@/api/universalAccess";
import {
  Check,
  Copy as CopyIcon,
  RefreshCw as RefreshIcon,
  Search,
} from "lucide-react-native";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

type Tab = "invite" | "place" | "list";

function CopyableAccessKey({
  code,
  label = "Access key",
}: {
  code: string;
  label?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          flexShrink: 1,
        }}
      >
        {label ? `${label}: ${code}` : code}
      </Text>
      <Pressable
        onPress={() => {
          void copyToClipboard(code).then((result) => {
            if (result.ok) toast.success("Access key copied.", { title: "Copied" });
            else toast.error(result.message || "Could not copy.");
          });
        }}
        accessibilityLabel="Copy access key"
        hitSlop={8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSurface,
        }}
      >
        <CopyIcon size={12} color={colors.accent} />
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
          Copy
        </Text>
      </Pressable>
    </View>
  );
}

async function photoDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    toast.error("Photo library permission is required.");
    return null;
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const wide = (asset.width ?? 0) >= (asset.height ?? 0);
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const prepared = await ImageManipulator.manipulateAsync(
    asset.uri,
    longEdge > 1280
      ? [{ resize: wide ? { width: 1280 } : { height: 1280 } }]
      : [],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) return null;
  return `data:image/jpeg;base64,${prepared.base64}`;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

type AccessCodesScreenProps = {
  /** When true, render as a panel inside Access (no back header / outer chrome). */
  embedded?: boolean;
};

export default function AccessCodesScreen({
  embedded = false,
}: AccessCodesScreenProps) {
  const { user } = useAuth();
  const canInvite = String(user?.role ?? "").toLowerCase() === "administrator";
  const [tab, setTab] = useState<Tab>(canInvite ? "invite" : "place");
  const [rows, setRows] = useState<UniversalAccessRequestRow[]>([]);
  const [zones, setZones] = useState<UniversalAccessZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UniversalAccessRequestRow | null>(null);
  const [editing, setEditing] = useState<UniversalAccessRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editBusinessDoc, setEditBusinessDoc] = useState("");

  const [keyType, setKeyType] = useState<"private" | "public">("private");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [invitee, setInvitee] = useState<UniversalAccessInvitee | null>(null);
  const [inviteeMatches, setInviteeMatches] = useState<UniversalAccessInvitee[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<number[]>([]);
  const [inviteNote, setInviteNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [inviteReadyToRefresh, setInviteReadyToRefresh] = useState(false);

  const [networkQuery, setNetworkQuery] = useState("");
  const [target, setTarget] = useState<UniversalAccessTargetNetwork | null>(null);
  const [targetMatches, setTargetMatches] = useState<UniversalAccessTargetNetwork[]>([]);
  const [placeZoneIds, setPlaceZoneIds] = useState<number[]>([]);
  const [placeNote, setPlaceNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [businessDoc, setBusinessDoc] = useState("");

  const profile = useMemo(
    () => ({
      firstName: String((user as { firstName?: string; first_name?: string } | null)?.firstName
        ?? (user as { first_name?: string } | null)?.first_name
        ?? ""),
      lastName: String((user as { lastName?: string; last_name?: string } | null)?.lastName
        ?? (user as { last_name?: string } | null)?.last_name
        ?? ""),
      email: String(user?.email ?? ""),
      address: String((user as { address?: string } | null)?.address ?? ""),
    }),
    [user],
  );

  const tabs = useMemo(
    () => [
      ...(canInvite ? [{ key: "invite" as const, label: "Invite" }] : []),
      { key: "place" as const, label: "Access other" },
      { key: "list" as const, label: "Request List" },
    ],
    [canInvite],
  );

  const reload = useCallback(async () => {
    const [requestResult, zoneResult] = await Promise.all([
      listUniversalAccessRequests(),
      canInvite
        ? listShareableUniversalZones()
        : Promise.resolve({ data: [] as UniversalAccessZone[], error: null }),
    ]);
    if (requestResult.error) toast.error(requestResult.error);
    if (zoneResult.error) toast.error(zoneResult.error);
    setRows(requestResult.data ?? []);
    setZones(zoneResult.data ?? []);
  }, [canInvite]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void reload().finally(() => setLoading(false));
    }, [reload]),
  );

  useEffect(() => {
    if (inviteReadyToRefresh || keyType !== "private") {
      setInviteeMatches([]);
      return;
    }
    if (invitee && invitee.email === inviteeEmail.trim()) {
      setInviteeMatches([]);
      return;
    }
    const query = inviteeEmail.trim();
    if (query.length < 2) {
      setInviteeMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchUniversalAccessInvitees(query).then((result) => {
        setInviteeMatches(Array.isArray(result.data) ? result.data.slice(0, 5) : []);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [invitee, inviteeEmail, keyType, inviteReadyToRefresh]);

  useEffect(() => {
    if (target && target.network_id === networkQuery.trim()) {
      setTargetMatches([]);
      return;
    }
    const query = networkQuery.trim();
    if (query.length < 2) {
      setTargetMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchUniversalAccessTargets(query).then((result) => {
        setTargetMatches(Array.isArray(result.data) ? result.data : []);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [networkQuery, target]);

  function toggleZone(id: number, current: number[], setter: (next: number[]) => void) {
    setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function resetInviteForm() {
    setKeyType("private");
    setInvitee(null);
    setInviteeEmail("");
    setInviteeMatches([]);
    setSelectedZoneIds([]);
    setInviteNote("");
    setGeneratedCode(null);
    setInviteReadyToRefresh(false);
  }

  function resetPlaceForm() {
    setNetworkQuery("");
    setTarget(null);
    setTargetMatches([]);
    setPlaceZoneIds([]);
    setPlaceNote("");
    setPhoto("");
    setBusinessDoc("");
  }

  async function onSubmitInvite() {
    if (inviteReadyToRefresh) {
      resetInviteForm();
      return;
    }
    if (keyType === "private" && !invitee) {
      toast.error("Pick an invitee from the search results.");
      return;
    }
    if (selectedZoneIds.length === 0) {
      toast.error("Select at least one zone.");
      return;
    }
    setSubmitting(true);
    const result = await createInviteUniversalAccessRequest({
      key_type: keyType,
      invitee_email: keyType === "private" ? invitee?.email : undefined,
      zone_ids: selectedZoneIds,
      note: inviteNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not generate the access key.");
      return;
    }
    setGeneratedCode(result.data.code ?? null);
    setInviteReadyToRefresh(true);
    toast.success("Access key generated.");
    await reload();
  }

  async function onSubmitPlace() {
    if (!target) {
      toast.error("Select a network ID first.");
      return;
    }
    if (placeZoneIds.length === 0) {
      toast.error("Select at least one zone.");
      return;
    }
    if (!photo || !businessDoc) {
      toast.error("Photo ID and business document are required.");
      return;
    }
    setSubmitting(true);
    const result = await createPlaceAccessUniversalRequest({
      network_id: target.network_id,
      zone_ids: placeZoneIds,
      photo_id: photo,
      business_document: businessDoc,
      note: placeNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not submit the request.");
      return;
    }
    toast.success("Request sent.");
    resetPlaceForm();
    setTab("list");
    await reload();
  }

  const pageMarkers = (
    <View
      style={{
        flexDirection: "row",
        alignSelf: "flex-start",
        gap: 2,
        marginBottom: -1,
        zIndex: 2,
      }}
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderWidth: 1,
              borderBottomWidth: active ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: active ? colors.bgCard : colors.bgSurface,
              marginBottom: active ? 0 : 1,
            }}
          >
            <Text
              style={{
                color: active ? colors.accent : colors.textMuted,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Flush page-marker sheet: square top-left so the first marker meets the card.
  const sheetCardCorners = {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  } as const;

  const panel = (
    <>
          {!embedded ? (
            <ScreenHeader
              title="Universal Access"
              subtitle="Invite, request, and manage keys"
              showBack
            />
          ) : null}

          <ScrollView
            style={embedded ? { flex: 1 } : undefined}
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: embedded ? 40 : 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.accent}
                colors={[colors.accent]}
                onRefresh={() => {
                  setRefreshing(true);
                  void reload().finally(() => setRefreshing(false));
                }}
              />
            }
          >
            {loading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
            ) : null}

            {!loading ? (
              <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
                {pageMarkers}
                {canInvite && tab === "invite" ? (
                <Card
                  style={{
                    gap: 12,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Generate a private or public universal access key for your zones.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    {(["private", "public"] as const).map((value) => (
                      <Pressable
                        key={value}
                        disabled={inviteReadyToRefresh}
                        onPress={() => {
                          setKeyType(value);
                          if (value === "public") {
                            setInvitee(null);
                            setInviteeEmail("");
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 2,
                            borderColor: colors.accent,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {keyType === value ? (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: colors.accent,
                              }}
                            />
                          ) : null}
                        </View>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {value === "private" ? "Private" : "Public"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {keyType === "private" ? (
                    <View style={{ zIndex: inviteeMatches.length > 0 ? 20 : 1 }}>
                      <FieldLabel>Invitee email</FieldLabel>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor: invitee
                            ? "#16A34A"
                            : inviteeMatches.length > 0
                              ? colors.accent
                              : colors.border,
                          borderRadius: 12,
                          backgroundColor: invitee
                            ? "rgba(22,163,74,0.06)"
                            : colors.bgCard,
                          paddingHorizontal: 10,
                          minHeight: 44,
                        }}
                      >
                        {invitee ? (
                          <Check size={15} color="#16A34A" />
                        ) : (
                          <Search
                            size={15}
                            color={
                              inviteeMatches.length > 0
                                ? colors.accent
                                : colors.textMuted
                            }
                          />
                        )}
                        <TextInput
                          value={inviteeEmail}
                          editable={!inviteReadyToRefresh}
                          onChangeText={(value) => {
                            setInviteeEmail(value);
                            setInvitee(null);
                          }}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          placeholder="Search other-network users…"
                          placeholderTextColor={colors.textMuted}
                          style={{
                            flex: 1,
                            paddingHorizontal: 8,
                            paddingVertical: 10,
                            color: colors.text,
                            fontSize: 13,
                          }}
                        />
                        {invitee ? (
                          <Text
                            style={{
                              color: "#16A34A",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            Selected
                          </Text>
                        ) : null}
                      </View>
                      {inviteeMatches.length > 0 ? (
                        <View
                          style={{
                            marginTop: 6,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: "#fff",
                            overflow: "hidden",
                            shadowColor: "#0F2C5C",
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.12,
                            shadowRadius: 16,
                            elevation: 6,
                          }}
                        >
                          <View
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                              backgroundColor: colors.bgSurface,
                            }}
                          >
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                fontWeight: "700",
                                letterSpacing: 0.4,
                              }}
                            >
                              {inviteeMatches.length} match
                              {inviteeMatches.length === 1 ? "" : "es"} · other
                              networks
                            </Text>
                          </View>
                          {inviteeMatches.map((match, matchIndex) => {
                            const isLast =
                              matchIndex === inviteeMatches.length - 1;
                            return (
                              <Pressable
                                key={match.id}
                                onPress={() => {
                                  setInvitee(match);
                                  setInviteeEmail(match.email);
                                  setInviteeMatches([]);
                                }}
                                style={{
                                  paddingHorizontal: 16,
                                  paddingVertical: 14,
                                  backgroundColor: "#fff",
                                  borderBottomWidth: isLast ? 0 : 1,
                                  borderBottomColor: colors.border,
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.text,
                                    fontWeight: "700",
                                    fontSize: 13,
                                  }}
                                >
                                  {match.email}
                                </Text>
                                <Text
                                  style={{
                                    color: colors.textMuted,
                                    fontSize: 12,
                                    marginTop: 4,
                                  }}
                                  numberOfLines={1}
                                >
                                  {[match.name, match.network_id]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View>
                    <FieldLabel>Zones to share</FieldLabel>
                    {zones.map((zone) => (
                      <Pressable
                        key={zone.id}
                        disabled={inviteReadyToRefresh}
                        onPress={() =>
                          toggleZone(zone.id, selectedZoneIds, setSelectedZoneIds)
                        }
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: colors.accent,
                            backgroundColor: selectedZoneIds.includes(zone.id)
                              ? colors.accent
                              : "transparent",
                          }}
                        />
                        <Text style={{ color: colors.text }}>{zone.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={inviteNote}
                    editable={!inviteReadyToRefresh}
                    onChangeText={setInviteNote}
                    placeholder="Note"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                      minHeight: 72,
                      textAlignVertical: "top",
                    }}
                  />
                  {generatedCode ? (
                    <CopyableAccessKey code={generatedCode} />
                  ) : null}
                  <Button
                    label={
                      submitting
                        ? "Working…"
                        : inviteReadyToRefresh
                          ? "Refresh"
                          : "Generate"
                    }
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmitInvite()}
                  />
                </Card>
                ) : null}

                {tab === "place" ? (
                <Card
                  style={{
                    gap: 12,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Request access to another network. Their admin reviews your request.
                  </Text>
                  <View style={{ zIndex: targetMatches.length > 0 ? 20 : 1 }}>
                    <FieldLabel>Network ID</FieldLabel>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: 1.5,
                        borderColor: target
                          ? "#16A34A"
                          : targetMatches.length > 0
                            ? colors.accent
                            : colors.border,
                        borderRadius: 12,
                        backgroundColor: target
                          ? "rgba(22,163,74,0.06)"
                          : "#fff",
                        paddingHorizontal: 10,
                        minHeight: 44,
                      }}
                    >
                      {target ? (
                        <Check size={15} color="#16A34A" />
                      ) : (
                        <Search
                          size={15}
                          color={
                            targetMatches.length > 0
                              ? colors.accent
                              : colors.textMuted
                          }
                        />
                      )}
                      <TextInput
                        value={networkQuery}
                        onChangeText={(value) => {
                          setNetworkQuery(value);
                          setTarget(null);
                          setPlaceZoneIds([]);
                        }}
                        autoCapitalize="characters"
                        placeholder="Search other networks…"
                        placeholderTextColor={colors.textMuted}
                        style={{
                          flex: 1,
                          paddingHorizontal: 8,
                          paddingVertical: 10,
                          color: colors.text,
                          fontSize: 13,
                        }}
                      />
                      {target ? (
                        <Text
                          style={{
                            color: "#16A34A",
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          Selected
                        </Text>
                      ) : null}
                    </View>
                    {targetMatches.length > 0 ? (
                      <View
                        style={{
                          marginTop: 6,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: "#fff",
                          overflow: "hidden",
                          shadowColor: "#0F2C5C",
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.12,
                          shadowRadius: 16,
                          elevation: 6,
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: colors.bgSurface,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                              letterSpacing: 0.4,
                            }}
                          >
                            {targetMatches.length} match
                            {targetMatches.length === 1 ? "" : "es"} · other
                            networks
                          </Text>
                        </View>
                        {targetMatches.map((match, matchIndex) => {
                          const isLast =
                            matchIndex === targetMatches.length - 1;
                          return (
                            <Pressable
                              key={match.network_id}
                              onPress={() => {
                                setTarget(match);
                                setNetworkQuery(match.network_id);
                                setTargetMatches([]);
                                setPlaceZoneIds([]);
                              }}
                              style={{
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: "#fff",
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.text,
                                  fontWeight: "700",
                                  fontSize: 13,
                                }}
                              >
                                {match.network_id}
                              </Text>
                              <Text
                                style={{
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  marginTop: 4,
                                }}
                                numberOfLines={1}
                              >
                                {match.admin_name} · {match.admin_email}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <View>
                    <FieldLabel>Zone name</FieldLabel>
                    {!target ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          backgroundColor: colors.bgSurface,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          Select a network first to choose zones.
                        </Text>
                      </View>
                    ) : (target.zones ?? []).length === 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          backgroundColor: colors.bgSurface,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          No shareable zones on this network.
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor:
                            placeZoneIds.length > 0
                              ? colors.accent
                              : colors.border,
                          backgroundColor: "#fff",
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: colors.bgSurface,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                              letterSpacing: 0.4,
                            }}
                          >
                            {placeZoneIds.length} selected ·{" "}
                            {target.zones.length} available
                          </Text>
                        </View>
                        {target.zones.map((zone, zoneIndex) => {
                          const selected = placeZoneIds.includes(zone.id);
                          const isLast =
                            zoneIndex === target.zones.length - 1;
                          const meta = [
                            zone.zone_type,
                            zone.is_primary ? "primary" : null,
                            zone.communal ? "communal" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <Pressable
                              key={zone.id}
                              onPress={() =>
                                toggleZone(
                                  zone.id,
                                  placeZoneIds,
                                  setPlaceZoneIds,
                                )
                              }
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 12,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: selected
                                  ? "rgba(47,128,237,0.06)"
                                  : "#fff",
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 1.5,
                                  borderColor: selected
                                    ? colors.accent
                                    : colors.border,
                                  backgroundColor: selected
                                    ? colors.accent
                                    : "#fff",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selected ? (
                                  <Check size={13} color="#fff" />
                                ) : null}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: colors.text,
                                    fontWeight: "700",
                                    fontSize: 13,
                                  }}
                                >
                                  {zone.name}
                                </Text>
                                {meta ? (
                                  <Text
                                    style={{
                                      color: colors.textMuted,
                                      fontSize: 12,
                                      marginTop: 3,
                                    }}
                                  >
                                    {meta}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  <View>
                    <FieldLabel>Network admin email</FieldLabel>
                    <TextInput
                      value={target?.admin_email ?? ""}
                      editable={false}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.textMuted,
                        backgroundColor: colors.bgSurface,
                      }}
                    />
                  </View>
                  {[
                    ["First name", profile.firstName],
                    ["Last name", profile.lastName],
                    ["Email", profile.email],
                    ["Address", profile.address],
                  ].map(([label, value]) => (
                    <View key={label}>
                      <FieldLabel>{label}</FieldLabel>
                      <TextInput
                        value={value}
                        editable={false}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: colors.textMuted,
                          backgroundColor: colors.bgSurface,
                        }}
                      />
                    </View>
                  ))}
                  <Button
                    label={photo ? "Replace photo ID" : "Add photo ID"}
                    variant="outline"
                    size="sm"
                    fullWidth
                    onPress={() => {
                      void photoDataUrl().then((url) => {
                        if (url) setPhoto(url);
                      });
                    }}
                  />
                  {photo ? (
                    <Image source={{ uri: photo }} style={{ width: 120, height: 84, borderRadius: 8 }} />
                  ) : null}
                  <Button
                    label={businessDoc ? "Replace business document" : "Add business document"}
                    variant="outline"
                    size="sm"
                    fullWidth
                    onPress={() => {
                      void photoDataUrl().then((url) => {
                        if (url) setBusinessDoc(url);
                      });
                    }}
                  />
                  {businessDoc ? (
                    <Image
                      source={{ uri: businessDoc }}
                      style={{ width: 120, height: 84, borderRadius: 8 }}
                    />
                  ) : null}
                  <TextInput
                    value={placeNote}
                    onChangeText={setPlaceNote}
                    placeholder="Note"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                      minHeight: 72,
                      textAlignVertical: "top",
                    }}
                  />
                  <Button
                    label={submitting ? "Sending…" : "Send request"}
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmitPlace()}
                  />
                </Card>
                ) : null}

                {tab === "list" ? (
              <View style={{ gap: 10, marginTop: 0 }}>
                <Card
                  style={{
                    gap: 10,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Pull down to refresh
                  </Text>
                  <Pressable
                    onPress={() => {
                      setRefreshing(true);
                      void reload().finally(() => setRefreshing(false));
                    }}
                    disabled={refreshing}
                    hitSlop={8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      opacity: refreshing ? 0.6 : 1,
                    }}
                  >
                    <RefreshIcon size={14} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                      {refreshing ? "Refreshing…" : "Refresh"}
                    </Text>
                  </Pressable>
                </View>
                {rows.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>Nothing here yet.</Text>
                ) : null}
                {rows.map((row, index) => {
                  const actions = row.viewer_actions;
                  const isLast = index === rows.length - 1;
                  return (
                    <View
                      key={row.id}
                      style={{
                        gap: 6,
                        paddingBottom: isLast ? 0 : 10,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {row.request_kind === "place_access" ? "Access other" : "Invite"}
                        {row.key_type ? ` · ${row.key_type}` : ""}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "—"}
                      </Text>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 12,
                          fontWeight: "700",
                          textTransform: "capitalize",
                        }}
                      >
                        {row.status}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        {row.status === "approved" &&
                        row.credential_id != null &&
                        row.viewer_role === "owner" ? (
                          <Button
                            label={row.enabled ? "Turn off" : "Turn on"}
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onPress={() => {
                              setBusyId(row.id);
                              void setUniversalAccessEnabled(
                                row.credential_id!,
                                !row.enabled,
                              ).then(() => reload().finally(() => setBusyId(null)));
                            }}
                          />
                        ) : null}
                        {actions?.can_approve || actions?.can_reject ? (
                          <Button
                            label="Review"
                            size="sm"
                            variant="outline"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                setDetail(result.data ?? row);
                                setRejectReason("");
                              });
                            }}
                          />
                        ) : null}
                        {actions?.can_edit_docs && row.status === "pending" ? (
                          <Button
                            label="Edit"
                            size="sm"
                            variant="outline"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                const full = result.data ?? row;
                                setEditing(full);
                                setEditPhoto(full.photo_id || "");
                                setEditBusinessDoc(full.business_document || "");
                              });
                            }}
                          />
                        ) : null}
                        {actions?.can_remove &&
                        (row.status === "pending" || row.request_kind === "invite") ? (
                          <Button
                            label="Remove"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onPress={() => {
                              setBusyId(row.id);
                              void deleteUniversalAccessRequest(row.id).then((result) => {
                                setBusyId(null);
                                if (result.error) toast.error(result.error);
                                else void reload();
                              });
                            }}
                          />
                        ) : null}
                        {!(actions?.can_approve || actions?.can_reject) &&
                        !(actions?.can_edit_docs && row.status === "pending") ? (
                          <Button
                            label="Detail"
                            size="sm"
                            variant="outline"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                setDetail(result.data ?? row);
                              });
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                </Card>
              </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

        <Modal visible={detail != null} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                {detail?.request_kind === "place_access" ? "Access other" : "Invite"}
                {detail?.key_type ? ` · ${detail.key_type}` : ""}
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 12,
                  fontWeight: "700",
                  textTransform: "capitalize",
                }}
              >
                {detail?.status}
                {detail?.created_at
                  ? ` · ${new Date(detail.created_at).toLocaleString()}`
                  : ""}
              </Text>
              {detail?.request_kind === "invite" &&
              detail?.key_type === "private" &&
              detail?.email ? (
                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Invited user
                  </Text>
                  <Text style={{ color: colors.text }}>{detail.email}</Text>
                  {detail.member_name ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {detail.member_name}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Zones
                </Text>
                <Text style={{ color: colors.text }}>
                  {(detail?.zones ?? []).map((zone) => zone.name).join(", ") ||
                    detail?.place ||
                    "No zones"}
                </Text>
                {detail?.network_id ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {detail.network_id}
                  </Text>
                ) : null}
              </View>
              {detail?.code ? (
                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Access key
                  </Text>
                  <CopyableAccessKey code={detail.code} label="" />
                </View>
              ) : null}
              {detail?.viewer_actions?.can_approve || detail?.viewer_actions?.can_reject ? (
                <>
                  <Button
                    label="Approve"
                    size="sm"
                    fullWidth
                    disabled={busyId === detail?.id}
                    onPress={() => {
                      if (!detail) return;
                      setBusyId(detail.id);
                      void approveUniversalAccessRequest(detail.id).then((result) => {
                        setBusyId(null);
                        if (result.error) toast.error(result.error);
                        else {
                          setDetail(null);
                          void reload();
                        }
                      });
                    }}
                  />
                  <TextInput
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Reject reason (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                    }}
                  />
                  <Button
                    label="Reject"
                    size="sm"
                    fullWidth
                    variant="outline"
                    disabled={busyId === detail?.id}
                    onPress={() => {
                      if (!detail) return;
                      setBusyId(detail.id);
                      void rejectUniversalAccessRequest(detail.id, rejectReason.trim()).then(
                        (result) => {
                          setBusyId(null);
                          if (result.error) toast.error(result.error);
                          else {
                            setDetail(null);
                            void reload();
                          }
                        },
                      );
                    }}
                  />
                </>
              ) : null}
              <Button label="Close" size="sm" fullWidth variant="outline" onPress={() => setDetail(null)} />
            </Card>
          </View>
        </Modal>

        <Modal visible={editing != null} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                Edit documents
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                Only photo ID and business document can be changed while pending.
              </Text>
              <Button
                label={editPhoto ? "Replace photo ID" : "Add photo ID"}
                variant="outline"
                size="sm"
                fullWidth
                onPress={() => {
                  void photoDataUrl().then((url) => {
                    if (url) setEditPhoto(url);
                  });
                }}
              />
              <Button
                label={editBusinessDoc ? "Replace business document" : "Add business document"}
                variant="outline"
                size="sm"
                fullWidth
                onPress={() => {
                  void photoDataUrl().then((url) => {
                    if (url) setEditBusinessDoc(url);
                  });
                }}
              />
              <Button
                label="Save"
                size="sm"
                fullWidth
                disabled={busyId === editing?.id}
                onPress={() => {
                  if (!editing) return;
                  if (!editPhoto || !editBusinessDoc) {
                    toast.error("Photo ID and business document are required.");
                    return;
                  }
                  setBusyId(editing.id);
                  void updateUniversalAccessDocs(editing.id, {
                    photo_id: editPhoto,
                    business_document: editBusinessDoc,
                  }).then((result) => {
                    setBusyId(null);
                    if (result.error) toast.error(result.error);
                    else {
                      setEditing(null);
                      void reload();
                    }
                  });
                }}
              />
              <Button
                label="Cancel"
                size="sm"
                fullWidth
                variant="outline"
                onPress={() => setEditing(null)}
              />
            </Card>
          </View>
        </Modal>
    </>
  );

  if (embedded) {
    return <View style={{ flex: 1 }}>{panel}</View>;
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {panel}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}
