import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { colors, radius } from "@/theme/colors";

export type FormSelectOption<T extends string | number = string> = {
  value: T;
  label: string;
  description?: string;
};

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: FormSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Hide the uppercase label and tighten padding for toolbar rows. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-width form select: labeled field that opens a compact picker sheet.
 */
export function FormSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );

  return (
    <>
      <View style={[{ gap: compact ? 0 : 8, minWidth: 0 }, style]}>
        {compact ? null : <Text style={styles.fieldLabel}>{label}</Text>}
        <Pressable
          disabled={disabled}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected?.label ?? ""}`}
          style={[
            styles.field,
            compact ? styles.fieldCompact : null,
            disabled ? styles.fieldDisabled : null,
          ]}
        >
          <Text
            style={[styles.fieldValue, compact ? styles.fieldValueCompact : null]}
            numberOfLines={1}
          >
            {selected?.label ?? "Select"}
          </Text>
          <ChevronDown
            size={compact ? 16 : 18}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.sheet}
          >
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={[styles.option, active ? styles.optionActive : null]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={[
                          styles.optionLabel,
                          active ? styles.optionLabelActive : null,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {opt.description ? (
                        <Text style={styles.optionDesc}>{opt.description}</Text>
                      ) : null}
                    </View>
                    {active ? <Check size={18} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  fieldCompact: {
    minHeight: 44,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 12,
  },
  fieldDisabled: {
    opacity: 0.55,
  },
  fieldValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  fieldValueCompact: {
    fontSize: 13,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 44, 92, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 8,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  optionActive: {
    backgroundColor: colors.accentGlow,
  },
  optionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  optionLabelActive: {
    color: colors.accentDeep,
  },
  optionDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
