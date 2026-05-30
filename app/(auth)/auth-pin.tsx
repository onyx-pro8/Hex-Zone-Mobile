import { useRef, useState } from "react";
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
import { Button } from "@/components/ui/Button";
import { colors } from "@/theme/colors";

const PIN_LENGTH = 4;

export default function AuthPinScreen() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);

  const onChangeDigit = (index: number, value: string) => {
    const char = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError(null);
    if (char && index < PIN_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onContinue = () => {
    const code = digits.join("");
    if (code.length < PIN_LENGTH) {
      setError("Enter the 4-digit verification code.");
      return;
    }
    router.replace("/(auth)/login");
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
            Login
          </Text>
          <Text
            style={{
              color: colors.accent,
              fontSize: 32,
              fontWeight: "800",
              marginTop: -4,
            }}
          >
            Authentication
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}
          >
            Enter the verification code sent to your email.
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
              onChangeText={(v) => onChangeDigit(index, v)}
              onKeyPress={({ nativeEvent }) =>
                onKeyPress(index, nativeEvent.key)
              }
              keyboardType="number-pad"
              maxLength={1}
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

        {error ? (
          <Text
            style={{
              color: colors.danger,
              textAlign: "center",
              marginTop: 16,
              fontSize: 13,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: 24, marginTop: 40 }}>
          <Button label="Continue" onPress={onContinue} fullWidth size="lg" />
        </View>

        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 24, alignItems: "center" }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Resend code in{" "}
            <Text style={{ color: colors.accent, fontWeight: "700" }}>
              00:59
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}
