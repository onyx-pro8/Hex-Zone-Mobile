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
import { AUTH_MAP_DEFAULT_CENTER } from "@/lib/h3";
import { useAuth } from "@/context/AuthContext";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
} from "@/lib/storage";
import { colors } from "@/theme/colors";

export default function GuestDashboardScreen() {
  const router = useRouter();
  const { token: memberToken } = useAuth();

  const [checking, setChecking] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [primaryZone, setPrimaryZone] = useState("");
  const [mapModel, setMapModel] = useState<GuestDashboardMapView | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        return;
      }
      setMapModel(tryParseGuestDashboardMap(res.data));
      // Bump so the map WebView fits to the freshly loaded zone geometry.
      setFitToken((t) => t + 1);
    })();
    return () => {
      active = false;
    };
  }, [primaryZone, leaveGuest]);

  const hasMapGeometry = useMemo(
    () =>
      !!mapModel &&
      (mapModel.h3Cells.length > 0 ||
        mapModel.polygons.length > 0 ||
        !!mapModel.center),
    [mapModel],
  );

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
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                  }}
                >
                  <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                    {error ??
                      "No map is available for this zone yet. You can still chat with the hosts below."}
                  </Text>
                </View>
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
