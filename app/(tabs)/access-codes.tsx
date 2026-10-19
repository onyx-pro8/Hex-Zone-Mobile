import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
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
import { colors } from "@/theme/colors";

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Indonesia",
  "Finland",
  "Japan",
  "Singapore",
];

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
  const [memberId, setMemberId] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
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

  const reload = useCallback(async () => {
    setLoading(true);
    const [requestResult, memberResult] = await Promise.all([
      listUniversalAccessRequests(),
      isSystemAdmin ? Promise.resolve({ data: [] as Member[], error: null }) : getMembers(),
    ]);
    if (requestResult.error) toast.error(requestResult.error);
    setRows(requestResult.data ?? []);
    setMembers(memberResult.data ?? []);
    setLoading(false);
  }, [isSystemAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      toast.error("Address, region, and city are required.");
      return;
    }
    setSubmitting(true);
    const result = await createUniversalAccessRequest({
      member_id: Number(selected.id),
      address: address.trim(),
      photo_id: photo,
      country,
      region: region.trim(),
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
    if (!rejectReason.trim()) {
      toast.error("A reject reason is required.");
      return;
    }
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
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            <ScreenHeader
              title="Access codes"
              subtitle={isSystemAdmin ? "Review every network" : "Ask for a universal code"}
              showBack
              onBack={() => router.replace("/(tabs)/settings")}
            />
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20 }}>
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
                  <Editor label="Address" value={address} onChange={setAddress} />
                  <FormSelect
                    label="Country"
                    value={country}
                    options={COUNTRIES.map((item) => ({ value: item, label: item }))}
                    onChange={setCountry}
                  />
                  <Editor label="Region" value={region} onChange={setRegion} />
                  <Editor label="City" value={city} onChange={setCity} />
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
                      style={{ width: 96, height: 72, borderRadius: 8 }}
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

            {detail ? (
              <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
                <Card style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>
                    {detail.member_name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {detail.email}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {detail.address}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {detail.place}
                  </Text>
                  {detail.note ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {detail.note}
                    </Text>
                  ) : null}
                  {detail.photo_id ? (
                    <Image
                      source={{ uri: detail.photo_id }}
                      style={{ width: 160, height: 110, borderRadius: 8 }}
                    />
                  ) : null}
                  <Editor
                    label="Reject reason"
                    value={rejectReason}
                    onChange={setRejectReason}
                  />
                  <Button
                    label={busyId === detail.id ? "Working…" : "Approve"}
                    size="sm"
                    disabled={busyId === detail.id}
                    onPress={() => void onApprove(detail)}
                  />
                  <Button
                    label="Reject"
                    size="sm"
                    variant="danger"
                    disabled={busyId === detail.id}
                    onPress={() => void onReject(detail)}
                  />
                  <Button
                    label="Close"
                    size="sm"
                    variant="ghost"
                    onPress={() => setDetail(null)}
                  />
                </Card>
              </View>
            ) : null}
          </ScrollView>
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
