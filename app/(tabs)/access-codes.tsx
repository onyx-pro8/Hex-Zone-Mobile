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
import { getMembers, type Member } from "@/api/members";
import {
  approveUniversalAccessRequest,
  createUniversalAccessRequest,
  getUniversalAccessRequest,
  listUniversalAccessRequests,
  rejectUniversalAccessRequest,
  setUniversalAccessEnabled,
  type UniversalAccessRequestRow,
} from "@/api/universalAccess";
import { toast } from "@/lib/toast";
import {
  cityOptions,
  COUNTRY_OPTIONS,
  countryName,
  matchRegion,
  regionName,
  regionOptions,
} from "@/lib/places";
import { colors } from "@/theme/colors";

type Tab = "compose" | "list";

async function photoDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    toast.error("Photo library permission is required for the photo ID.");
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
  const [tab, setTab] = useState<Tab>(isSystemAdmin ? "list" : "compose");
  const [rows, setRows] = useState<UniversalAccessRequestRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);
  const [memberId, setMemberId] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UniversalAccessRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const selected = useMemo(
    () => members.find((member) => member.id === memberId) ?? null,
    [members, memberId],
  );
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

  function applyCountry(iso: string) {
    setCountry(iso);
    const nextRegions = regionOptions(iso);
    setRegion(nextRegions.length === 1 ? nextRegions[0].value : "");
    setCity("");
  }

  const reload = useCallback(async () => {
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    const [requestResult, memberResult] = await Promise.all([
      listUniversalAccessRequests(),
      isSystemAdmin ? Promise.resolve({ data: [] as Member[], error: null }) : getMembers(),
    ]);
    if (requestResult.error) toast.error(requestResult.error);
    setRows(requestResult.data ?? []);
    setMembers(memberResult.data ?? []);
    loadedOnce.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [isSystemAdmin]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const tabs: { key: Tab; label: string }[] = isSystemAdmin
    ? [
        { key: "list", label: "Incoming" },
        { key: "compose", label: "Issued" },
      ]
    : [
        { key: "compose", label: "New request" },
        { key: "list", label: "My requests" },
      ];
  const issued = rows.filter((row) => row.status === "approved");
  const tableRows = isSystemAdmin && tab === "compose" ? issued : rows;

  async function onSubmit() {
    if (!selected) {
      toast.error("Pick a member who already has an account.");
      return;
    }
    if (!photo) {
      toast.error("Photo ID is required.");
      return;
    }
    if (!region.trim() || !city.trim() || !address.trim()) {
      toast.error("Address, state/province, and city are required.");
      return;
    }
    setSubmitting(true);
    const result = await createUniversalAccessRequest({
      member_id: Number(selected.id),
      address: address.trim(),
      photo_id: photo,
      country: countryName(country),
      region: regionName(country, region).trim(),
      city: city.trim(),
      note: note.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not submit the request.");
      return;
    }
    setMemberId("");
    setAddress("");
    setCountry("US");
    setRegion("");
    setCity("");
    setNote("");
    setPhoto("");
    setTab("list");
    toast.success("Request sent.");
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
    setBusyId(row.id);
    const result = await approveUniversalAccessRequest(row.id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDetail(null);
    toast.success("Access code issued.");
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
    setRejectReason("");
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
              title="Access codes"
              subtitle={isSystemAdmin ? "Review every network" : "Ask for a universal code"}
              showBack
              onBack={() => router.replace("/(tabs)/settings")}
            />
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20 }}>
              {tabs.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setTab(item.key);
                    void reload();
                  }}
                >
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

            {!loading && tab === "compose" && !isSystemAdmin ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 12 }}>
                  <FormSelect
                    label="Member"
                    value={memberId}
                    options={[
                      { value: "", label: "Choose a member" },
                      ...members.map((member) => ({
                        value: member.id,
                        label: member.name,
                      })),
                    ]}
                    onChange={(id) => {
                      setMemberId(id);
                      const member = members.find((row) => row.id === id);
                      setAddress(member?.address ?? "");
                    }}
                  />
                  <Locked label="Name" value={selected?.name ?? ""} />
                  <Locked label="Registered email" value={selected?.email ?? ""} />
                  <AddressSearch
                    value={address}
                    onChange={setAddress}
                    onPick={(hit) => {
                      setAddress(hit.street);
                      if (
                        hit.countryIso &&
                        COUNTRY_OPTIONS.some((item) => item.value === hit.countryIso)
                      ) {
                        setCountry(hit.countryIso);
                        setRegion(hit.region);
                        setCity(hit.city);
                      }
                    }}
                  />
                  <FormSelect
                    label="Country"
                    value={country}
                    searchable
                    options={COUNTRY_OPTIONS}
                    onChange={applyCountry}
                  />
                  <FormSelect
                    label="State / Province"
                    value={region}
                    searchable
                    options={[
                      { value: "", label: "Select state / province" },
                      ...regions,
                    ]}
                    onChange={(value) => {
                      setRegion(value);
                      setCity("");
                    }}
                  />
                  <FormSelect
                    label="City"
                    value={city}
                    searchable
                    disabled={!region}
                    options={[
                      { value: "", label: region ? "Select city" : "Select a state or province first" },
                      ...cities,
                    ]}
                    onChange={setCity}
                  />
                  <Editor label="Note" value={note} onChange={setNote} />
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
                    label={submitting ? "Sending…" : "Submit request"}
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmit()}
                  />
                </Card>
              </View>
            ) : null}

            {!loading && (tab === "list" || (isSystemAdmin && tab === "compose")) ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 10 }}>
                {tableRows.length === 0 ? (
                  <Text style={{ color: colors.textMuted, paddingHorizontal: 4 }}>
                    Nothing here yet.
                  </Text>
                ) : null}
                {tableRows.map((row) => (
                  <Card key={row.id} style={{ gap: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {row.member_name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {row.place}
                      {isSystemAdmin ? ` · ${row.network_id}` : ""}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {row.status}
                      {row.code ? ` · ${row.code}` : ""}
                      {row.enabled === false ? " · off" : ""}
                      {row.enabled === true ? " · on" : ""}
                    </Text>
                    {row.reject_reason ? (
                      <Text style={{ color: "#E23B4E", fontSize: 12 }}>
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
                          void getUniversalAccessRequest(row.id).then((result) => {
                            if (result.data) setDetail(result.data);
                            else if (result.error) toast.error(result.error);
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
                        {detail.member_name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {detail.email}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 14 }}>
                        {detail.address}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {detail.place}
                        {detail.network_id ? ` · ${detail.network_id}` : ""}
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
                            height: 220,
                            borderRadius: 12,
                            backgroundColor: "#F7FAFE",
                          }}
                        />
                      ) : null}
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

type AddressHit = {
  id: string;
  label: string;
  street: string;
  countryIso: string;
  region: string;
  city: string;
};

type PhotonFeature = {
  properties?: {
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    county?: string;
    country?: string;
    countrycode?: string;
  };
};

function toAddressHit(feature: PhotonFeature, index: number): AddressHit {
  const parts = feature.properties ?? {};
  const street = [parts.housenumber, parts.street || parts.name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const countryIso = (parts.countrycode ?? "").toUpperCase();
  const city = parts.city || "";
  const stateName = parts.state || parts.county || "";
  const label = [street, city, stateName, parts.country].filter(Boolean).join(", ");
  return {
    id: String(parts.osm_id ?? index),
    label: label || street,
    street,
    countryIso,
    region: countryIso ? matchRegion(countryIso, stateName) || stateName : "",
    city,
  };
}

function AddressSearch({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (hit: AddressHit) => void;
}) {
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [searching, setSearching] = useState(false);
  const skip = useRef("");

  useEffect(() => {
    if (value === skip.current) return;
    const query = value.trim();
    if (query.length < 3) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(query)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      )
        .then((response) => (response.ok ? response.json() : { features: [] }))
        .then((payload: { features?: PhotonFeature[] }) => {
          setHits(
            (payload.features ?? [])
              .map(toAddressHit)
              .filter((hit) => hit.street),
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setHits([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        ADDRESS
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search street or place"
        placeholderTextColor={colors.textDim}
        autoCorrect={false}
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
      {searching ? (
        <Text style={{ color: colors.textDim, fontSize: 12 }}>Searching…</Text>
      ) : null}
      {hits.map((hit) => (
        <Pressable
          key={hit.id}
          onPress={() => {
            skip.current = hit.street;
            setHits([]);
            onPick(hit);
          }}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "#FFFFFF",
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>{hit.label}</Text>
        </Pressable>
      ))}
    </View>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
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
