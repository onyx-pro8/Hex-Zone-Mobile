import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { AlertTriangle, Lock, Mail, QrCode } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AuthMapPanel } from "@/components/ui/AuthMapPanel";
import { useAuth } from "@/context/AuthContext";
import {
  DEVICE_CHANGE_DECLINED_MESSAGE,
  DEVICE_CHANGE_PROMPT_MESSAGE,
  DEVICE_CHANGE_PROMPT_TITLE,
  isDeviceSessionConflictError,
  isDeviceSessionConflictMessage,
} from "@/lib/deviceSync";
import { AUTH_MAP_DEFAULT_CENTER } from "@/lib/h3";
import { getLastEmail, getRememberMe, setLastEmail } from "@/lib/storage";
import { getSecureCredentials } from "@/lib/secureCredentials";
import { useBottomSafeInset } from "@/hooks/useBottomSafeInset";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const router = useRouter();
  const bottomInset = useBottomSafeInset();
  const { login, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deviceChangePromptVisible, setDeviceChangePromptVisible] =
    useState(false);

  // Pick up errors from background device sync (e.g. account device limit
  // hit when restoring an existing token on a second phone).
  useEffect(() => {
    if (!authError) return;
    if (isDeviceSessionConflictMessage(authError)) {
      setDeviceChangePromptVisible(true);
      setError(null);
      return;
    }
    setError(authError);
  }, [authError]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const [savedEmail, savedRemember, creds] = await Promise.all([
          getLastEmail(),
          getRememberMe(),
          getSecureCredentials(),
        ]);
        if (!active) return;
        if (creds) {
          setEmail(creds.email);
          setPassword(creds.password);
          setRememberMe(true);
          return;
        }
        if (savedEmail) setEmail(savedEmail);
        setPassword("");
        setRememberMe(savedRemember);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const center = AUTH_MAP_DEFAULT_CENTER;

  const onSubmit = async (forceDeviceTakeover = false) => {
    setError(null);
    clearAuthError();
    setDeviceChangePromptVisible(false);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password, { rememberMe, forceDeviceTakeover });
      void setLastEmail(email.trim());
      router.replace("/(tabs)");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Login failed. Check your credentials and try again.";
      const isConflict =
        isDeviceSessionConflictError(err) ||
        isDeviceSessionConflictMessage(message);
      if (isConflict && !forceDeviceTakeover) {
        setDeviceChangePromptVisible(true);
        return;
      }
      if (
        !isDeviceSessionConflictMessage(message) &&
        /inactive|expired/i.test(message)
      ) {
        setError("Account is inactive or expired");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onDeclineDeviceChange = () => {
    setDeviceChangePromptVisible(false);
    setError(DEVICE_CHANGE_DECLINED_MESSAGE);
  };

  const onAcceptDeviceChange = () => {
    setDeviceChangePromptVisible(false);
    void onSubmit(true);
  };

  return (
    <GradientBackground>
      <Modal
        visible={deviceChangePromptVisible}
        transparent
        animationType="fade"
        onRequestClose={onDeclineDeviceChange}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              backgroundColor: colors.bgSurface,
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 16,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {DEVICE_CHANGE_PROMPT_TITLE}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 14,
                lineHeight: 21,
                textAlign: "center",
              }}
            >
              {DEVICE_CHANGE_PROMPT_MESSAGE}
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable
                onPress={onDeclineDeviceChange}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  No
                </Text>
              </Pressable>
              <Pressable
                onPress={onAcceptDeviceChange}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  Yes
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(24, bottomInset + 16),
          }}
          keyboardShouldPersistTaps="handled"
        >
          <AuthMapPanel
            center={center}
            addressLabel="New York, NY"
            style={{ height: 280 }}
          />

          <View style={{ paddingTop: 8 }}>
            <ScreenHeader showBack />
          </View>

          {/* QR banner (mirrors web client) */}
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
              borderColor: "rgba(47,128,237,0.4)",
              backgroundColor: "rgba(47,128,237,0.08)",
            }}
          >
            <QrCode size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, flex: 1 }}>
              Have a QR code? Scan to auto-populate your Zone ID
            </Text>
          </View>

          <View style={{ paddingHorizontal: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 32,
                  fontWeight: "800",
                }}
              >
                Welcome
              </Text>
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 32,
                  fontWeight: "800",
                  marginTop: -4,
                }}
              >
                Back!
              </Text>
            </View>
            <Text
              style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}
            >
              Sign in to manage your zones, members, and access requests.
            </Text>
          </View>

          {error ? (
            <View
              style={{
                marginHorizontal: 24,
                marginBottom: 4,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255, 179, 71, 0.5)",
                backgroundColor: "rgba(255, 179, 71, 0.1)",
              }}
            >
              <AlertTriangle size={16} color={colors.warning} />
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 24, gap: 16, marginTop: 24 }}>
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
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              leftIcon={<Lock size={18} color={colors.textMuted} />}
              error={
                error && /inactive|expired|credentials/i.test(error)
                  ? error
                  : undefined
              }
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
              <Pressable hitSlop={8}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Forgot Password?
                </Text>
              </Pressable>
            </View>

            <Button
              label="Login"
              onPress={() => void onSubmit(false)}
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
                <Pressable hitSlop={6}>
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Signup
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
