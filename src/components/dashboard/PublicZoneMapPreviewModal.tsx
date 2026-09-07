import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map as MapIcon, X } from "lucide-react-native";
import type { SavedZone } from "@/api/zones";
import { DashboardMap } from "@/components/dashboard/DashboardMap";
import { AUTH_MAP_DEFAULT_CENTER } from "@/lib/h3";
import {
  colorForZoneType,
  zoneRecordToLayer,
  type MapZoneLayer,
} from "@/lib/zoneGeometry";
import { colors } from "@/theme/colors";

type Props = {
  visible: boolean;
  zones: SavedZone[];
  focusZoneId: number | null;
  onClose: () => void;
};

export function PublicZoneMapPreviewModal({
  visible,
  zones,
  focusZoneId,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [focusToken, setFocusToken] = useState(0);

  const layers = useMemo<MapZoneLayer[]>(() => {
    return zones
      .map((zone, index) => zoneRecordToLayer(zone, index))
      .filter((layer): layer is MapZoneLayer => layer != null);
  }, [zones]);

  const focusId =
    focusZoneId != null ? String(focusZoneId) : layers[0]?.id ?? null;

  const focusLayer = useMemo(
    () => layers.find((layer) => layer.id === focusId) ?? null,
    [focusId, layers],
  );

  const center = useMemo(() => {
    if (focusLayer?.marker) return focusLayer.marker;
    if (focusLayer?.rings[0]?.[0]) return focusLayer.rings[0][0];
    if (focusLayer?.circles[0]?.center) return focusLayer.circles[0].center;
    return AUTH_MAP_DEFAULT_CENTER;
  }, [focusLayer]);

  useEffect(() => {
    if (!visible || focusId == null) return;
    const timer = setTimeout(() => {
      setFocusToken((token) => token + 1);
    }, 350);
    return () => clearTimeout(timer);
  }, [visible, focusId]);

  const cardWidth = Math.min(width - 32, 560);
  const cardHeight = Math.min(
    height - insets.top - insets.bottom - 48,
    Math.max(420, height * 0.78),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <Pressable
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "rgba(15, 44, 92, 0.45)",
          }}
          onPress={onClose}
        />

        <View
          style={{
            width: cardWidth,
            height: cardHeight,
            borderRadius: 18,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(47,128,237,0.12)",
              }}
            >
              <MapIcon size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: "800",
                }}
                numberOfLines={1}
              >
                {focusLayer?.name ?? "Zone map"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {layers.length} public zone{layers.length === 1 ? "" : "s"} ·
                focused
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.bgCard,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            {visible ? (
              <DashboardMap
                center={center}
                zoom={14}
                drawMode="none"
                draftRing={[]}
                draftCircle={null}
                draftMarker={null}
                selectedH3Cells={[]}
                h3Resolution={9}
                savedLayers={layers}
                draftColor={
                  focusLayer
                    ? colorForZoneType(focusLayer.zoneType)
                    : colors.accent
                }
                focusLayerId={focusId}
                focusLayerToken={focusToken}
                zoomControlTop={16}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
