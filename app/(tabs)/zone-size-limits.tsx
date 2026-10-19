import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormSelect } from "@/components/ui/FormSelect";
import { getZoneAreaLimits, updateZoneAreaLimits, type ZoneSizeRule } from "@/api/zones";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

const ACCOUNTS = [
  { value: "private_plus", label: "Family" },
  { value: "exclusive", label: "Individual" },
  { value: "enhanced", label: "Individual Pro" },
  { value: "enhanced_plus", label: "Organization" },
];

type AreaUnit = "m2" | "km2";
type AreaDraft = {
  account_type: string;
  role: "administrator" | "user";
  eachInput: string;
  eachUnit: AreaUnit;
  totalInput: string;
  totalUnit: AreaUnit;
};

const UNIT_OPTIONS = [
  { value: "km2" as const, label: "km²" },
  { value: "m2" as const, label: "m²" },
];

function blankRules(): AreaDraft[] {
  return ACCOUNTS.flatMap((account) =>
    (["administrator", "user"] as const).map((role) => ({
      account_type: account.value,
      role,
      eachInput: "",
      eachUnit: "km2" as const,
      totalInput: "",
      totalUnit: "km2" as const,
    })),
  );
}

function shown(m2: number | null, unit: string): string {
  if (m2 == null) return "";
  return String(unit === "km2" ? m2 / 1_000_000 : m2);
}

function fromRule(rule: ZoneSizeRule): AreaDraft {
  const eachUnit: AreaUnit = rule.each_unit === "m2" ? "m2" : "km2";
  const totalUnit: AreaUnit = rule.total_unit === "m2" ? "m2" : "km2";
  return {
    account_type: rule.account_type,
    role: rule.role === "administrator" ? "administrator" : "user",
    eachInput: shown(rule.each_zone_m2, eachUnit),
    eachUnit,
    totalInput: shown(rule.total_m2, totalUnit),
    totalUnit,
  };
}

function convertInput(raw: string, from: AreaUnit, to: AreaUnit): string {
  if (from === to || !raw.trim()) return raw;
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return String(from === "km2" ? value * 1_000_000 : value / 1_000_000);
}

function toRule(draft: AreaDraft): ZoneSizeRule | null {
  const toM2 = (raw: string, unit: AreaUnit) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) return Number.NaN;
    return unit === "km2" ? value * 1_000_000 : value;
  };
  const each = toM2(draft.eachInput, draft.eachUnit);
  const total = toM2(draft.totalInput, draft.totalUnit);
  if (Number.isNaN(each) || Number.isNaN(total)) return null;
  return {
    account_type: draft.account_type,
    role: draft.role,
    each_zone_m2: each,
    each_unit: draft.eachUnit,
    total_m2: total,
    total_unit: draft.totalUnit,
  };
}

export default function ZoneSizeLimitsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState("private_plus");
  const [rules, setRules] = useState<AreaDraft[]>(blankRules);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getZoneAreaLimits().then((result) => {
      if (!mounted || !result.data?.rules?.length) return;
      setRules(result.data.rules.map(fromRule));
    });
    return () => {
      mounted = false;
    };
  }, []);

  function patch(role: "administrator" | "user", next: Partial<AreaDraft>) {
    setRules((current) =>
      current.map((rule) =>
        rule.account_type === account && rule.role === role ? { ...rule, ...next } : rule,
      ),
    );
  }

  async function onSave() {
    const payload = rules.map(toRule);
    if (payload.some((rule) => rule == null)) {
      toast.error("Limits must be numbers greater than zero, or empty.");
      return;
    }
    setSaving(true);
    const result = await updateZoneAreaLimits(payload as ZoneSizeRule[]);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Zone size limits saved.");
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="Zone size limit"
            subtitle="Network admin and member, per account type"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                Set the biggest one zone may be, and the biggest combined area
                that person may cover. Each limit has its own unit. Polygons,
                circles, and hex cells count. Leave a field empty for no limit.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ACCOUNTS.map((item) => {
                  const active = item.value === account;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setAccount(item.value)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: active ? "#2F80ED" : "#E8F1FC",
                      }}
                    >
                      <Text style={{ color: active ? "#fff" : "#0F2C5C", fontWeight: "700", fontSize: 13 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
            {(["administrator", "user"] as const).map((role) => {
              const draft = rules.find((rule) => rule.account_type === account && rule.role === role);
              if (!draft) return null;
              return (
                <Card key={role} style={{ gap: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
                    {role === "administrator" ? "Network admin" : "Member"}
                  </Text>
                  <LimitField
                    label="Each zone"
                    value={draft.eachInput}
                    unit={draft.eachUnit}
                    onValue={(value) => patch(role, { eachInput: value })}
                    onUnit={(unit) =>
                      patch(role, {
                        eachUnit: unit,
                        eachInput: convertInput(draft.eachInput, draft.eachUnit, unit),
                      })
                    }
                  />
                  <LimitField
                    label="Total size"
                    value={draft.totalInput}
                    unit={draft.totalUnit}
                    onValue={(value) => patch(role, { totalInput: value })}
                    onUnit={(unit) =>
                      patch(role, {
                        totalUnit: unit,
                        totalInput: convertInput(draft.totalInput, draft.totalUnit, unit),
                      })
                    }
                  />
                </Card>
              );
            })}
            <Button
              label={saving ? "Saving…" : "Save zone size limits"}
              size="sm"
              fullWidth
              disabled={saving}
              onPress={() => void onSave()}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function LimitField({
  label,
  value,
  unit,
  onValue,
  onUnit,
}: {
  label: string;
  value: string;
  unit: AreaUnit;
  onValue: (value: string) => void;
  onUnit: (unit: AreaUnit) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onValue}
          placeholder="No limit"
          placeholderTextColor={colors.textDim}
          keyboardType="decimal-pad"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border ?? "#DCE6F2",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            backgroundColor: "#F7FAFE",
          }}
        />
        <FormSelect
          compact
          label={`${label} unit`}
          value={unit}
          options={UNIT_OPTIONS}
          onChange={onUnit}
          style={{ width: 92 }}
        />
      </View>
    </View>
  );
}
