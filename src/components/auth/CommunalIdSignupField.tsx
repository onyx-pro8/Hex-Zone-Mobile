import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, Search } from "lucide-react-native";
import {
  listCommunalIdsPublic,
  validateCommunalIdPublic,
  type CommunalIdRow,
} from "@/api/zones";
import { colors } from "@/theme/colors";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Called when validation succeeds (ID has zones). */
  onValidated?: (ok: boolean, zoneCount: number) => void;
};

/**
 * Communal ID picker for Individual signup (self-register or system-admin QR).
 * Lists public IDs that already have zones; also allows typing + Validate.
 */
export function CommunalIdSignupField({ value, onChange, onValidated }: Props) {
  const [rows, setRows] = useState<CommunalIdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listCommunalIdsPublic();
      if (cancelled) return;
      setLoading(false);
      if (result.error || !result.data) {
        setRows([]);
        return;
      }
      setRows(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = rows.filter((row) => {
    const q = query.trim().toUpperCase();
    if (!q) return true;
    return (
      row.reference_id.includes(q) ||
      String(row.network_id ?? "")
        .toUpperCase()
        .includes(q) ||
      String(row.creator_name ?? "")
        .toUpperCase()
        .includes(q)
    );
  });

  const runValidate = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (normalized.length < 3) {
        setOk(false);
        setStatus("Enter a Communal ID (at least 3 characters).");
        onValidated?.(false, 0);
        return;
      }
      setValidating(true);
      setStatus("Validating…");
      const result = await validateCommunalIdPublic(normalized);
      setValidating(false);
      if (result.error || !result.data) {
        setOk(false);
        setStatus(result.error ?? "Could not validate Communal ID.");
        onValidated?.(false, 0);
        return;
      }
      const zones = Array.isArray(result.data.zones) ? result.data.zones : [];
      const exists =
        result.data.valid === true &&
        (result.data.exists === true || zones.length > 0) &&
        zones.length > 0;
      onChange(result.data.reference_id || normalized);
      setOk(exists);
      setStatus(
        exists
          ? result.data.message ??
              `Ready — ${zones.length} zone(s) will become your primary.`
          : result.data.message ??
              "Communal ID not found or has no zones yet.",
      );
      onValidated?.(exists, zones.length);
    },
    [onChange, onValidated],
  );

  const selectRow = (row: CommunalIdRow) => {
    onChange(row.reference_id);
    setOk(Number(row.zone_count) > 0);
    setStatus(
      Number(row.zone_count) > 0
        ? `${row.zone_count} zone(s) → calculated as 1 primary`
        : "This ID has no zones yet",
    );
    onValidated?.(Number(row.zone_count) > 0, Number(row.zone_count) || 0);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Communal ID (required)
      </Text>
      <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 17 }}>
        Select a public Communal ID. Its zones are calculated into your single
        primary zone. You can then create up to 2 secondary zones.
      </Text>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChange(v.toUpperCase());
            setOk(false);
            setStatus(null);
            onValidated?.(false, 0);
          }}
          placeholder="Type or pick a Communal ID"
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: ok ? colors.success : colors.border,
            backgroundColor: colors.bg,
            paddingHorizontal: 12,
            color: colors.text,
            fontSize: 14,
            fontWeight: "600",
          }}
        />
        <Pressable
          onPress={() => void runValidate(value)}
          disabled={validating || !value.trim()}
          style={{
            paddingHorizontal: 14,
            minHeight: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            opacity: validating || !value.trim() ? 0.5 : 1,
          }}
        >
          {validating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
              Validate
            </Text>
          )}
        </Pressable>
      </View>

      {status ? (
        <Text
          style={{
            color: ok ? colors.success : colors.textMuted,
            fontSize: 12,
            fontWeight: ok ? "600" : "400",
          }}
        >
          {status}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSurface,
        }}
      >
        <Search size={14} color={colors.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter list…"
          placeholderTextColor={colors.textDim}
          style={{
            flex: 1,
            minHeight: 40,
            color: colors.text,
            fontSize: 13,
          }}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : filtered.length === 0 ? (
        <Text style={{ color: colors.textDim, fontSize: 12 }}>
          No public Communal IDs with zones yet. Ask a network admin to create
          one, or type an ID and Validate.
        </Text>
      ) : (
        <ScrollView
          style={{ maxHeight: 180 }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {filtered.map((row) => {
            const selected = value.trim().toUpperCase() === row.reference_id;
            return (
              <Pressable
                key={row.reference_id}
                onPress={() => selectRow(row)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: selected ? colors.accentGlow : "transparent",
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {row.reference_id}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    {row.zone_count} zone
                    {row.zone_count === 1 ? "" : "s"}
                    {row.creator_name ? ` · ${row.creator_name}` : ""}
                  </Text>
                </View>
                {selected ? <Check size={16} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
