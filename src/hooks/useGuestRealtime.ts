import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRealtimeWsBase } from "@/lib/messageSocket";
import { parseMemberPresenceSocketEvent } from "@/lib/messageSocket";

type PresenceMap = Record<number, boolean>;

/**
 * Isolated guest WebSocket (does not share the member socket manager).
 * Receives live **MEMBER_PRESENCE** for peer online dots.
 */
export function useGuestRealtime(params: {
  token: string | null;
  zoneIds: string[];
  enabled?: boolean;
  /** Seed from GET /peers `online` flags. */
  seedPresence?: PresenceMap;
}): {
  status: "connecting" | "open" | "closed";
  isPeerOnline: (ownerId: string | number | null | undefined) => boolean;
  lastMessage: string | null;
} {
  const { token, zoneIds, enabled = true, seedPresence } = params;
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("closed");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const zoneKey = useMemo(() => JSON.stringify(zoneIds), [zoneIds]);

  useEffect(() => {
    if (!seedPresence) return;
    setPresence((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(seedPresence)) {
        const id = Number(k);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (next[id] !== v) {
          next[id] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [seedPresence]);

  useEffect(() => {
    if (!enabled || !token?.trim()) {
      setStatus("closed");
      return;
    }
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      const url = `${defaultRealtimeWsBase()}?token=${encodeURIComponent(token.trim())}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        attempt = 0;
        setStatus("open");
        const ids = zoneIds.map((z) => z.trim()).filter(Boolean);
        if (ids.length) {
          ws.send(JSON.stringify({ type: "SUBSCRIBE", zoneIds: ids }));
        }
      };

      ws.onmessage = (ev) => {
        if (closed) return;
        const raw = typeof ev.data === "string" ? ev.data : "";
        if (!raw) return;
        setLastMessage(raw);
        const presenceEv = parseMemberPresenceSocketEvent(raw);
        if (presenceEv) {
          setPresence((prev) => {
            if (prev[presenceEv.ownerId] === presenceEv.online) return prev;
            return { ...prev, [presenceEv.ownerId]: presenceEv.online };
          });
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closed) {
          setStatus("closed");
          return;
        }
        setStatus("closed");
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        /* onclose handles reconnect */
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      setStatus("closed");
    };
  }, [token, enabled, zoneKey]);

  const isPeerOnline = useCallback(
    (ownerId: string | number | null | undefined) => {
      if (ownerId == null || ownerId === "") return false;
      const id = typeof ownerId === "number" ? ownerId : Number(String(ownerId).trim());
      if (!Number.isFinite(id) || id <= 0) return false;
      return presence[id] === true;
    },
    [presence],
  );

  return { status, isPeerOnline, lastMessage };
}
