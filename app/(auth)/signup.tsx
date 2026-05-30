import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Mail, Lock, User, Phone } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { fetchRegistrationCode, type AccountType } from "@/api/auth";
import { colors } from "@/theme/colors";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "PRIVATE_PLUS", label: "Private+" },
  { value: "ENHANCED", label: "Enhanced" },
  { value: "ENHANCED_PLUS", label: "Enhanced+" },
];

export default function SignupScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("PRIVATE");
  const [registrationCode, setRegistrationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRegistrationCode().then((res) => {
      if (!cancelled && res.data) setRegistrationCode(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email and password are required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        accountType,
        registrationType: "ADMINISTRATOR",
        registrationCode: registrationCode ?? undefined,
      });
      router.replace("/(auth)/auth-pin");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create account.",
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
          <View style={{ height: 56 }} />
          <ScreenHeader showBack />
          <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 32,
                fontWeight: "800",
              }}
            >
              Create an
            </Text>
            <Text
              style={{
                color: colors.accent,
                fontSize: 32,
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
            <Input
              label="Full name"
              placeholder="Alex Doe"
              value={name}
              onChangeText={setName}
              leftIcon={<User size={18} color={colors.textMuted} />}
            />
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
              placeholder="+1 555 123 4567"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              leftIcon={<Phone size={18} color={colors.textMuted} />}
            />

            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              Account tier
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => (
                <Button
                  key={t.value}
                  label={t.label}
                  size="sm"
                  variant={accountType === t.value ? "primary" : "secondary"}
                  onPress={() => setAccountType(t.value)}
                />
              ))}
            </View>

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

            {registrationCode ? (
              <Text
                style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}
              >
                Registration code attached automatically.
              </Text>
            ) : null}

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
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Login
                </Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
