import { useCallback, useEffect, useMemo, useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { LatLng } from "@/lib/h3";
import type { MapZoneLayer, ZoneCircle } from "@/lib/zoneGeometry";
import {
  buildDashboardMapHtml,
  type DashboardMapState,
} from "@/components/dashboard/dashboardMapHtml";
import { colors } from "@/theme/colors";

export type DashboardDrawMode =
  | "polygon"
  | "circle"
  | "h3"
  | "marker"
  | "none";

type Message =
  | { type: "ready" }
  | { type: "mapClick"; lat: number; lng: number }
  | { type: "h3Toggle"; cell: string }
  | { type: "h3LoadError" }
  | {
      type: "location";
      lat: number;
      lng: number;
      accuracy?: number;
    }
  | { type: "locationError"; message: string }
  | { type: "debug"; label: string; payload: unknown };

type DashboardMapProps = {
  center: LatLng;
  zoom?: number;
  drawMode: DashboardDrawMode;
  draftRing: LatLng[];
  previewRings?: LatLng[][];
  draftCircle: ZoneCircle | null;
  draftMarker: LatLng | null;
  selectedH3Cells: string[];
  h3Resolution: number;
  savedLayers: MapZoneLayer[];
  draftColor: string;
  draftCircleSolid?: boolean;
  fitDraftToken?: number;
  /** Increment to request device GPS via the map WebView (no expo-location native module). */
  locationRequestNonce?: number;
  onMapClick?: (lat: number, lng: number) => void;
  onH3Toggle?: (cell: string) => void;
  onH3LoadError?: () => void;
  onDeviceLocation?: (lat: number, lng: number, accuracy?: number) => void;
  onDeviceLocationError?: (message: string) => void;
  onReady?: () => void;
  style?: ViewStyle;
};

export function DashboardMap({
  center,
  zoom,
  drawMode,
  draftRing,
  previewRings = [],
  draftCircle,
  draftMarker,
  selectedH3Cells,
  h3Resolution,
  savedLayers,
  draftColor,
  draftCircleSolid = false,
  fitDraftToken = 0,
  locationRequestNonce = 0,
  onMapClick,
  onH3Toggle,
  onH3LoadError,
  onDeviceLocation,
  onDeviceLocationError,
  onReady,
  style,
}: DashboardMapProps) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingLocationNonceRef = useRef(0);
  const html = useMemo(() => buildDashboardMapHtml(), []);

  const injectDeviceLocationRequest = useCallback(() => {
    webRef.current?.injectJavaScript(
      "window.__requestDeviceLocation && window.__requestDeviceLocation(); true;",
    );
  }, []);

  const mapState = useMemo<DashboardMapState>(
    () => ({
      center,
      zoom: zoom ?? 14,
      drawMode,
      draftRing,
      previewRings,
      draftCircle,
      draftMarker,
      selectedH3Cells,
      h3Resolution,
      savedLayers,
      draftColor,
      draftCircleSolid,
      fitDraftToken,
    }),
    [
      center,
      zoom,
      drawMode,
      draftRing,
      previewRings,
      draftCircle,
      draftMarker,
      selectedH3Cells,
      h3Resolution,
      savedLayers,
      draftColor,
      draftCircleSolid,
      fitDraftToken,
    ],
  );

  const pushState = useCallback((state: DashboardMapState) => {
    if (!readyRef.current) return;
    const json = JSON.stringify(state).replace(/<\//g, "<\\/");
    webRef.current?.injectJavaScript(
      `window.__applyMapState(${json}); true;`,
    );
  }, []);

  useEffect(() => {
    pushState(mapState);
  }, [mapState, pushState]);

  useEffect(() => {
    if (!locationRequestNonce) return;
    pendingLocationNonceRef.current = locationRequestNonce;
    if (readyRef.current) injectDeviceLocationRequest();
  }, [injectDeviceLocationRequest, locationRequestNonce]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as Message;
        if (data.type === "ready") {
          readyRef.current = true;
          pushState(mapState);
          if (pendingLocationNonceRef.current > 0) {
            injectDeviceLocationRequest();
          }
          onReady?.();
          return;
        }
        if (data.type === "mapClick") {
          onMapClick?.(data.lat, data.lng);
          return;
        }
        if (data.type === "h3Toggle") {
          onH3Toggle?.(data.cell);
          return;
        }
        if (data.type === "h3LoadError") {
          onH3LoadError?.();
          return;
        }
        if (data.type === "location") {
          onDeviceLocation?.(data.lat, data.lng, data.accuracy);
          return;
        }
        if (data.type === "locationError") {
          onDeviceLocationError?.(data.message);
          return;
        }
        if (data.type === "debug") {
          if (__DEV__) {
            console.log("[DashboardMap]", data.label, data.payload);
          }
        }
      } catch {
        /* ignore */
      }
    },
    [
      mapState,
      onDeviceLocation,
      onDeviceLocationError,
      onH3LoadError,
      onH3Toggle,
      onMapClick,
      injectDeviceLocationRequest,
      onReady,
      pushState,
    ],
  );

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://hex-zone.local/" }}
        style={{ flex: 1, backgroundColor: colors.bg }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mixedContentMode="always"
        scrollEnabled={false}
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
    </View>
  );
}
