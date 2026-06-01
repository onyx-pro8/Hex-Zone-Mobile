import { useMemo } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import type { LatLng } from "@/lib/h3";
import { colors } from "@/theme/colors";

const ACCENT = "#FF2DAA";
const HIGHLIGHT = "#FFD83D";

type AuthMapPanelProps = {
  center: LatLng;
  addressLabel?: string;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
  /** H3 resolution (web auth map uses 9). */
  h3Resolution?: number;
  /** H3 gridDisk radius (web auth map uses 1). */
  h3Radius?: number;
};

function buildHtml(
  center: LatLng,
  h3Resolution: number,
  h3Radius: number,
): string {
  const [lat, lng] = center;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; background: #0A0A0F; }
      .leaflet-container { background: #0A0A0F !important; }
      .leaflet-control-attribution { font-size: 9px; background: rgba(10,10,15,0.6); color: #6E6E80; }
      .leaflet-control-attribution a { color: ${ACCENT}; }
      .leaflet-control-zoom { display: none; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.js"></script>
    <script>
      (function () {
        var lat = ${lat};
        var lng = ${lng};
        var res = ${h3Resolution};
        var radius = ${h3Radius};
        var map = L.map('map', { zoomControl: false, attributionControl: true })
          .setView([lat, lng], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OSM &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);

        try {
          var origin = h3.latLngToCell(lat, lng, res);
          var ring = h3.gridDisk(origin, radius);
          var mid = Math.floor(ring.length / 2);
          ring.forEach(function (cell, i) {
            var boundary = h3.cellToBoundary(cell);
            var positions = boundary.map(function (p) { return [p[0], p[1]]; });
            var style = i === mid
              ? { color: '${HIGHLIGHT}', weight: 2, dashArray: '8 6', fillColor: '${ACCENT}', fillOpacity: 0.22 }
              : { color: '${ACCENT}', weight: 1, fillColor: '${ACCENT}', fillOpacity: 0.16 };
            L.polygon(positions, style).addTo(map);
          });
        } catch (e) {
          console.warn('H3 overlay failed', e);
        }

        L.circleMarker([lat, lng], {
          radius: 7,
          color: '${ACCENT}',
          fillColor: '${ACCENT}',
          fillOpacity: 1,
          weight: 2
        }).addTo(map);
      })();
    </script>
  </body>
</html>`;
}

export function AuthMapPanel({
  center,
  addressLabel,
  title = "Zone Weaver",
  subtitle = "Spatial Intelligence Platform",
  style,
  h3Resolution = 9,
  h3Radius = 1,
}: AuthMapPanelProps) {
  const html = useMemo(
    () => buildHtml(center, h3Resolution, h3Radius),
    [center, h3Resolution, h3Radius],
  );

  return (
    <View
      style={[
        {
          width: "100%",
          backgroundColor: colors.bg,
          overflow: "hidden",
          position: "relative",
        },
        style,
      ]}
    >
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={{ flex: 1, backgroundColor: colors.bg }}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        startInLoadingState
        renderLoading={() => (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.bg,
            }}
          />
        )}
      />

      <LinearGradient
        colors={["transparent", colors.bg]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 80,
        }}
        pointerEvents="none"
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 16,
          left: 20,
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 20,
          bottom: 18,
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(10,10,15,0.72)",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 12,
              height: 12,
              backgroundColor: ACCENT,
              borderRadius: 2,
            }}
          />
          <Text style={{ color: "#D8D8E2", fontSize: 11 }}>
            H3 Hexagonal Cells
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
          }}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              borderWidth: 2,
              borderColor: HIGHLIGHT,
              borderStyle: "dashed",
            }}
          />
          <Text style={{ color: "#D8D8E2", fontSize: 11 }}>
            Geo-fence Polygons
          </Text>
        </View>
        {addressLabel ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              marginTop: 8,
              maxWidth: 220,
            }}
            numberOfLines={2}
          >
            {addressLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
