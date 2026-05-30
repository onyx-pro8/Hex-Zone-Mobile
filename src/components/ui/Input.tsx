import { forwardRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { colors } from "@/theme/colors";

type InputProps = TextInputProps & {
  label?: string;
  helper?: string;
  error?: string | null;
  leftIcon?: ReactNode;
  rightAdornment?: ReactNode;
  containerStyle?: ViewStyle;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    helper,
    error,
    leftIcon,
    rightAdornment,
    secureTextEntry,
    containerStyle,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.accent
      : colors.border;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.bgCard,
          borderColor,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          height: 52,
        }}
      >
        {leftIcon ? <View style={{ marginRight: 10 }}>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textDim}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 15,
            fontWeight: "500",
            paddingVertical: 0,
          }}
          secureTextEntry={hidden}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((s) => !s)}
            hitSlop={10}
            style={{ padding: 6 }}
          >
            {hidden ? (
              <Eye size={18} color={colors.textMuted} />
            ) : (
              <EyeOff size={18} color={colors.textMuted} />
            )}
          </Pressable>
        ) : null}
        {rightAdornment}
      </View>
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 6 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});
