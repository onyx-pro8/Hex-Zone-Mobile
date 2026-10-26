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
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

type Tab = "invite" | "place" | "list";

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

export default function AccessCodesScreen() {
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

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScreenHeader title="Universal Access" subtitle="Invite, request, and manage keys" showBack />
          <View
            style={{
              flexDirection: "row",
              marginHorizontal: 20,
              marginBottom: 8,
              backgroundColor: colors.bgSurface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 4,
              gap: 4,
            }}
          >
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: "center",
                    backgroundColor: active ? colors.accent : colors.bgCard,
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#fff" : colors.text,
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
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

            {!loading && canInvite && tab === "invite" ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 12 }}>
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
                    <View>
                      <FieldLabel>Invitee email</FieldLabel>
                      <TextInput
                        value={inviteeEmail}
                        editable={!inviteReadyToRefresh}
                        onChangeText={(value) => {
                          setInviteeEmail(value);
                          setInvitee(null);
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: colors.text,
                          backgroundColor: colors.bgCard,
                        }}
                      />
                      {inviteeMatches.map((match) => (
                        <Pressable
                          key={match.id}
                          onPress={() => {
                            setInvitee(match);
                            setInviteeEmail(match.email);
                            setInviteeMatches([]);
                          }}
                          style={{
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: "700" }}>{match.email}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {[match.name, match.network_id].filter(Boolean).join(" · ")}
                          </Text>
                        </Pressable>
                      ))}
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
                    <Text style={{ color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                      Access key: {generatedCode}
                    </Text>
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
              </View>
            ) : null}

            {!loading && tab === "place" ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Request access to another network. Their admin reviews your request.
                  </Text>
                  <View>
                    <FieldLabel>Network ID</FieldLabel>
                    <TextInput
                      value={networkQuery}
                      onChangeText={(value) => {
                        setNetworkQuery(value);
                        setTarget(null);
                        setPlaceZoneIds([]);
                      }}
                      autoCapitalize="characters"
                      placeholder="Search network ID"
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
                    {targetMatches.map((match) => (
                      <Pressable
                        key={match.network_id}
                        onPress={() => {
                          setTarget(match);
                          setNetworkQuery(match.network_id);
                          setTargetMatches([]);
                          setPlaceZoneIds([]);
                        }}
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {match.network_id}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {match.admin_name} · {match.admin_email}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View>
                    <FieldLabel>Zone name</FieldLabel>
                    {!target ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Enter a network ID first.
                      </Text>
                    ) : null}
                    {(target?.zones ?? []).map((zone) => (
                      <Pressable
                        key={zone.id}
                        onPress={() => toggleZone(zone.id, placeZoneIds, setPlaceZoneIds)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: colors.accent,
                            backgroundColor: placeZoneIds.includes(zone.id)
                              ? colors.accent
                              : "transparent",
                          }}
                        />
                        <Text style={{ color: colors.text }}>{zone.name}</Text>
                      </Pressable>
                    ))}
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
              </View>
            ) : null}

            {!loading && tab === "list" ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 10 }}>
                {rows.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>Nothing here yet.</Text>
                ) : null}
                {rows.map((row) => {
                  const actions = row.viewer_actions;
                  return (
                    <Card key={row.id} style={{ gap: 6 }}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {row.request_kind === "place_access" ? "Access other" : "Invite"} ·{" "}
                        {row.member_name}
                        {row.key_type ? ` · ${row.key_type}` : ""}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {row.place || "No zones"}
                        {row.network_id ? ` · ${row.network_id}` : ""}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {row.status}
                        {row.code ? ` · ${row.code}` : ""}
                        {row.created_at
                          ? ` · ${new Date(row.created_at).toLocaleString()}`
                          : ""}
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
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

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
                {detail?.request_kind === "place_access" ? "Access other" : "Invite"} ·{" "}
                {detail?.member_name}
              </Text>
              <Text style={{ color: colors.textMuted }}>{detail?.email}</Text>
              <Text style={{ color: colors.textMuted }}>{detail?.place || "No zones"}</Text>
              {detail?.code ? (
                <Text style={{ color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  {detail.code}
                </Text>
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
      </SafeAreaView>
    </GradientBackground>
  );
}
