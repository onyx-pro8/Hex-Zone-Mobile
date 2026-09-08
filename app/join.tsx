import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Lock,
  Mail,
  MapPin,
  Phone,
  QrCode,
  RefreshCw,
  User,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { AddressAutocompleteInput } from "@/components/ui/AddressAutocompleteInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import {
  joinWithQrToken,
  previewQrInviteToken,
  type QrInvitePreview,
} from "@/api/guestPublic";
import { generateZoneId } from "@/lib/h3";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

export default function JoinScreen() {
  const router = useRouter();
  const { token: authToken, initializing, logout, login } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  const inviteToken = useMemo(() => {
    const raw = Array.isArray(params.token) ? params.token[0] : params.token;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.token]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("350 Fifth Avenue, New York");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [zoneId, setZoneId] = useState(() => generateZoneId());
  const [preview, setPreview] = useState<QrInvitePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paramsSettled, setParamsSettled] = useState(false);

  const isNewNetworkAdmin = preview?.invite_kind === "new_network_admin";

  useEffect(() => {
    if (inviteToken) {
      setParamsSettled(true);
      return;
    }
    const timer = setTimeout(() => setParamsSettled(true), 400);
    return () => clearTimeout(timer);
  }, [inviteToken]);

  useEffect(() => {
    if (!inviteToken) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");
    void previewQrInviteToken(inviteToken).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setPreview(null);
        setPreviewError(
          result.error ?? "This invite link is invalid or expired.",
        );
      } else {
        setPreview(result.data);
      }
      setPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const onJoin = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your first and last name.");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!address.trim()) {
      toast.error("Address is required.");
      return;
    }
    if (isNewNetworkAdmin && !zoneId.trim()) {
      toast.error("Enter or generate a network ID for your new network.");
      return;
    }

    setSubmitting(true);
    try {
      if (authToken) {
        await logout();
      }
      const join = await joinWithQrToken({
        token: inviteToken,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        address: address.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(isNewNetworkAdmin ? { zone_id: zoneId.trim() } : {}),
      });
      if (join.error || !join.data) {
        throw new Error(
          join.error ?? "Could not complete invite join.",
        );
      }
      await login(email.trim(), password, { rememberMe: true });
      router.replace("/(tabs)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg ||
          "Could not complete registration. Check your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (initializing || !paramsSettled) {
    return (
      <GradientBackground>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.accent} />
        </View>
      </GradientBackground>
    );
  }

  if (!inviteToken) {
    return (
      <GradientBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScreenHeader title="Member invite" subtitle="Join from invite link" />
          <View style={{ paddingHorizontal: 20 }}>
            <Card glow style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <QrCode size={20} color={colors.accent} />
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Invalid invite
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                This link is missing an invite token. Ask your host for a new
                member invite.
              </Text>
              <Button
                label={authToken ? "Back to dashboard" : "Back to welcome"}
                variant="outline"
                onPress={() =>
                  router.replace(authToken ? "/(tabs)" : "/(auth)/welcome")
                }
                fullWidth
              />
            </Card>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <ScreenHeader
              title={
                isNewNetworkAdmin ? "Create network admin" : "Member invite"
              }
              subtitle={
                isNewNetworkAdmin
                  ? "Exclusive admin of a new network"
                  : "Join the inviter's zone"
              }
            />

            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              <Card glow style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <QrCode size={18} color={colors.accent} />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                  >
                    {previewLoading
                      ? "Checking invite…"
                      : previewError
                        ? "Invite unavailable"
                        : isNewNetworkAdmin
                          ? "System admin invite"
                          : "Invite token detected"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {previewError
                    ? previewError
                    : isNewNetworkAdmin
                      ? "You will become the Exclusive administrator of a new network. Choose a network ID below."
                      : preview?.zone_id
                        ? `Your account joins zone ${preview.zone_id}. Account type matches the inviter.`
                        : "Your account will inherit the inviter's zone and account type."}
                </Text>
                <View
                  style={{
                    marginTop: 2,
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: colors.bgSurface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    selectable
                    style={{
                      color: colors.accent,
                      fontFamily:
                        Platform.OS === "ios" ? "Menlo" : "monospace",
                      fontSize: 12,
                    }}
                  >
                    {inviteToken}
                  </Text>
                </View>
              </Card>

              {isNewNetworkAdmin ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                    <Input
                      label="Network ID"
                      placeholder="Network-ABC123"
                      value={zoneId}
                      onChangeText={setZoneId}
                      autoCapitalize="characters"
                      containerStyle={{ flex: 1 }}
                    />
                    <Pressable
                      onPress={() => setZoneId(generateZoneId())}
                      style={{
                        height: 48,
                        width: 48,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.bgSurface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        marginBottom: 2,
                      }}
                      accessibilityLabel="Generate network ID"
                    >
                      <RefreshCw size={18} color={colors.accent} />
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>
                    Account type: Exclusive
                  </Text>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Input
                  label="First name"
                  placeholder="Alex"
                  value={firstName}
                  onChangeText={setFirstName}
                  leftIcon={<User size={18} color={colors.textMuted} />}
                  containerStyle={{ flex: 1 }}
                />
                <Input
                  label="Last name"
                  placeholder="Chen"
                  value={lastName}
                  onChangeText={setLastName}
                  containerStyle={{ flex: 1 }}
                />
              </View>

              <Input
                label="Email"
                placeholder="alex@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                leftIcon={<Mail size={18} color={colors.textMuted} />}
              />

              <Input
                label="Phone (optional)"
                placeholder="+1 555 0123"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                leftIcon={<Phone size={18} color={colors.textMuted} />}
              />

              <AddressAutocompleteInput
                label="Address"
                placeholder="Search for a street or place…"
                value={address}
                onChange={(addr) => setAddress(addr)}
                leftIcon={<MapPin size={18} color={colors.textMuted} />}
              />

              <Input
                label="Password"
                placeholder="At least 8 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                leftIcon={<Lock size={18} color={colors.textMuted} />}
              />
              <Input
                label="Confirm password"
                placeholder="Repeat password"
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
                leftIcon={<Lock size={18} color={colors.textMuted} />}
              />

              <Button
                label={
                  authToken
                    ? "Sign out & create account"
                    : isNewNetworkAdmin
                      ? "Create Exclusive network"
                      : "Create account"
                }
                onPress={() => void onJoin()}
                loading={submitting}
                disabled={!!previewError || previewLoading}
                fullWidth
                size="lg"
                style={{ marginTop: 4 }}
              />

              <Pressable
                onPress={() =>
                  router.replace(authToken ? "/(tabs)" : "/(auth)/welcome")
                }
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    textAlign: "center",
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
