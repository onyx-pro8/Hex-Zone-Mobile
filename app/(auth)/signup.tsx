import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  Loader2,
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
import { AuthMapPanel } from "@/components/ui/AuthMapPanel";
import { useAuth } from "@/context/AuthContext";
import {
  fetchRegistrationCode,
  type AccountType,
  type RegistrationType,
} from "@/api/auth";
import {
  AUTH_MAP_DEFAULT_CENTER,
  addressToMockCoords,
  generateZoneId,
  type LatLng,
} from "@/lib/h3";
import { colors } from "@/theme/colors";

const accountOptions: {
  value: AccountType;
  title: string;
  lines: [string, string];
}[] = [
  {
    value: "PRIVATE",
    title: "Private",
    lines: ["Many users, 1 device each", "Shared zone type"],
  },
  {
    value: "EXCLUSIVE",
    title: "Exclusive",
    lines: ["1 user, 1 device", "Any zone type"],
  },
  {
    value: "PRIVATE_PLUS",
    title: "Private+",
    lines: ["Up to 10 devices", "Expanded account controls"],
  },
  {
    value: "ENHANCED",
    title: "Enhanced",
    lines: ["1 device only", "Extended zone capabilities"],
  },
  {
    value: "ENHANCED_PLUS",
    title: "Enhanced+",
    lines: ["Unlimited devices", "Maximum controls"],
  },
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
  const { register } = useAuth();
  const params = useLocalSearchParams<{ invite_token?: string | string[] }>();
  const inviteToken = useMemo(() => {
    const raw = Array.isArray(params.invite_token)
      ? params.invite_token[0]
      : params.invite_token;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.invite_token]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("PRIVATE");
  const [registrationType, setRegistrationType] =
    useState<RegistrationType>("ADMINISTRATOR");
  const [accountOwnerId, setAccountOwnerId] = useState("");
  const [address, setAddress] = useState("350 Fifth Avenue, New York");
  const [addressCoords, setAddressCoords] = useState<LatLng | null>(null);
  const [zoneId, setZoneId] = useState(() => generateZoneId());
  const [useExistingZone, setUseExistingZone] = useState(false);
  const [existingZoneId, setExistingZoneId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationCode, setRegistrationCode] = useState("");
  const [regCodeLoading, setRegCodeLoading] = useState(true);
  const [regCodeError, setRegCodeError] = useState<string | null>(null);

  const loadRegistrationCode = useCallback(async () => {
    setRegCodeLoading(true);
    setRegCodeError(null);
    const result = await fetchRegistrationCode();
    if (result.error || !result.data) {
      setRegistrationCode("");
      setRegCodeError(result.error ?? "Could not load registration code.");
    } else {
      setRegistrationCode(result.data);
    }
    setRegCodeLoading(false);
  }, []);

  useEffect(() => {
    if (inviteToken) {
      setRegistrationCode(inviteToken);
      setRegCodeLoading(false);
      setRegCodeError(null);
      return;
    }
    void loadRegistrationCode();
  }, [loadRegistrationCode, inviteToken]);

  const center = useMemo<LatLng>(
    () => addressCoords ?? addressToMockCoords(address) ?? AUTH_MAP_DEFAULT_CENTER,
    [address, addressCoords],
  );
  const selectedZoneId =
    useExistingZone && existingZoneId ? existingZoneId : zoneId;
  const userOnExclusive =
    registrationType === "USER" && accountType === "EXCLUSIVE";

  const onSubmit = async () => {
    setError(null);
    const code = registrationCode.trim();
    if (!code) {
      setError(
        "Registration code is missing. Wait for the server to issue one, or tap Retry.",
      );
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError("Name, email and password are required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (userOnExclusive) {
      setError(
        "Exclusive accounts only allow 1 invited user. Ask the administrator for a QR invite instead.",
      );
      return;
    }
    if (registrationType === "USER" && !accountOwnerId.trim()) {
      setError("User registration requires a valid account owner ID.");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: `${firstName} ${lastName}`.trim(),
        email: email.trim(),
        password,
        accountType,
        registrationType,
        accountOwnerId:
          registrationType === "USER"
            ? Number(accountOwnerId.trim()) || undefined
            : undefined,
        address,
        phone: phone.trim() || undefined,
        zoneId: selectedZoneId,
        registrationCode: code,
      });
      router.replace("/(auth)/login");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /422|exclusive|account owner|zone/i.test(msg)
          ? msg
          : "Could not create account. Please review your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <AuthMapPanel
            center={center}
            addressLabel={address}
            style={{ height: 240 }}
          />

          <View style={{ paddingTop: 8 }}>
            <ScreenHeader showBack />
          </View>

          {/* QR banner */}
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 4,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(255,45,170,0.4)",
              backgroundColor: "rgba(255,45,170,0.08)",
            }}
          >
            <QrCode size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, flex: 1 }}>
              Have a QR code? Scan to auto-populate your Zone ID
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800" }}>
              Create an
            </Text>
            <Text
              style={{
                color: colors.accent,
                fontSize: 30,
                fontWeight: "800",
                marginTop: -4,
              }}
            >
              account
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}
            >
              Provision your member account & first zone in minutes.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24, gap: 14, marginTop: 24 }}>
            {/* Registration code */}
            <View
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgCard,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={labelStyle}>Registration code</Text>
                <Pressable
                  onPress={() => void loadRegistrationCode()}
                  disabled={regCodeLoading}
                  hitSlop={6}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: colors.bgSurface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: regCodeLoading ? 0.6 : 1,
                  }}
                >
                  {regCodeLoading ? (
                    <Loader2 size={12} color={colors.textMuted} />
                  ) : (
                    <RefreshCw size={12} color={colors.textMuted} />
                  )}
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 1.4,
                    }}
                  >
                    RETRY
                  </Text>
                </Pressable>
              </View>
              {regCodeLoading ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                  Requesting registration code from server…
                </Text>
              ) : regCodeError ? (
                <View
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "rgba(255,179,71,0.4)",
                    backgroundColor: "rgba(255,179,71,0.1)",
                  }}
                >
                  <Text style={{ color: colors.warning, fontSize: 12 }}>
                    {regCodeError}
                  </Text>
                </View>
              ) : (
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
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      fontSize: 14,
                    }}
                  >
                    {registrationCode}
                  </Text>
                </View>
              )}
              <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 8 }}>
                Issued by the server when you open this page. Required for
                administrator self-registration.
              </Text>
            </View>

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
              placeholder="alex@hexzone.io"
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
              onChange={(addr, coords) => {
                setAddress(addr);
                setAddressCoords(coords);
              }}
              leftIcon={<MapPin size={18} color={colors.textMuted} />}
            />

            {/* Account type tiles */}
            <Text style={[labelStyle, { marginTop: 6 }]}>Account type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {accountOptions.map((option) => {
                const active = accountType === option.value;
                const disabled =
                  registrationType === "USER" && option.value === "EXCLUSIVE";
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      if (disabled) {
                        setError(
                          "Exclusive account type is not valid for user registration.",
                        );
                        return;
                      }
                      setAccountType(option.value);
                      setError(null);
                    }}
                    disabled={disabled}
                    style={{
                      flexBasis: "48%",
                      flexGrow: 1,
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active
                        ? "rgba(255,45,170,0.1)"
                        : colors.bgCard,
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {option.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        marginTop: 6,
                      }}
                    >
                      {option.lines[0]}
                    </Text>
                    <Text
                      style={{
                        color: colors.textDim,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {option.lines[1]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Registration type */}
            <View
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgCard,
                marginTop: 4,
              }}
            >
              <Text style={labelStyle}>Registration type</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {(["ADMINISTRATOR", "USER"] as RegistrationType[]).map((rt) => {
                  const active = registrationType === rt;
                  return (
                    <Pressable
                      key={rt}
                      onPress={() => setRegistrationType(rt)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active
                          ? "rgba(255,45,170,0.1)"
                          : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: active ? colors.text : colors.textMuted,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {rt === "ADMINISTRATOR" ? "Administrator" : "User"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {registrationType === "USER" ? (
                <View style={{ marginTop: 12 }}>
                  <Input
                    label="Account owner ID"
                    placeholder="101"
                    keyboardType="numeric"
                    value={accountOwnerId}
                    onChangeText={setAccountOwnerId}
                  />
                  <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 6 }}>
                    Linked users must use the admin account owner ID and matching
                    account type/zone scope.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Zone ID */}
            <View
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgCard,
              }}
            >
              <Text style={labelStyle}>Zone ID</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setUseExistingZone(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: !useExistingZone
                      ? colors.accent
                      : colors.bgSurface,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: !useExistingZone ? "#fff" : colors.textMuted,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    Generate New
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setUseExistingZone(true)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: useExistingZone
                      ? colors.accent
                      : colors.bgSurface,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: useExistingZone ? "#fff" : colors.textMuted,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    Enter Existing
                  </Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TextInput
                  editable={useExistingZone}
                  value={useExistingZone ? existingZoneId : zoneId}
                  onChangeText={(v) =>
                    useExistingZone ? setExistingZoneId(v) : undefined
                  }
                  placeholder="ZN-XXXXXXXX"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="characters"
                  style={{
                    flex: 1,
                    backgroundColor: colors.bgSurface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: useExistingZone ? colors.text : colors.accent,
                    fontFamily:
                      Platform.OS === "ios" ? "Menlo" : "monospace",
                    fontSize: 13,
                  }}
                />
                {!useExistingZone ? (
                  <Pressable
                    onPress={() => setZoneId(generateZoneId())}
                    style={{
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: colors.bgSurface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <RefreshCw size={16} color={colors.accent} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Passwords */}
            <Input
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              leftIcon={<Lock size={18} color={colors.textMuted} />}
            />
            <Input
              label="Confirm password"
              placeholder="••••••••"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              leftIcon={<Lock size={18} color={colors.textMuted} />}
              error={error ?? undefined}
            />

            <Button
              label="Signup"
              onPress={onSubmit}
              loading={submitting}
              fullWidth
              size="lg"
              style={{ marginTop: 16 }}
            />

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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
