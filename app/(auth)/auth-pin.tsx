import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import {
  confirmSignupVerification,
  resendSignupVerification,
} from "@/api/auth";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const PIN_LENGTH = 4;

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function AuthPinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; resendAfter?: string }>();
  const email = String(params.email ?? "").trim();
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(() => {
    const parsed = Number(params.resendAfter ?? 60);
    return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
  });
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (email) return;
    toast.error("Create an account before entering a verification code.");
    router.replace("/(auth)/signup");
  }, [email, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendIn((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const applyDigits = (raw: string, startIndex: number) => {
    const chars = raw.replace(/\D/g, "").slice(0, PIN_LENGTH - startIndex).split("");
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
    const focusAt = Math.min(startIndex + chars.length, PIN_LENGTH - 1);
    inputs.current[focusAt]?.focus();
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onContinue = async () => {
    const code = digits.join("");
    if (code.length < PIN_LENGTH) {
      toast.error("Enter the 4-digit verification code.");
      return;
    }
    if (!email) return;
    setSubmitting(true);
    try {
      const result = await confirmSignupVerification(email, code);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Email verified. Sign in to continue.");
      router.replace("/(auth)/login");
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (resendIn > 0 || submitting || !email) return;
    setSubmitting(true);
    try {
      const result = await resendSignupVerification(email);
      if (result.error || !result.data) {
        toast.error(result.error || "Could not resend the code.");
        return;
      }
      setResendIn(result.data.resend_after_seconds ?? 60);
      if (result.data.delivery === "logged") {
        toast.info("The new code was written to the server log.");
      } else if (!result.data.sent && result.data.delivery !== "cooldown") {
        toast.error("Could not email the code. Try again in a moment.");
      } else if (result.data.sent) {
        toast.success("A new code is on its way.");
      }
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
            Verify
          </Text>
          <Text
            style={{
              color: colors.accent,
              fontSize: 32,
              fontWeight: "800",
              marginTop: -4,
            }}
          >
            your email
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}
          >
            Enter the 4-digit code sent to {email || "your email"}. Your account
            is created after the code matches.
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 14,
            marginTop: 48,
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
              onKeyPress={({ nativeEvent }) =>
                onKeyPress(index, nativeEvent.key)
              }
              keyboardType="number-pad"
              maxLength={index === 0 ? PIN_LENGTH : 1}
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

        <View style={{ paddingHorizontal: 24, marginTop: 40 }}>
          <Button
            label="Verify and create account"
            onPress={() => void onContinue()}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>

        <Pressable
          onPress={() => void onResend()}
          disabled={resendIn > 0 || submitting}
          style={{ marginTop: 24, alignItems: "center" }}
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
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
