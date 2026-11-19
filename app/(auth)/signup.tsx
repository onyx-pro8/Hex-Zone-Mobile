import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Lock, Mail, MapPin, Phone, QrCode, RefreshCw, User } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import {
  AddressAutocompleteInput,
  AddressSuggestionDock,
} from "@/components/ui/AddressAutocompleteInput";
import { AuthMapPanel } from "@/components/ui/AuthMapPanel";
import { OnboardingProgress } from "@/components/auth/OnboardingProgress";
import { OnboardingNav } from "@/components/auth/OnboardingNav";
import { CommunalIdSignupField } from "@/components/auth/CommunalIdSignupField";
import { useAuth } from "@/context/AuthContext";
import {
  checkEmailAvailable,
  validateSignupEmail,
  validateSignupPassword,
} from "@/api/auth";
import {
  AUTH_MAP_DEFAULT_CENTER,
  addressToMockCoords,
  generateZoneId,
  type LatLng,
} from "@/lib/h3";
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

export default function SignupScreen() {
  const router = useRouter();
  const bottomInset = useBottomSafeInset();
  const keyboardInset = useKeyboardBottomInset();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [address, setAddress] = useState("350 Fifth Avenue, New York");
  const [addressCoords, setAddressCoords] = useState<LatLng | null>(null);
  const [zoneId, setZoneId] = useState(() => generateZoneId());
  const [communalId, setCommunalId] = useState("");
  const [communalValidated, setCommunalValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingCredentials, setCheckingCredentials] = useState(false);

  const center = useMemo<LatLng>(
    () =>
      addressCoords ?? addressToMockCoords(address) ?? AUTH_MAP_DEFAULT_CENTER,
    [address, addressCoords],
  );

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
        toast.error("First and last name are required.");
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (!address.trim()) {
        toast.error("Address is required.");
        return false;
      }
      return true;
    }
    if (current === 4) {
      return true;
    }
    if (current === 5 && !zoneId.trim()) {
      toast.error("Enter or generate a network ID.");
      return false;
    }
    return true;
  };

  const goNext = async () => {
    const ok = await validateStep(step);
    if (!ok) return;
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  };

  const onSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      toast.error("Name, email and password are required.");
      return;
    }
    const networkId = zoneId.trim();
    if (!networkId) {
      toast.error("Enter or generate a network ID.");
      return;
    }
    const communal = communalId.trim().toUpperCase();
    if (communal && !communalValidated) {
      toast.error(
        "Validate your Communal ID, or clear it to continue without a primary zone.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: `${firstName} ${lastName}`.trim(),
        email: email.trim(),
        password,
        accountType: "EXCLUSIVE",
        registrationType: "USER",
        address,
        phone: phone.trim() || undefined,
        zoneId: networkId,
        ...(communal ? { communalId: communal } : {}),
      });
      router.replace("/(auth)/login");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        /422|exclusive|individual|account owner|zone|communal|network|administrator|already registered|409/i.test(
          msg,
        )
          ? msg
          : "Could not create account. Please review your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle =
    step === 1
      ? "Create an account"
      : step === 2
        ? "Your name"
        : step === 3
          ? "Contact details"
          : step === 4
            ? "Account setup"
            : "Network ID";

  const stepSubtitle =
    step === 1
      ? "Start with your email and a secure password."
      : step === 2
        ? "How should we address you in the zone?"
        : step === 3
          ? "Optional phone and your home address."
          : step === 4
            ? "Free Individual account. Upgrade later in User settings."
            : "Enter the network ID for this account. A Communal ID is optional.";

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
        <AddressSuggestionDock>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: 24,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {step === 3 && keyboardInset === 0 ? (
              <AuthMapPanel
                center={center}
                addressLabel={address}
                style={{ height: 200 }}
              />
            ) : null}

            <View style={{ paddingTop: 8 }}>
              <ScreenHeader showBack />
            </View>

            <OnboardingProgress
              step={step}
              total={TOTAL_STEPS}
              labels={STEP_LABELS}
            />

            {step === 1 ? (
              <View
                style={{
                  marginHorizontal: 20,
                  marginBottom: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(47,128,237,0.4)",
                  backgroundColor: "rgba(47,128,237,0.08)",
                }}
              >
                <QrCode size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, flex: 1 }}>
                  Have a QR invite? Open the invite link to join a network.
                </Text>
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 24 }}>
              <View
                style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
              >
                <Text
                  style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}
                >
                  {stepTitle.split(" ").slice(0, -1).join(" ") || stepTitle}
                </Text>
                {stepTitle.includes(" ") ? (
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 28,
                      fontWeight: "800",
                      marginTop: -4,
                    }}
                  >
                    {stepTitle.split(" ").slice(-1)[0]}
                  </Text>
                ) : null}
              </View>
              <Text
                style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}
              >
                {stepSubtitle}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 24, gap: 14, marginTop: 24 }}>
              {step === 1 ? (
                <>
                  <Input
                    label="Email"
                    placeholder="alex@safezonepatrol.app"
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
                  <AddressAutocompleteInput
                    label="Address"
                    placeholder="Search for a street or place…"
                    value={address}
                    onChange={(addr, coords) => {
                      setAddress(addr);
                      setAddressCoords(coords);
                    }}
                    leftIcon={<MapPin size={18} color={colors.textMuted} />}
                  />
                </>
              ) : null}

              {step === 4 ? (
                <View
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    backgroundColor: "rgba(47,128,237,0.1)",
                    gap: 8,
                  }}
                >
                  <Text style={labelStyle}>Account type</Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    Individual
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      lineHeight: 17,
                    }}
                  >
                    Free to create. Subscribe to Individual Pro, Family, or
                    Organization later from User settings — no registration code
                    required.
                  </Text>
                  <Text
                    style={{
                      color: colors.textDim,
                      fontSize: 11,
                      lineHeight: 16,
                      marginTop: 4,
                    }}
                  >
                    Role stays User. Optionally pick a Communal ID next for a
                    primary zone, or skip and create up to 2 secondary zones.
                  </Text>
                </View>
              ) : null}

              {step === 5 ? (
                <View style={{ gap: 12 }}>
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
                  <Text
                    style={{
                      color: colors.textDim,
                      fontSize: 11,
                      lineHeight: 16,
                    }}
                  >
                    This is the ID saved on your account. It is shown on the
                    members list exactly as you enter it.
                  </Text>
                  <View
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bgCard,
                    }}
                  >
                    <CommunalIdSignupField
                      value={communalId}
                      onChange={setCommunalId}
                      onValidated={(valid) => setCommunalValidated(valid)}
                    />
                  </View>
                </View>
              ) : null}

              {step === 1 ? (
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    already have an account?
                  </Text>
                  <Link href="/(auth)/login" asChild>
                    <Pressable hitSlop={6}>
                      <Text
                        style={{
                          color: colors.accent,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        Login
                      </Text>
                    </Pressable>
                  </Link>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </AddressSuggestionDock>

        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: footerPad,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
          }}
        >
          <OnboardingNav
            showPrevious={step > 1}
            onPrevious={goPrevious}
            onNext={
              step < TOTAL_STEPS ? () => void goNext() : () => void onSubmit()
            }
            nextLabel={step < TOTAL_STEPS ? "Next" : "Signup"}
            nextLoading={
              step === 1
                ? checkingCredentials
                : step === 5
                  ? submitting
                  : false
            }
          />
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
