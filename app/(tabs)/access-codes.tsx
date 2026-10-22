import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormSelect } from "@/components/ui/FormSelect";
import { useAuth } from "@/context/AuthContext";
import { isSystemAdministrator } from "@/lib/accountLimits";
import {
  approveUniversalAccessRequest,
  createInviteUniversalAccessRequest,
  createPlaceAccessUniversalRequest,
  getUniversalAccessRequest,
  listShareableUniversalZones,
  listUniversalAccessRequests,
  rejectUniversalAccessRequest,
  searchUniversalAccessInvitees,
  setUniversalAccessEnabled,
  type UniversalAccessInvitee,
  type UniversalAccessRequestRow,
  type UniversalAccessZone,
} from "@/api/universalAccess";
import {
  cityOptions,
  COUNTRY_OPTIONS,
  countryName,
  regionName,
  regionOptions,
} from "@/lib/places";
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

export default function AccessCodesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isSystemAdmin = isSystemAdministrator({
    role: user?.role,
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
  });
  const [tab, setTab] = useState<Tab>(isSystemAdmin ? "list" : "invite");
  const [rows, setRows] = useState<UniversalAccessRequestRow[]>([]);
  const [zones, setZones] = useState<UniversalAccessZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const [inviteeEmail, setInviteeEmail] = useState("");
  const [invitee, setInvitee] = useState<UniversalAccessInvitee | null>(null);
  const [inviteeMatches, setInviteeMatches] = useState<UniversalAccessInvitee[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [inviteeHint, setInviteeHint] = useState("");
  const [selectedZoneIds, setSelectedZoneIds] = useState<number[]>([]);
  const [inviteNote, setInviteNote] = useState("");

  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [placeNote, setPlaceNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [businessDoc, setBusinessDoc] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UniversalAccessRequestRow | null>(null);
  const [approveZoneIds, setApproveZoneIds] = useState<number[]>([]);
  const [rejectReason, setRejectReason] = useState("");

  const regions = useMemo(() => {
    const base = regionOptions(country);
    if (region && !base.some((item) => item.value === region)) {
      return [{ value: region, label: region }, ...base];
    }
    return base;
  }, [country, region]);
  const cities = useMemo(() => {
    const base = cityOptions(country, region);
    if (city && !base.some((item) => item.value === city)) {
      return [{ value: city, label: city }, ...base];
    }
    return base;
  }, [country, region, city]);

  const reload = useCallback(async () => {
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    const [requestResult, zoneResult] = await Promise.all([
      listUniversalAccessRequests(),
      isSystemAdmin
        ? Promise.resolve({ data: [] as UniversalAccessZone[], error: null })
        : listShareableUniversalZones(),
    ]);
    if (requestResult.error) toast.error(requestResult.error);
    if (zoneResult.error) toast.error(zoneResult.error);
    setRows(requestResult.data ?? []);
    setZones(zoneResult.data ?? []);
    loadedOnce.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [isSystemAdmin]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    if (invitee && invitee.email === inviteeEmail.trim()) {
      setInviteeMatches([]);
      setLookingUp(false);
      return;
    }
    const query = inviteeEmail.trim();
    if (query.length < 2) {
      setInviteeMatches([]);
      setInviteeHint("");
      setLookingUp(false);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    setInviteeHint("");
    const timer = setTimeout(() => {
      void searchUniversalAccessInvitees(query).then((result) => {
        if (cancelled) return;
        setLookingUp(false);
        const matches = Array.isArray(result.data) ? result.data.slice(0, 5) : [];
        setInviteeMatches(matches);
        if (result.error) setInviteeHint(result.error);
        else if (matches.length === 0) {
          setInviteeHint("No account in any network matches.");
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invitee, inviteeEmail]);

  const tabs: { key: Tab; label: string }[] = isSystemAdmin
    ? [{ key: "list", label: "Incoming" }]
    : [
        { key: "invite", label: "Invite" },
        { key: "place", label: "Access other" },
        { key: "list", label: "My requests" },
      ];

  function toggleZone(id: number, current: number[], setCurrent: (next: number[]) => void) {
    setCurrent(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function onSubmitInvite() {
    if (!invitee) {
      toast.error("Pick an invitee from the search results.");
      return;
    }
    if (selectedZoneIds.length === 0) {
      toast.error("Select at least one primary or communal zone.");
      return;
    }
    setSubmitting(true);
    const result = await createInviteUniversalAccessRequest({
      invitee_email: invitee.email,
      zone_ids: selectedZoneIds,
      note: inviteNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not submit the invite.");
      return;
    }
    toast.success("Invite sent to the system administrator.");
    setInvitee(null);
    setInviteeEmail("");
    setSelectedZoneIds([]);
    setInviteNote("");
    setTab("list");
    await reload();
  }

  async function onSubmitPlace() {
    if (!country.trim() && !region.trim() && !city.trim()) {
      toast.error("Enter at least a country, state/province, or city.");
      return;
    }
    if (!photo) {
      toast.error("Photo ID is required.");
      return;
    }
    if (!businessDoc) {
      toast.error("Business document is required.");
      return;
    }
    setSubmitting(true);
    const result = await createPlaceAccessUniversalRequest({
      country: countryName(country),
      region: region ? regionName(country, region).trim() : "",
      city: city.trim(),
      photo_id: photo,
      business_document: businessDoc,
      note: placeNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not submit the request.");
      return;
    }
    toast.success("Place access request sent.");
    setRegion("");
    setCity("");
    setPlaceNote("");
    setPhoto("");
    setBusinessDoc("");
    setTab("list");
    await reload();
  }

  async function onToggle(row: UniversalAccessRequestRow) {
    if (row.credential_id == null) return;
    setBusyId(row.id);
    const result = await setUniversalAccessEnabled(row.credential_id, !row.enabled);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    await reload();
  }

  async function onApprove(row: UniversalAccessRequestRow) {
    if (row.request_kind === "place_access" && approveZoneIds.length === 0) {
      toast.error("Select at least one matching zone.");
      return;
    }
    setBusyId(row.id);
    const result = await approveUniversalAccessRequest(
      row.id,
      row.request_kind === "place_access" ? approveZoneIds : undefined,
    );
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Request approved.");
    setDetail(null);
    setApproveZoneIds([]);
    await reload();
  }

  async function onReject(row: UniversalAccessRequestRow) {
    setBusyId(row.id);
    const result = await rejectUniversalAccessRequest(row.id, rejectReason.trim());
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Request rejected.");
    setDetail(null);
    await reload();
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void reload()}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          >
            <ScreenHeader
              title="Universal Access"
              subtitle={
                isSystemAdmin
                  ? "Review invite and place-access requests"
                  : "Invite someone, or ask to enter other zones"
              }
              showBack
              onBack={() => router.replace("/(tabs)/settings")}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 }}>
              {tabs.map((item) => (
                <Pressable key={item.key} onPress={() => setTab(item.key)}>
                  <Text
                    style={{
                      color: tab === item.key ? colors.accent : colors.textMuted,
                      fontWeight: "800",
                      fontSize: 12,
                      textTransform: "uppercase",
                      paddingBottom: 8,
                      borderBottomWidth: tab === item.key ? 2 : 0,
                      borderBottomColor: colors.accent,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
            ) : null}

            {!loading && tab === "invite" && !isSystemAdmin ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                    Invite an existing account into your primary or communal zones. No ID
                    documents are required.
                  </Text>
                  <View style={{ zIndex: 5 }}>
                    <Editor
                      label="Invitee email"
                      value={inviteeEmail}
                      onChange={(value) => {
                        setInviteeEmail(value);
                        setInvitee(null);
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {lookingUp ? (
                      <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 6 }}>
                        Searching every network…
                      </Text>
                    ) : null}
                    {inviteeHint ? (
                      <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>
                        {inviteeHint}
                      </Text>
                    ) : null}
                    {inviteeMatches.length > 0 ? (
                      <View
                        style={{
                          marginTop: 6,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 10,
                          overflow: "hidden",
                          backgroundColor: "#fff",
                        }}
                      >
                        {inviteeMatches.map((match) => (
                          <Pressable
                            key={match.id}
                            onPress={() => {
                              setInvitee(match);
                              setInviteeEmail(match.email);
                              setInviteeMatches([]);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                            }}
                          >
                            <Text style={{ color: colors.text, fontWeight: "700" }}>
                              {match.email}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {[match.name, match.network_id].filter(Boolean).join(" · ")}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {invitee ? (
                    <Locked
                      label="Selected invitee"
                      value={`${invitee.name} · ${invitee.email}`}
                    />
                  ) : null}

                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
                    ZONES TO SHARE
                  </Text>
                  {zones.length === 0 ? (
                    <Text style={{ color: colors.textDim, fontSize: 13 }}>
                      Create a primary or communal zone first.
                    </Text>
                  ) : (
                    zones.map((zone) => {
                      const active = selectedZoneIds.includes(zone.id);
                      return (
                        <Pressable
                          key={zone.id}
                          onPress={() =>
                            toggleZone(zone.id, selectedZoneIds, setSelectedZoneIds)
                          }
                          style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: active ? colors.accent : colors.border,
                            backgroundColor: active ? colors.accentGlow : "#F7FAFE",
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: "700" }}>
                            {zone.name}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {[
                              zone.zone_type,
                              zone.is_primary ? "primary" : null,
                              zone.communal ? "communal" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                  <Editor label="Note" value={inviteNote} onChange={setInviteNote} />
                  <Button
                    label={submitting ? "Sending…" : "Send invite request"}
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmitInvite()}
                  />
                </Card>
              </View>
            ) : null}

            {!loading && tab === "place" && !isSystemAdmin ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                    Ask for access to other networks&apos; zones in a place. Attach photo ID
                    and a business document. Fill at least one place field.
                  </Text>
                  <FormSelect
                    label="Country"
                    value={country}
                    searchable
                    options={COUNTRY_OPTIONS}
                    onChange={(iso) => {
                      setCountry(iso);
                      const next = regionOptions(iso);
                      setRegion(next.length === 1 ? next[0].value : "");
                      setCity("");
                    }}
                  />
                  <FormSelect
                    label="State / Province"
                    value={region}
                    searchable
                    options={[{ value: "", label: "Optional" }, ...regions]}
                    onChange={(value) => {
                      setRegion(value);
                      setCity("");
                    }}
                  />
                  <FormSelect
                    label="City"
                    value={city}
                    searchable
                    disabled={!region && regions.length > 0}
                    options={[
                      {
                        value: "",
                        label: region ? "Optional" : "Optional — pick a state first if needed",
                      },
                      ...cities,
                    ]}
                    onChange={setCity}
                  />
                  <Editor label="Note" value={placeNote} onChange={setPlaceNote} />
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
                    <Image
                      source={{ uri: photo }}
                      style={{ width: 120, height: 84, borderRadius: 8 }}
                    />
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
                  <Button
                    label={submitting ? "Sending…" : "Send place-access request"}
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
                {rows.map((row) => (
                  <Card key={row.id} style={{ gap: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {row.request_kind === "place_access" ? "Place access" : "Invite"} ·{" "}
                      {row.member_name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {row.place || "No zones"}
                      {isSystemAdmin ? ` · ${row.network_id}` : ""}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {row.status}
                      {row.code ? ` · ${row.code}` : ""}
                      {row.enabled === false ? " · off" : ""}
                      {row.enabled === true ? " · on" : ""}
                    </Text>
                    {row.reject_reason ? (
                      <Text style={{ color: colors.danger, fontSize: 12 }}>
                        {row.reject_reason}
                      </Text>
                    ) : null}
                    {row.status === "approved" && row.credential_id != null ? (
                      <Button
                        label={
                          busyId === row.id
                            ? "Updating…"
                            : row.enabled
                              ? "Turn off"
                              : "Turn on"
                        }
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onPress={() => void onToggle(row)}
                      />
                    ) : null}
                    {isSystemAdmin && row.status === "pending" ? (
                      <Button
                        label="Review"
                        size="sm"
                        onPress={() => {
                          setRejectReason("");
                          setApproveZoneIds([]);
                          void getUniversalAccessRequest(row.id).then((result) => {
                            if (result.data) {
                              setDetail(result.data);
                              setApproveZoneIds([]);
                            } else if (result.error) toast.error(result.error);
                          });
                        }}
                      />
                    ) : null}
                  </Card>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <Modal
            visible={detail != null}
            transparent
            animationType="fade"
            onRequestClose={() => setDetail(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(15, 44, 92, 0.45)",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Pressable
                style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                onPress={() => setDetail(null)}
              />
              {detail ? (
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <Card style={{ gap: 10, maxHeight: "88%" }}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 10 }}
                    >
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                        {detail.request_kind === "place_access"
                          ? "Place access"
                          : "Invite"}{" "}
                        · {detail.member_name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {detail.email}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 14 }}>
                        {detail.place || "No zones"}
                      </Text>
                      {detail.note ? (
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                          {detail.note}
                        </Text>
                      ) : null}
                      {detail.photo_id ? (
                        <Image
                          source={{ uri: detail.photo_id }}
                          resizeMode="contain"
                          style={{
                            width: "100%",
                            height: 160,
                            borderRadius: 12,
                            backgroundColor: "#F7FAFE",
                          }}
                        />
                      ) : null}
                      {detail.business_document?.startsWith("data:image/") ? (
                        <Image
                          source={{ uri: detail.business_document }}
                          resizeMode="contain"
                          style={{
                            width: "100%",
                            height: 160,
                            borderRadius: 12,
                            backgroundColor: "#F7FAFE",
                          }}
                        />
                      ) : detail.business_document ? (
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          Business document attached.
                        </Text>
                      ) : null}

                      {detail.request_kind === "place_access" ? (
                        <View style={{ gap: 8 }}>
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            MATCHING ZONES
                          </Text>
                          {(detail.candidate_zones ?? []).length === 0 ? (
                            <Text style={{ color: colors.textDim, fontSize: 13 }}>
                              No matching zones found for this place.
                            </Text>
                          ) : (
                            (detail.candidate_zones ?? []).map((zone) => {
                              const active = approveZoneIds.includes(zone.id);
                              return (
                                <Pressable
                                  key={zone.id}
                                  onPress={() =>
                                    toggleZone(zone.id, approveZoneIds, setApproveZoneIds)
                                  }
                                  style={{
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: active ? colors.accent : colors.border,
                                    backgroundColor: active ? colors.accentGlow : "#F7FAFE",
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                  }}
                                >
                                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                                    {zone.name}
                                  </Text>
                                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                                    {[zone.network_id, zone.zone_type]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </Text>
                                </Pressable>
                              );
                            })
                          )}
                        </View>
                      ) : (
                        <View style={{ gap: 4 }}>
                          {(detail.zones ?? []).map((zone) => (
                            <Text key={zone.id} style={{ color: colors.textMuted, fontSize: 13 }}>
                              {zone.name}
                            </Text>
                          ))}
                        </View>
                      )}

                      <Editor
                        label="Reject reason (optional)"
                        value={rejectReason}
                        onChange={setRejectReason}
                      />
                      <Button
                        label={busyId === detail.id ? "Working…" : "Approve"}
                        size="sm"
                        fullWidth
                        disabled={busyId === detail.id}
                        onPress={() => void onApprove(detail)}
                      />
                      <Button
                        label="Reject"
                        size="sm"
                        variant="danger"
                        fullWidth
                        disabled={busyId === detail.id}
                        onPress={() => void onReject(detail)}
                      />
                      <Button
                        label="Close"
                        size="sm"
                        variant="ghost"
                        fullWidth
                        onPress={() => setDetail(null)}
                      />
                    </ScrollView>
                  </Card>
                </KeyboardAvoidingView>
              ) : null}
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: colors.text }}>{value || "—"}</Text>
    </View>
  );
}

function Editor({
  label,
  value,
  onChange,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.textDim}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          backgroundColor: "#F7FAFE",
        }}
      />
    </View>
  );
}
