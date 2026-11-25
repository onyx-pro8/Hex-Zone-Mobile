import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  confirmPasswordReset,
  requestPasswordReset,
  resendPasswordReset,
  resetPassword,
} from "@/api/auth";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const CODE_LENGTH = 4;

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

type Step = "email" | "code" | "password";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => {
      setResendIn((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const applyDigits = (raw: string, startIndex: number) => {
    const chars = raw.replace(/\D/g, "").slice(0, CODE_LENGTH - startIndex).split("");
    if (chars.length === 0) {
      setDigits((current) => {
        const next = [...current];
        next[startIndex] = "";
        return next;
      });
      return;
    }
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => {
        next[startIndex + offset] = char;
      });
      return next;
    });
    const focusAt = Math.min(startIndex + chars.length, CODE_LENGTH - 1);
    inputs.current[focusAt]?.focus();
  };

  const onSend = async () => {
    const address = email.trim();
    if (!address) {
      toast.error("Enter the email on your account.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(address);
      if (result.error || !result.data) {
        toast.error(result.error || "Could not send a reset code.");
        return;
      }
      setDigits(Array(CODE_LENGTH).fill(""));
      setResendIn(result.data.resend_after_seconds ?? 60);
      if (result.data.delivery === "logged") {
        toast.info("The reset code was written to the server log.");
      } else if (!result.data.sent && result.data.delivery !== "cooldown") {
        toast.error("Could not email the code. You can resend it on the next screen.");
      }
      setStep("code");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    const code = digits.join("");
    if (code.length < CODE_LENGTH) {
      toast.error("Enter the 4-digit verification code.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirmPasswordReset(email.trim(), code);
      if (result.error || !result.data?.reset_token) {
        toast.error(result.error || "That code could not be verified.");
        return;
      }
      setResetToken(result.data.reset_token);
      setStep("password");
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (resendIn > 0 || submitting) return;
    setSubmitting(true);
    try {
      const result = await resendPasswordReset(email.trim());
      if (result.error || !result.data) {
        toast.error(result.error || "Could not resend the code.");
        return;
      }
      setResendIn(result.data.resend_after_seconds ?? 60);
      if (result.data.sent) toast.success("A new code is on its way.");
      else if (result.data.delivery === "logged") {
        toast.info("The new code was written to the server log.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onSave = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetPassword(email.trim(), resetToken, password);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Password updated. Sign in to continue.");
      router.replace("/(auth)/login");
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === "email" ? "Reset" : step === "code" ? "Verify" : "New";
  const accent = step === "email" ? "password" : step === "code" ? "your email" : "password";
  const lead =
    step === "email"
      ? "Enter the email on your account. We'll send a 4-digit code."
      : step === "code"
        ? `Enter the 4-digit code sent to ${email.trim()}.`
        : "Choose a new password for this account.";

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ height: 56 }} />
        <ScreenHeader showBack />
        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: "800" }}>{title}</Text>
          <Text
            style={{
              color: colors.accent,
              fontSize: 32,
              fontWeight: "800",
              marginTop: -4,
            }}
          >
            {accent}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>{lead}</Text>
        </View>

        {step === "email" ? (
          <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 16 }}>
            <Input
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Button
              label="Send verification code"
              onPress={() => void onSend()}
              loading={submitting}
              fullWidth
              size="lg"
            />
          </View>
        ) : null}

        {step === "code" ? (
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 14,
                marginTop: 40,
                paddingHorizontal: 24,
              }}
            >
              {digits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputs.current[index] = ref;
                  }}
                  value={digit}
                  onChangeText={(value) => applyDigits(value, index)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === "Backspace" && !digit && index > 0) {
                      inputs.current[index - 1]?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={index === 0 ? CODE_LENGTH : 1}
                  selectTextOnFocus
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    backgroundColor: colors.bgCard,
                    borderWidth: 1.5,
                    borderColor: digit ? colors.accent : colors.border,
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                />
              ))}
            </View>
            <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 16 }}>
              <Button
                label="Verify email"
                onPress={() => void onVerify()}
                loading={submitting}
                fullWidth
                size="lg"
              />
              <Pressable
                onPress={() => void onResend()}
                disabled={resendIn > 0 || submitting}
                style={{ alignItems: "center" }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {resendIn > 0 ? "Resend code in " : "Resend code"}
                  {resendIn > 0 ? (
                    <Text style={{ color: colors.accent, fontWeight: "700" }}>
                      {formatCountdown(resendIn)}
                    </Text>
                  ) : null}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === "password" ? (
          <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 16 }}>
            <Input
              label="New password"
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <Input
              label="Confirm password"
              placeholder="Repeat the new password"
              secureTextEntry
              autoCapitalize="none"
              value={confirm}
              onChangeText={setConfirm}
            />
            <Button
              label="Update password"
              onPress={() => void onSave()}
              loading={submitting}
              fullWidth
              size="lg"
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
