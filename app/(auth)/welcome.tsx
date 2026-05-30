import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { Logo } from "@/components/ui/Logo";
import { colors } from "@/theme/colors";

export default function Welcome() {
  const router = useRouter();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.0],
  });

  return (
    <GradientBackground>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <View style={{ alignItems: "center", gap: 32, flex: 1, justifyContent: "center" }}>
          <Logo size={56} />
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 14,
              textAlign: "center",
              maxWidth: 280,
              lineHeight: 22,
            }}
          >
            Secure perimeter access for members, zones, devices and guests.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/(auth)/login")}
          style={({ pressed }) => ({
            marginBottom: 56,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <View
            style={{
              width: 86,
              height: 86,
              borderRadius: 43,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                width: 86,
                height: 86,
                borderRadius: 43,
                backgroundColor: colors.accent,
                opacity,
                transform: [{ scale }],
              }}
            />
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                overflow: "hidden",
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
                elevation: 12,
              }}
            >
              <LinearGradient
                colors={[colors.accent, colors.accentDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronRight size={32} color="#fff" />
              </LinearGradient>
            </View>
          </View>
        </Pressable>

        <View
          style={{
            position: "absolute",
            bottom: 30,
            width: 64,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#FFFFFF20",
          }}
        />
      </View>
    </GradientBackground>
  );
}
