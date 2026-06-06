import { forwardRef, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "@/theme/colors";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
};

const sizeStyles: Record<Size, { height: number; px: number; text: number }> = {
  sm: { height: 44, px: 16, text: 13 },
  md: { height: 54, px: 20, text: 14 },
  lg: { height: 64, px: 24, text: 16 },
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    label,
    variant = "primary",
    size = "md",
    loading,
    disabled,
    fullWidth,
    leftIcon,
    rightIcon,
    style,
    onPressIn,
    onPressOut,
    ...rest
  },
  ref,
) {
  const sz = sizeStyles[size];
  const isDisabled = disabled || loading;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn: PressableProps["onPressIn"] = (e) => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut: PressableProps["onPressOut"] = (e) => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
    onPressOut?.(e);
  };

  if (variant === "primary") {
    return (
      <Animated.View
        style={{
          height: sz.height,
          borderRadius: sz.height / 2,
          alignSelf: fullWidth ? "stretch" : "auto",
          opacity: isDisabled ? 0.6 : 1,
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.45,
          shadowRadius: 18,
          elevation: 10,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <Pressable
          ref={ref}
          disabled={isDisabled}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            {
              flex: 1,
              borderRadius: sz.height / 2,
              overflow: "hidden",
            },
            style,
          ]}
          {...rest}
        >
          <LinearGradient
            colors={gradients.accent as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              paddingHorizontal: sz.px,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                {leftIcon ? (
                  <View style={{ marginRight: 8 }}>{leftIcon}</View>
                ) : null}
                <Text
                  style={{
                    color: "#fff",
                    fontSize: sz.text,
                    fontWeight: "700",
                    letterSpacing: 0.4,
                  }}
                >
                  {label}
                </Text>
                {rightIcon ? (
                  <View style={{ marginLeft: 8 }}>{rightIcon}</View>
                ) : null}
              </>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  const palette: Record<
    Exclude<Variant, "primary">,
    { bg: string; fg: string; border?: string }
  > = {
    secondary: { bg: colors.bgSurface, fg: colors.text },
    ghost: { bg: "transparent", fg: colors.text },
    outline: {
      bg: "transparent",
      fg: colors.text,
      border: colors.borderStrong,
    },
    danger: { bg: "#FCE7EA", fg: colors.danger, border: "#F3C2CA" },
  };
  const p = palette[variant];

  return (
    <Animated.View
      style={{
        height: sz.height,
        borderRadius: sz.height / 2,
        alignSelf: fullWidth ? "stretch" : "auto",
        opacity: isDisabled ? 0.6 : 1,
        transform: [{ scale: scaleAnim }],
      }}
    >
      <Pressable
        ref={ref}
        disabled={isDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          {
            flex: 1,
            paddingHorizontal: sz.px,
            borderRadius: sz.height / 2,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: p.bg,
            borderWidth: p.border ? 1 : 0,
            borderColor: p.border,
          },
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <>
            {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
            <Text
              style={{
                color: p.fg,
                fontSize: sz.text,
                fontWeight: "600",
                letterSpacing: 0.3,
              }}
            >
              {label}
            </Text>
            {rightIcon ? (
              <View style={{ marginLeft: 8 }}>{rightIcon}</View>
            ) : null}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});
