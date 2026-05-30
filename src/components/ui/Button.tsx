import { forwardRef } from "react";
import {
  ActivityIndicator,
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
  sm: { height: 40, px: 14, text: 13 },
  md: { height: 48, px: 18, text: 14 },
  lg: { height: 56, px: 22, text: 16 },
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
    ...rest
  },
  ref,
) {
  const sz = sizeStyles[size];
  const isDisabled = disabled || loading;

  if (variant === "primary") {
    return (
      <Pressable
        ref={ref}
        disabled={isDisabled}
        style={({ pressed }) => [
          {
            height: sz.height,
            borderRadius: sz.height / 2,
            overflow: "hidden",
            opacity: isDisabled ? 0.6 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.45,
            shadowRadius: 18,
            elevation: 10,
            alignSelf: fullWidth ? "stretch" : "auto",
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
    danger: { bg: "#3A0E1C", fg: colors.danger, border: "#5C1B2C" },
  };
  const p = palette[variant];

  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: sz.height,
          paddingHorizontal: sz.px,
          borderRadius: sz.height / 2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          opacity: isDisabled ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          alignSelf: fullWidth ? "stretch" : "auto",
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
  );
});
