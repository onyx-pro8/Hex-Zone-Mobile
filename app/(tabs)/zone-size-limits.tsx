import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormSelect } from "@/components/ui/FormSelect";
import { getZoneAreaBudget, updateZoneAreaLimits } from "@/api/zones";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

export default function ZoneSizeLimitsScreen() {
  const router = useRouter();
  const [unit, setUnit] = useState<"km2" | "m2">("km2");
  const [eachInput, setEachInput] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getZoneAreaBudget().then((result) => {
      if (!mounted || !result.data) return;
      const toField = (m2: number | null) => {
        if (m2 == null) return "";
        const shown = unit === "km2" ? m2 / 1_000_000 : m2;
        return String(shown);
      };
      setEachInput(toField(result.data.each_zone_m2));
      setTotalInput(toField(result.data.total_m2));
    });
    return () => {
      mounted = false;
    };
  }, [unit]);

  async function onSave() {
    const toM2 = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value <= 0) return Number.NaN;
      return unit === "km2" ? value * 1_000_000 : value;
    };
    const each = toM2(eachInput);
    const total = toM2(totalInput);
    if (Number.isNaN(each) || Number.isNaN(total)) {
      toast.error("Limits must be numbers greater than zero, or empty.");
      return;
    }
    setSaving(true);
    const result = await updateZoneAreaLimits({
      each_zone_m2: each,
      total_m2: total,
    });
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
            subtitle="Applies to every zone type"
            showBack
            onBack={() => router.replace("/(tabs)/settings")}
          />
          <View style={{ paddingHorizontal: 20 }}>
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                Set the biggest one zone may be, and the biggest combined area
                of all zones on an account. Polygons, circles, and hex cells
                count. Leave a field empty for no limit.
              </Text>
              <FormSelect
                label="Unit"
                value={unit}
                options={[
                  { value: "km2", label: "Square kilometers" },
                  { value: "m2", label: "Square meters" },
                ]}
                onChange={setUnit}
              />
              <Field label="Each zone" value={eachInput} onChange={setEachInput} />
              <Field label="Total size" value={totalInput} onChange={setTotalInput} />
              <Button
                label={saving ? "Saving…" : "Save zone size limits"}
                size="sm"
                fullWidth
                disabled={saving}
                onPress={() => void onSave()}
              />
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="No limit"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        style={{
          borderWidth: 1,
          borderColor: colors.border ?? "#DCE6F2",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          backgroundColor: "#F7FAFE",
        }}
      />
    </View>
  );
}
