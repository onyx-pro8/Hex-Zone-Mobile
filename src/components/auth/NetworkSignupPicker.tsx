import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { listJoinableNetworks, type JoinableNetwork } from "@/api/auth";
import { colors } from "@/theme/colors";

type Props = {
  accountType: string;
  value: string;
  onChange: (networkId: string) => void;
};

/** One dropdown of networks a joining user can attach to. */
export function NetworkSignupPicker({ accountType, value, onChange }: Props) {
  const [rows, setRows] = useState<JoinableNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listJoinableNetworks(accountType);
      if (cancelled) return;
      setLoading(false);
      setRows(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountType]);

  const selected = rows.find(
    (row) => row.network_id.trim().toLowerCase() === value.trim().toLowerCase(),
  );
  const label = selected
    ? selected.network_id
    : value.trim() || "Select a network";

  return (
    <View>
      <Pressable
        onPress={() => {
          if (!loading && rows.length > 0) setOpen((current) => !current);
        }}
        style={{
          minHeight: 44,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSurface,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: selected || value.trim() ? colors.text : colors.textDim,
            fontSize: 14,
          }}
          numberOfLines={1}
        >
          {loading ? "Loading networks…" : rows.length === 0 ? "No networks open" : label}
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <ChevronDown size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {open && rows.length > 0 ? (
        <ScrollView
          style={{
            maxHeight: 180,
            marginTop: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
          }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {rows.map((row) => {
            const active =
              row.network_id.trim().toLowerCase() === value.trim().toLowerCase();
            const several = (row.administrator_count ?? 1) > 1;
            return (
              <Pressable
                key={row.network_id}
                onPress={() => {
                  onChange(row.network_id);
                  setOpen(false);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: active ? colors.accentGlow : "transparent",
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
                  >
                    {row.network_id}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    {row.label || "Network"}
                    {several ? " · several administrators" : ""}
                  </Text>
                </View>
                {active ? <Check size={16} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
