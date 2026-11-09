import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Phone, ShieldAlert, X } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { useGuestCallOptional } from "@/context/GuestCallContext";
import { useEffectiveZoneId } from "@/hooks/useEffectiveZoneId";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  approveGuestRequest,
  guestRequestShowsApprovalActions,
  listGuestRequests,
  rejectGuestRequest,
  type GuestRequest,
} from "@/api/guest";
import { formatServerDateTime } from "@/lib/serverDate";
import { toast } from "@/lib/toast";
import { colors, radius, shadow } from "@/theme/colors";
import { Button } from "@/components/ui/Button";

function requestKey(row: GuestRequest): string {
  return `${row.zone_id}:${row.guest_id || row.id}`;
}

function sortPending(rows: GuestRequest[]): GuestRequest[] {
  return [...rows].sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
      return at - bt;
    }
    return requestKey(a).localeCompare(requestKey(b));
  });
}

function mergePending(rows: GuestRequest[]): GuestRequest[] {
  const byKey = new Map<string, GuestRequest>();
  for (const row of rows) {
    if (!guestRequestShowsApprovalActions(row)) continue;
    byKey.set(requestKey(row), row);
  }
  return sortPending([...byKey.values()]);
}

/**
 * One modal for all pending guest access requests.
 * Opens when the admin app is running and a request arrives, and again on
 * cold start / foreground if any requests are still waiting.
 */
export function PendingGuestRequestsHost() {
  const isAdmin = useIsAdmin();
  const { token, user } = useAuth();
  const guestCall = useGuestCallOptional();
  const insets = useSafeAreaInsets();
  const { candidateZoneIds, effectiveZoneId, refresh: refreshZones } =
    useEffectiveZoneId();

  const [pending, setPending] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const refreshSeq = useRef(0);

  const zoneIds = useMemo(() => {
    if (candidateZoneIds.length > 0) return candidateZoneIds;
    const fallback = effectiveZoneId.trim();
    return fallback ? [fallback] : [];
  }, [candidateZoneIds, effectiveZoneId]);

  const { lastMessage, status: wsStatus } = useWebSocket({
    token,
    zoneIds,
    enabled: Boolean(token && isAdmin && zoneIds.length > 0),
  });

  const refreshPending = useCallback(async () => {
    if (!isAdmin || !token || zoneIds.length === 0) {
      setPending([]);
      return;
    }
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const results = await Promise.all(
        zoneIds.map((zoneId) =>
          listGuestRequests(zoneId, { pendingOnly: true }),
        ),
      );
      if (seq !== refreshSeq.current) return;
      const merged: GuestRequest[] = [];
      for (const result of results) {
        if (result.error) continue;
        merged.push(...(result.data ?? []));
      }
      setPending(mergePending(merged));
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, [isAdmin, token, zoneIds]);

  useEffect(() => {
    if (!isAdmin || !token) {
      setPending([]);
      setSnoozed(false);
      return;
    }
    void refreshZones();
  }, [isAdmin, token, refreshZones]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    void refreshPending();
  }, [isAdmin, token, refreshPending]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        setSnoozed(false);
        void refreshPending();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [isAdmin, token, refreshPending]);

  useEffect(() => {
    if (!isAdmin || !token || wsStatus !== "open") return;
    void refreshPending();
  }, [isAdmin, token, wsStatus, refreshPending]);

  useEffect(() => {
    if (!lastMessage || !isAdmin) return;
    try {
      const parsed = JSON.parse(lastMessage) as { type?: string };
      if (
        parsed.type === "unexpected_guest" ||
        parsed.type === "GUEST_REQUEST_CHANGED" ||
        parsed.type === "guest_is_here" ||
        parsed.type === "PERMISSION_MESSAGE"
      ) {
        if (parsed.type === "unexpected_guest") {
          setSnoozed(false);
        }
        void refreshPending();
      }
    } catch {
      /* ignore non-JSON */
    }
  }, [lastMessage, isAdmin, refreshPending]);

  const visible = pending.length > 0 && !snoozed && Boolean(user);
  const callBlocking = Boolean(guestCall?.session);

  const onApprove = async (row: GuestRequest) => {
    const key = requestKey(row);
    setBusyKey(key);
    const res = await approveGuestRequest(row.id || row.guest_id, row.zone_id);
    setBusyKey(null);
    if (res.error) {
      toast.error(res.error, { title: "Approve failed" });
      return;
    }
    toast.success(`${row.guest_name ?? "Guest"} approved`);
    setPending((prev) => prev.filter((item) => requestKey(item) !== key));
    void refreshPending();
  };

  const onReject = async (row: GuestRequest) => {
    const key = requestKey(row);
    setBusyKey(key);
    const res = await rejectGuestRequest(row.id || row.guest_id, row.zone_id);
    setBusyKey(null);
    if (res.error) {
      toast.error(res.error, { title: "Reject failed" });
      return;
    }
    toast.success(`${row.guest_name ?? "Guest"} rejected`);
    setPending((prev) => prev.filter((item) => requestKey(item) !== key));
    void refreshPending();
  };

  const onCall = (row: GuestRequest) => {
    guestCall?.startAdminCall({
      guestId: row.guest_id,
      zoneId: row.zone_id,
      guestName: row.guest_name,
      fullscreen: false,
    });
  };

  if (!isAdmin || !token) return null;

  return (
    <Modal
      visible={visible && !callBlocking}
      transparent
      animationType="fade"
      onRequestClose={() => setSnoozed(true)}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              marginTop: Math.max(insets.top, 16),
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <ShieldAlert size={18} color={colors.warning} />
              <Text style={styles.title}>
                Guest request{pending.length === 1 ? "" : "s"} waiting
              </Text>
            </View>
            <Pressable
              onPress={() => setSnoozed(true)}
              hitSlop={10}
              accessibilityLabel="Remind me later"
              style={styles.closeBtn}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {pending.length === 1
              ? "A guest is waiting for your approval."
              : `${pending.length} guests are waiting for approval.`}
            {" "}
            Review them here — this returns when you reopen the app if any remain pending.
          </Text>

          {loading && pending.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Checking guest requests…</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {pending.map((row) => {
                const key = requestKey(row);
                const busy = busyKey === key;
                return (
                  <View key={key} style={styles.row}>
                    <View style={styles.rowTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.guestName} numberOfLines={1}>
                          {row.guest_name?.trim() || "Guest"}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {row.zone_id}
                          {row.created_at
                            ? ` · ${formatServerDateTime(row.created_at)}`
                            : ""}
                        </Text>
                      </View>
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingPillText}>Pending</Text>
                      </View>
                    </View>
                    <View style={styles.actions}>
                      <Button
                        label="Approve"
                        size="sm"
                        tone="green"
                        disabled={busy}
                        loading={busy}
                        onPress={() => void onApprove(row)}
                        style={styles.actionBtn}
                      />
                      <Button
                        label="Reject"
                        size="sm"
                        tone="red"
                        disabled={busy}
                        onPress={() => void onReject(row)}
                        style={styles.actionBtn}
                      />
                      <Button
                        label={guestCall?.callRequesting ? "Calling…" : "Call"}
                        size="sm"
                        tone="blue"
                        leftIcon={<Phone size={14} color="#1B5BB5" />}
                        loading={Boolean(guestCall?.callRequesting)}
                        disabled={
                          busy ||
                          Boolean(guestCall?.session) ||
                          Boolean(guestCall?.callRequesting)
                        }
                        onPress={() => onCall(row)}
                        style={styles.actionBtn}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Button
              label="Later"
              variant="outline"
              size="sm"
              tone="slate"
              fullWidth
              onPress={() => setSnoozed(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 44, 92, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    maxHeight: "88%",
    borderRadius: radius.xl,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    ...shadow.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    flexShrink: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
  },
  subtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingRow: {
    marginTop: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  list: {
    marginTop: 14,
    maxHeight: 420,
  },
  listContent: {
    gap: 10,
    paddingBottom: 4,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    padding: 12,
    gap: 10,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  guestName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  meta: {
    marginTop: 2,
    color: colors.textDim,
    fontSize: 11,
  },
  pendingPill: {
    borderRadius: radius.pill,
    backgroundColor: "rgba(224,153,42,0.14)",
    borderWidth: 1,
    borderColor: "rgba(224,153,42,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingPillText: {
    color: "#9A6410",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    minWidth: 96,
  },
  footer: {
    marginTop: 12,
  },
});
