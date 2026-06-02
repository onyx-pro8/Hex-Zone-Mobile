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
import { Lock, Mail, MapPin, Phone, QrCode, User } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { AddressAutocompleteInput } from "@/components/ui/AddressAutocompleteInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { joinWithQrToken } from "@/api/guestPublic";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initializing) return;
    if (!inviteToken) {
      router.replace(authToken ? "/(tabs)" : "/(auth)/welcome");
    }
  }, [initializing, inviteToken, authToken, router]);

  const onJoin = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
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
      });
      if (join.error || !join.data) {
        throw new Error(
          join.error ?? "Could not complete invite join.",
        );
      }
      // Sign the new user in straight away with the credentials they entered.
      // Server inherited zone_id + account_type from the inviter, so the
      // session lands on the correct account.
      await login(email.trim(), password, { rememberMe: true });
      router.replace("/(tabs)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg ||
          "Could not complete registration. Check your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (initializing || !inviteToken) {
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
              title="Member invite"
              subtitle="Join the inviter's zone"
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
                    Invite token detected
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  Your account will inherit the inviter's zone and account
                  type. No need to pick them.
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
                error={error ?? undefined}
              />

              <Button
                label={authToken ? "Sign out & create account" : "Create account"}
                onPress={() => void onJoin()}
                loading={submitting}
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
