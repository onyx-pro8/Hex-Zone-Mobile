import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Mail, Lock } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password, { rememberMe });
      router.replace("/(tabs)");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed. Check your credentials and try again.",
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
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ height: 56 }} />
          <ScreenHeader showBack />
          <View style={{ paddingHorizontal: 24, gap: 12, marginTop: 8 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 36,
                fontWeight: "800",
                letterSpacing: 0.2,
              }}
            >
              Welcome
            </Text>
            <Text
              style={{
                color: colors.accent,
                fontSize: 36,
                fontWeight: "800",
                marginTop: -8,
              }}
            >
              Back!
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: 14, marginTop: 8 }}
            >
              Sign in to manage your zones, members, and access requests.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24, gap: 16, marginTop: 28 }}>
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
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              leftIcon={<Lock size={18} color={colors.textMuted} />}
              error={error ?? undefined}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Pressable
                onPress={() => setRememberMe((s) => !s)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
                hitSlop={6}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: rememberMe ? colors.accent : colors.border,
                    backgroundColor: rememberMe ? colors.accent : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {rememberMe ? (
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: "700",
                        marginTop: -1,
                      }}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Remember me
                </Text>
              </Pressable>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                Forgot Password?
              </Text>
            </View>

            <Button
              label="Login"
              onPress={onSubmit}
              loading={submitting}
              fullWidth
              size="lg"
              style={{ marginTop: 12 }}
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
                Don't have an account?
              </Text>
              <Link href="/(auth)/signup" asChild>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Signup
                </Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
