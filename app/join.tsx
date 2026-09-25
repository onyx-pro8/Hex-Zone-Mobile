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
import { OnboardingProgress } from "@/components/auth/OnboardingProgress";
import { OnboardingNav } from "@/components/auth/OnboardingNav";
import { useAuth } from "@/context/AuthContext";
import {
  joinWithQrToken,
  previewQrInviteToken,
  type QrInvitePreview,
} from "@/api/guestPublic";
import {
  checkEmailAvailable,
  validateSignupEmail,
  validateSignupPassword,
} from "@/api/auth";
import { generateZoneId } from "@/lib/h3";
import { accountTypeLabel, normalizeAccountType } from "@/lib/accountLimits";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";
import { useBottomSafeInset } from "@/hooks/useBottomSafeInset";
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";

const TOTAL_STEPS = 5;
const STEP_LABELS = [
  "Credentials",
  "Name",
  "Contact",
  "Account",
  "Network",
];

const labelStyle = {
  color: colors.textMuted,
  fontSize: 10,
  fontWeight: "700" as const,
  letterSpacing: 2,
  textTransform: "uppercase" as const,
  marginBottom: 8,
};

export default function JoinScreen() {
  const router = useRouter();
  const bottomInset = useBottomSafeInset();
  const keyboardInset = useKeyboardBottomInset();
  const { token: authToken, initializing, logout, login } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  const inviteToken = useMemo(() => {
    const raw = Array.isArray(params.token) ? params.token[0] : params.token;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.token]);

  const [step, setStep] = useState(1);
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
  const [checkingCredentials, setCheckingCredentials] = useState(false);
  const [paramsSettled, setParamsSettled] = useState(false);

  const isNewNetworkAdmin = preview?.invite_kind === "new_network_admin";
  const invitedAccountType = preview?.account_type
    ? normalizeAccountType(preview.account_type)
    : "EXCLUSIVE";
  const isFamilyMemberInvite =
    !isNewNetworkAdmin &&
    preview?.invite_kind === "member" &&
    invitedAccountType === "PRIVATE_PLUS";
  const invitedAccountLabel = isNewNetworkAdmin
    ? "Individual"
    : accountTypeLabel(invitedAccountType);
  const membersAtCapacity =
    !isNewNetworkAdmin && Boolean(preview?.members_at_capacity);
  const [capacityBlocked, setCapacityBlocked] = useState(false);

  useEffect(() => {
    setCapacityBlocked(false);
  }, [inviteToken]);

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

  const goPrevious = () => {
    setStep((current) => Math.max(1, current - 1));
  };

  const validateStep = async (current: number): Promise<boolean> => {
    if (current === 1) {
      const emailError = validateSignupEmail(email);
      if (emailError) {
        toast.error(emailError);
        return false;
      }
      const passwordError = validateSignupPassword(password, confirm);
      if (passwordError) {
        toast.error(passwordError);
        return false;
      }
      setCheckingCredentials(true);
      try {
        const result = await checkEmailAvailable(email);
        if (result.error || !result.data?.available) {
          toast.error(result.error ?? "Email already registered");
          return false;
        }
        return true;
      } finally {
        setCheckingCredentials(false);
      }
    }
    if (current === 2) {
      if (!firstName.trim() || !lastName.trim()) {
        toast.error("Please enter your first and last name.");
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (!isFamilyMemberInvite && !address.trim()) {
        toast.error("Address is required.");
        return false;
      }
      return true;
    }
    if (current === 5 && isNewNetworkAdmin && !zoneId.trim()) {
      toast.error("Enter or generate a network ID for your new network.");
      return false;
    }
    return true;
  };

  const goNext = async () => {
    const ok = await validateStep(step);
    if (!ok) return;
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  };

  const onJoin = async () => {
    const ok = await validateStep(5);
    if (!ok) return;

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
        ...(isFamilyMemberInvite ? {} : { address: address.trim() }),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(isNewNetworkAdmin ? { zone_id: zoneId.trim() } : {}),
      });
      if (join.error || !join.data) {
        const msg = join.error ?? "Could not complete invite join.";
        const isCapacity =
          join.status === 403 &&
          /limited|capacity|independent Individual/i.test(msg);
        if (isCapacity) {
          setCapacityBlocked(true);
        }
        throw new Error(msg);
      }
      const welcomeText = (
        join.data.joinWelcomeMessage ??
        join.data.join_welcome_message ??
        ""
      ).trim();
      await login(email.trim(), password, { rememberMe: true });
      if (welcomeText) {
        toast.info(welcomeText, { title: "Welcome", duration: 5000 });
      }
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

  const showCapacityNotice = membersAtCapacity || capacityBlocked;

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

  const stepTitle =
    step === 1
      ? "Create an account"
      : step === 2
        ? "Your name"
        : step === 3
          ? "Contact details"
          : step === 4
            ? "Account type"
            : "Invite & network";

  const stepSubtitle =
    step === 1
      ? "Start with your email and a secure password."
      : step === 2
        ? "How should we address you in the zone?"
        : step === 3
          ? isFamilyMemberInvite
            ? "Optional phone. Home address is the family account address."
            : "Optional phone and your home address."
          : step === 4
            ? isFamilyMemberInvite
              ? "You join as a Family user on the administrator's account."
              : "Invitees register as Individual user accounts."
            : isNewNetworkAdmin
              ? "Confirm your invite code and choose a network ID."
              : "Confirm your invite code and join the host network.";

  const footerPad =
    Platform.OS === "android" && keyboardInset > 0
      ? keyboardInset + 12
      : Math.max(16, bottomInset + 12);

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <ScreenHeader
              title={
                isNewNetworkAdmin ? "Create network admin" : "Member invite"
              }
              subtitle={
                isNewNetworkAdmin
                  ? "Individual account for a new network"
                  : "Join the inviter's zone"
              }
            />

            <OnboardingProgress
              step={step}
              total={TOTAL_STEPS}
              labels={STEP_LABELS}
            />

            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <Text
                style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}
              >
                {stepTitle}
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}
              >
                {stepSubtitle}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              {showCapacityNotice ? (
                <Card
                  style={{
                    gap: 10,
                    borderColor: "#D4A017",
                    backgroundColor: "#FFF8E7",
                  }}
                >
                  <Text
                    style={{
                      color: "#5C4300",
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                  >
                    Currently the number of members on this account is limited.
                  </Text>
                  <Text
                    style={{
                      color: "#7A5A00",
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  >
                    You can sign up as an independent Individual account instead.
                  </Text>
                  <Button
                    label="Sign up as Individual"
                    onPress={() => router.replace("/(auth)/signup")}
                    fullWidth
                  />
                </Card>
              ) : null}

              {step === 1 ? (
                <>
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
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Input
                    label="First name"
                    placeholder="Alex"
                    value={firstName}
                    onChangeText={setFirstName}
                    leftIcon={<User size={18} color={colors.textMuted} />}
                  />
                  <Input
                    label="Last name"
                    placeholder="Chen"
                    value={lastName}
                    onChangeText={setLastName}
                    leftIcon={<User size={18} color={colors.textMuted} />}
                  />
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Input
                    label="Phone (optional)"
                    placeholder="+1 555 0123"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    leftIcon={<Phone size={18} color={colors.textMuted} />}
                  />
                  {isFamilyMemberInvite ? (
                    <Card style={{ gap: 6 }}>
                      <Text style={labelStyle}>Address</Text>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        Same as family administrator
                      </Text>
                      <Text
                        style={{
                          color: colors.textDim,
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        Family members share the administrator's home address.
                      </Text>
                    </Card>
                  ) : (
                    <AddressAutocompleteInput
                      label="Address"
                      placeholder="Search for a street or place…"
                      value={address}
                      onChange={(addr) => setAddress(addr)}
                      leftIcon={<MapPin size={18} color={colors.textMuted} />}
                    />
                  )}
                </>
              ) : null}

              {step === 4 ? (
                <Card style={{ gap: 10 }}>
                  <Text style={labelStyle}>Account type</Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    {invitedAccountLabel}
                  </Text>
                  <Text style={labelStyle}>Role</Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    User
                  </Text>
                  <Text
                    style={{
                      color: colors.textDim,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {isFamilyMemberInvite
                      ? "Joins the family account · Home address is shared with the administrator"
                      : isNewNetworkAdmin
                        ? "Up to 3 secondary zones · No member invites · No smart-home hubs"
                        : "Up to 2 secondary zones · No member invites · No smart-home hubs"}
                  </Text>
                  {preview?.zone_id && !isNewNetworkAdmin ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Joining zone {preview.zone_id}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              {step === 5 ? (
                <>
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
                              : "Member invite"}
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
                          ? "You will create an Individual (user-role) account for a new network."
                          : preview?.zone_id
                            ? `Your account joins zone ${preview.zone_id} as a ${invitedAccountLabel} (user-role) member.`
                            : `Your account joins the inviter's zone as a ${invitedAccountLabel} (user-role) member.`}
                    </Text>
                  </Card>

                  <View
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bgCard,
                    }}
                  >
                    <Text style={labelStyle}>Registration code</Text>
                    <View
                      style={{
                        marginTop: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor: colors.bgSurface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.accent,
                          fontFamily:
                            Platform.OS === "ios" ? "Menlo" : "monospace",
                          fontSize: 14,
                        }}
                      >
                        FREE
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: colors.textDim,
                        fontSize: 11,
                        marginTop: 8,
                      }}
                    >
                      Individual accounts always use the FREE registration code.
                    </Text>
                  </View>

                  {isNewNetworkAdmin ? (
                    <View style={{ gap: 8 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "flex-end",
                        }}
                      >
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
                    </View>
                  ) : preview && !previewError ? (
                    <View
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.bgCard,
                      }}
                    >
                      <Text style={labelStyle}>Network ID</Text>
                      <Text
                        style={{
                          color: colors.accent,
                          fontFamily:
                            Platform.OS === "ios" ? "Menlo" : "monospace",
                          fontSize: 13,
                        }}
                      >
                        {preview.zone_id || "Assigned by host"}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              <Pressable
                onPress={() =>
                  showCapacityNotice
                    ? router.replace("/(auth)/signup")
                    : router.replace(authToken ? "/(tabs)" : "/(auth)/welcome")
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
                  {showCapacityNotice
                    ? "Create Independent Individual account"
                    : "Cancel"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: footerPad,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.bg,
            }}
          >
            {showCapacityNotice ? (
              <Button
                label="Sign up as Individual"
                onPress={() => router.replace("/(auth)/signup")}
                fullWidth
              />
            ) : (
              <OnboardingNav
                showPrevious={step > 1}
                onPrevious={goPrevious}
                onNext={
                  step < TOTAL_STEPS ? () => void goNext() : () => void onJoin()
                }
                nextLabel={
                  step < TOTAL_STEPS
                    ? "Next"
                    : authToken
                      ? "Sign out & Signup"
                      : "Signup"
                }
                nextLoading={
                  step === 1
                    ? checkingCredentials
                    : step === 5
                      ? submitting
                      : false
                }
                nextDisabled={step === 5 && (!!previewError || previewLoading)}
              />
            )}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
