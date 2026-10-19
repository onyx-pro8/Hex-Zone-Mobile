import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
  /** Filter a long option list by keyword inside the picker. */
  searchable?: boolean;
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
  searchable = false,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { height: windowHeight } = useWindowDimensions();
  const listHeight = Math.min(420, Math.round(windowHeight * 0.5));
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!searchable || !needle) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query, searchable]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <View style={[{ gap: compact ? 0 : 8, minWidth: 0 }, style]}>
        {compact ? null : <Text style={styles.fieldLabel}>{label}</Text>}
        <Pressable
          disabled={disabled}
          onPress={() => {
            setQuery("");
            setOpen(true);
          }}
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
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={close} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${label.toLowerCase()}`}
                placeholderTextColor={colors.textDim}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.search}
              />
            ) : null}
            <FlatList
              data={visible}
              keyExtractor={(opt) => String(opt.value)}
              style={{ height: listHeight }}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={30}
              windowSize={10}
              ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
              renderItem={({ item: opt }) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(opt.value);
                      close();
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
              }}
            />
          </View>
        </View>
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
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.bgCard,
    fontSize: 15,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
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
