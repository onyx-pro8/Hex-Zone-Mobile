import { ScrollView, Text, Pressable, View } from "react-native";
import {
  Building2,
  Crosshair,
  Hexagon,
  Landmark,
  LayoutDashboard,
  Radar,
  Users,
} from "lucide-react-native";
import type { ZoneType } from "@/api/zones";
import { colorForZoneType } from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

const OPTIONS: {
  type: ZoneType;
  label: string;
  icon: (props: { size: number; color: string }) => React.ReactNode;
}[] = [
  { type: "geofence", label: "Geofence", icon: (p) => <LayoutDashboard {...p} /> },
  { type: "grid", label: "Grid", icon: (p) => <Hexagon {...p} /> },
  { type: "proximity", label: "Proximity", icon: (p) => <Crosshair {...p} /> },
  { type: "dynamic", label: "Dynamic", icon: (p) => <Radar {...p} /> },
  { type: "communal_id", label: "Communal", icon: (p) => <Users {...p} /> },
  {
    type: "government_local_code",
    label: "Government",
    icon: (p) => <Landmark {...p} />,
  },
  { type: "object", label: "Object", icon: (p) => <Building2 {...p} /> },
];

type Props = {
  value: ZoneType;
  onChange: (next: ZoneType) => void;
};

export function ZoneTypePicker({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.type === value;
        const color = colorForZoneType(opt.type);
        return (
          <Pressable
            key={opt.type}
            onPress={() => onChange(opt.type)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: active ? `${color}22` : colors.bgCard,
              borderWidth: 1,
              borderColor: active ? color : colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            {opt.icon({ size: 14, color: active ? color : colors.textMuted })}
            <Text
              style={{
                color: active ? color : colors.textMuted,
                fontSize: 13,
                fontWeight: "700",
                letterSpacing: 0.2,
              }}
            >
              {opt.label}
            </Text>
            {active ? (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: color,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
