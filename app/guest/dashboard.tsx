/**
 * Guest dashboard (post-approval). Map-first, read-only.
 *
 * Mirrors the web `pages/guest/GuestDashboard.tsx`: an approved guest sees
 * their authorized zone(s), a read-only zone map when the dashboard payload
 * carries geometry, and a link into Guest chat. The guest is NOT a member —
 * this screen runs on the stored guest token only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, MapPin, MessageCircle } from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DashboardMap } from "@/components/dashboard/DashboardMap";
import {
  fetchGuestMe,
  fetchGuestZoneDashboard,
} from "@/api/guestSession";
import {
  tryParseGuestDashboardMap,
  type GuestDashboardMapView,
} from "@/lib/guestDashboardMap";
import { getZones, type SavedZone } from "@/api/zones";
import {
  circleToGeoJsonPolygon,
  zoneRecordToLayer,
} from "@/lib/zoneGeometry";
import { AUTH_MAP_DEFAULT_CENTER, type LatLng } from "@/lib/h3";
import { useAuth } from "@/context/AuthContext";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
} from "@/lib/storage";
import { colors } from "@/theme/colors";

/**
 * Convert a member-style zone record (GET /zones shape) into the read-only
 * guest map view, reusing the exact parser the in-app builder map uses so
 * circle / polygon / h3 zones render identically.
 */
function savedZoneToMapView(zone: SavedZone): GuestDashboardMapView | null {
  const layer = zoneRecordToLayer(zone, 0);
  if (!layer) return null;

  const polygons: LatLng[][] = [...layer.rings];
  for (const circle of layer.circles) {
    const gj = circleToGeoJsonPolygon(circle);
    polygons.push(gj.coordinates[0].map(([lng, lat]) => [lat, lng] as LatLng));
  }
  const center: LatLng | null = layer.marker ?? (polygons[0]?.[0] ?? null);

  if (polygons.length === 0 && layer.h3Cells.length === 0 && !center) {
    return null;
  }
  return { center, polygons, h3Cells: layer.h3Cells };
}

/**
 * The server now embeds a read-only `zone` (same shape as GET /zones) in the
 * guest dashboard payload, so a PURE guest can render the owner's real map
 * without member auth. Pull it out and convert it.
 */
function mapViewFromDashboardZone(
  dashboard: unknown,
): GuestDashboardMapView | null {
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    return null;
  }
  const zoneRaw = (dashboard as Record<string, unknown>).zone;
  if (!zoneRaw || typeof zoneRaw !== "object" || Array.isArray(zoneRaw)) {
    return null;
  }
  return savedZoneToMapView(zoneRaw as SavedZone);
}

/**
 * Real zone geometry from the member API (GET /zones?zone_id=). Only usable
 * when a member token is present — a pure guest token is rejected by /zones
 * (its `sub` is "guest:<id>" which the member auth dependency cannot parse).
 */
async function fetchMemberZoneMapView(
  zoneId: string,
): Promise<GuestDashboardMapView | null> {
  const res = await getZones(zoneId);
  if (res.error || !res.data?.length) return null;
  const match =
    res.data.find((z) => String(z.zone_id ?? z.id ?? "").trim() === zoneId) ??
    res.data[0];
  return savedZoneToMapView(match);
}

export default function GuestDashboardScreen() {
  const router = useRouter();
  const { token: memberToken } = useAuth();

  const [checking, setChecking] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [primaryZone, setPrimaryZone] = useState("");
  const [mapModel, setMapModel] = useState<GuestDashboardMapView | null>(null);
  const [rawDashboard, setRawDashboard] = useState<unknown>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawDashboard, setShowRawDashboard] = useState(false);
  const [fitToken, setFitToken] = useState(0);

  const leaveGuest = useCallback(async () => {
    await clearStoredGuestSession();
    router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
  }, [memberToken, router]);

  // Guard: a guest session must exist to be here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const session = await getStoredGuestSession();
        if (!active) return;
        if (!session?.access_token) {
          router.replace(memberToken ? "/(tabs)" : "/(auth)/welcome");
          return;
        }
        setDisplayName(session.display_name ?? "");
        setZones(session.zone_ids?.length ? session.zone_ids : [session.zone_id]);
        setPrimaryZone(session.zone_id || session.zone_ids?.[0] || "");
        setChecking(false);
      })();
      return () => {
        active = false;
      };
    }, [memberToken, router]),
  );

  // Refresh profile from the server (zones / display name can change).
  useEffect(() => {
    if (checking) return;
    let active = true;
    void (async () => {
      const me = await fetchGuestMe();
      if (!active) return;
      if (me.unauthorized) {
        await leaveGuest();
        return;
      }
      if (me.data) {
        if (me.data.display_name) setDisplayName(me.data.display_name);
        if (me.data.zone_ids.length) {
          setZones(me.data.zone_ids);
          setPrimaryZone((prev) =>
            prev && me.data!.zone_ids.includes(prev)
              ? prev
              : me.data!.zone_ids[0] ?? prev,
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [checking, leaveGuest]);

  // Load the read-only map for the primary zone.
  useEffect(() => {
    if (!primaryZone) return;
    let active = true;
    setLoadingMap(true);
    setError(null);
    void (async () => {
      // Member-token viewers (e.g. an admin also testing guest access) can read
      // the zone's real geometry from GET /zones?zone_id= — no server change.
      if (memberToken) {
        const memberView = await fetchMemberZoneMapView(primaryZone);
        if (!active) return;
        if (memberView) {
          setRawDashboard(null);
          setError(null);
          setMapModel(memberView);
          setLoadingMap(false);
          setFitToken((t) => t + 1);
          return;
        }
      }

      // Pure guests: the guest token only reaches the dashboard endpoint.
      const res = await fetchGuestZoneDashboard(primaryZone);
      if (!active) return;
      setLoadingMap(false);
      if (res.unauthorized) {
        await leaveGuest();
        return;
      }
      if (res.error) {
        setError(res.error);
        setMapModel(null);
        setRawDashboard(null);
        return;
      }
      setRawDashboard(res.data ?? null);
      // Prefer the embedded read-only `zone` (same shape as GET /zones) which
      // carries the real geometry; fall back to the legacy map.* parser.
      setMapModel(
        mapViewFromDashboardZone(res.data) ?? tryParseGuestDashboardMap(res.data),
      );
      // Bump so the map WebView fits to the freshly loaded zone geometry.
      setFitToken((t) => t + 1);
    })();
    return () => {
      active = false;
    };
  }, [primaryZone, memberToken, leaveGuest]);

  const hasMapGeometry = useMemo(
    () =>
      !!mapModel &&
      (mapModel.h3Cells.length > 0 ||
        mapModel.polygons.length > 0 ||
        !!mapModel.center),
    [mapModel],
  );

  // Exact reason the map is empty (instead of a generic "no map" line) so the
  // cause is visible on-device. Mirrors the web GuestDashboard hint + raw JSON.
  const mapDiagnostic = useMemo(() => {
    if (error) return `Dashboard request failed: ${error}`;
    if (!primaryZone) return "No zone is attached to this guest session.";
    if (rawDashboard == null) {
      return `Server returned no dashboard payload for zone ${primaryZone} (GET /api/guest/zones/${primaryZone}/dashboard).`;
    }
    const mapBag =
      rawDashboard && typeof rawDashboard === "object" && !Array.isArray(rawDashboard)
        ? ((rawDashboard as Record<string, unknown>).map ?? null)
        : null;
    const mapKeys =
      mapBag && typeof mapBag === "object"
        ? Object.keys(mapBag as Record<string, unknown>).join(", ") || "(empty)"
        : "(no map object)";
    return (
      `No drawable geometry in the dashboard payload for zone ${primaryZone}. ` +
      `The map needs one of: geojson, bounds, h3_cells/cells, or geo_fence. ` +
      `Server sent map: { ${mapKeys} }. Expand the raw payload below to inspect.`
    );
  }, [error, primaryZone, rawDashboard]);

  if (checking) {
    return (
      <GradientBackground>
        <SafeAreaView
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.accent} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="Guest dashboard"
          subtitle={
            displayName ? `Signed in as ${displayName}` : "Approved guest access"
          }
        />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 14 }}>
          <Card style={{ gap: 8 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: "700",
              }}
            >
              Your zone{zones.length > 1 ? "s" : ""}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {zones.filter(Boolean).map((z) => (
                <Pressable key={z} onPress={() => setPrimaryZone(z)}>
                  <Chip label={z} active={z === primaryZone} />
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.textDim, fontSize: 12 }}>
              You have read-only guest access. You can view the zone map and
              chat with the zone hosts.
            </Text>
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 14,
                paddingTop: 12,
              }}
            >
              <MapPin size={16} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
                Zone map (read-only)
              </Text>
            </View>
            <View style={{ height: 320, marginTop: 10 }}>
              {loadingMap ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : hasMapGeometry ? (
                <DashboardMap
                  center={mapModel?.center ?? AUTH_MAP_DEFAULT_CENTER}
                  zoom={15}
                  drawMode="none"
                  draftRing={[]}
                  previewRings={mapModel?.polygons ?? []}
                  draftCircle={null}
                  draftMarker={null}
                  selectedH3Cells={mapModel?.h3Cells ?? []}
                  h3Resolution={9}
                  savedLayers={[]}
                  draftColor={colors.accent}
                  fitDraftToken={fitToken}
                />
              ) : (
                <ScrollView
                  contentContainerStyle={{ padding: 16, gap: 10 }}
                  style={{ flex: 1 }}
                >
                  <Text
                    style={{
                      color: error ? colors.danger : colors.warning,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {mapDiagnostic}
                  </Text>
                  {rawDashboard != null ? (
                    <>
                      <Pressable
                        onPress={() => setShowRawDashboard((v) => !v)}
                        hitSlop={6}
                      >
                        <Text
                          style={{
                            color: colors.accent,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          {showRawDashboard
                            ? "Hide raw dashboard JSON"
                            : "Show raw dashboard JSON"}
                        </Text>
                      </Pressable>
                      {showRawDashboard ? (
                        <View
                          style={{
                            backgroundColor: colors.bgSurface,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            padding: 10,
                          }}
                        >
                          <Text
                            selectable
                            style={{
                              color: colors.textMuted,
                              fontFamily:
                                Platform.OS === "ios" ? "Menlo" : "monospace",
                              fontSize: 11,
                            }}
                          >
                            {JSON.stringify(rawDashboard, null, 2)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </ScrollView>
              )}
            </View>
          </Card>

          <Button
            label="Open guest chat"
            onPress={() =>
              router.push({
                pathname: "/guest/messages",
                params: { zone: primaryZone },
              })
            }
            leftIcon={<MessageCircle size={16} color="#fff" />}
            fullWidth
          />

          <Button
            label="Leave guest access"
            variant="outline"
            onPress={() => void leaveGuest()}
            leftIcon={<LogOut size={16} color={colors.accent} />}
            fullWidth
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}
