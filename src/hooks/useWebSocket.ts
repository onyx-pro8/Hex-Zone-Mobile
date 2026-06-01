import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultRealtimeWsBase } from "@/lib/messageSocket";

export type WebSocketStatus = "connecting" | "open" | "closed";

export type UseWebSocketParams = {
  token: string | null;
  zoneIds: string[];
  enabled?: boolean;
};

type Snapshot = {
  status: WebSocketStatus;
  lastMessage: string | null;
};

type Listener = (snapshot: Snapshot) => void;

type SharedManager = {
  ws: WebSocket | null;
  status: WebSocketStatus;
  lastMessage: string | null;
  listeners: Set<Listener>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  activeUsers: number;
  token: string | null;
  zoneIds: string[];
  enabled: boolean;
  connectionSeq: number;
};

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

const sharedManager: SharedManager = {
  ws: null,
  status: "closed",
  lastMessage: null,
  listeners: new Set(),
  reconnectTimer: null,
  reconnectAttempt: 0,
  activeUsers: 0,
  token: null,
  zoneIds: [],
  enabled: true,
  connectionSeq: 0,
};

function snapshot(): Snapshot {
  return {
    status: sharedManager.status,
    lastMessage: sharedManager.lastMessage,
  };
}

function emitSnapshot() {
  const next = snapshot();
  for (const listener of sharedManager.listeners) {
    listener(next);
  }
}

function clearReconnectTimer() {
  if (sharedManager.reconnectTimer != null) {
    clearTimeout(sharedManager.reconnectTimer);
    sharedManager.reconnectTimer = null;
  }
}

function closeSocket() {
  clearReconnectTimer();
  const ws = sharedManager.ws;
  sharedManager.ws = null;
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close(1000, "client close");
    } catch {
      /* ignore */
    }
  }
  sharedManager.status = "closed";
  emitSnapshot();
}

function buildSocketUrl(token: string): string {
  const base = defaultRealtimeWsBase();
  return `${base}?token=${encodeURIComponent(token)}`;
}

function sendSubscribeFrame() {
  if (sharedManager.zoneIds.length === 0) return;
  const ws = sharedManager.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const frame = JSON.stringify({
    type: "SUBSCRIBE",
    zoneIds: sharedManager.zoneIds,
  });
  ws.send(frame);
}

function scheduleReconnect() {
  if (!sharedManager.token || sharedManager.activeUsers === 0 || !sharedManager.enabled) {
    return;
  }
  clearReconnectTimer();
  const backoff = Math.min(
    MAX_BACKOFF_MS,
    INITIAL_BACKOFF_MS * 2 ** sharedManager.reconnectAttempt,
  );
  sharedManager.reconnectAttempt += 1;
  const jitter = Math.floor(Math.random() * 400);
  const delay = backoff + jitter;
  sharedManager.reconnectTimer = setTimeout(() => {
    sharedManager.reconnectTimer = null;
    connectSocket();
  }, delay);
}

function connectSocket() {
  if (!sharedManager.token || sharedManager.activeUsers === 0 || !sharedManager.enabled) {
    return;
  }
  if (
    sharedManager.ws &&
    (sharedManager.ws.readyState === WebSocket.OPEN ||
      sharedManager.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const token = sharedManager.token;
  const url = buildSocketUrl(token);
  sharedManager.status = "connecting";
  emitSnapshot();

  const connectionId = ++sharedManager.connectionSeq;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    sharedManager.status = "closed";
    emitSnapshot();
    scheduleReconnect();
    return;
  }

  sharedManager.ws = ws;

  ws.onopen = () => {
    if (sharedManager.ws !== ws) return;
    sharedManager.reconnectAttempt = 0;
    sharedManager.status = "open";
    emitSnapshot();
    void connectionId;
    sendSubscribeFrame();
  };

  ws.onmessage = (event) => {
    if (sharedManager.ws !== ws) return;
    const payload =
      typeof event.data === "string" ? event.data : String(event.data ?? "");
    sharedManager.lastMessage = payload;
    emitSnapshot();
  };

  ws.onclose = () => {
    if (sharedManager.ws === ws) {
      sharedManager.ws = null;
    }
    sharedManager.status = "closed";
    emitSnapshot();
    if (sharedManager.activeUsers > 0 && sharedManager.enabled) {
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    /* onclose handles reconnect */
  };
}

function setToken(token: string | null) {
  if (sharedManager.token === token) return;
  sharedManager.token = token;
  closeSocket();
  if (token && sharedManager.enabled) {
    connectSocket();
  }
}

function setZoneIds(zoneIds: string[]) {
  const same =
    sharedManager.zoneIds.length === zoneIds.length &&
    sharedManager.zoneIds.every((id, idx) => id === zoneIds[idx]);
  if (same) return;
  sharedManager.zoneIds = [...zoneIds];
  sendSubscribeFrame();
}

function setEnabled(enabled: boolean) {
  if (sharedManager.enabled === enabled) return;
  sharedManager.enabled = enabled;
  if (!enabled) {
    closeSocket();
    return;
  }
  if (sharedManager.token && sharedManager.activeUsers > 0) {
    connectSocket();
  }
}

export function useWebSocket({ token, zoneIds, enabled = true }: UseWebSocketParams) {
  const [state, setState] = useState<Snapshot>(() => snapshot());
  const zoneKey = useMemo(() => JSON.stringify(zoneIds), [zoneIds]);

  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    sharedManager.listeners.add(listener);
    sharedManager.activeUsers += 1;
    setEnabled(enabled);
    setToken(token);
    setZoneIds(zoneIds);
    if (enabled) connectSocket();

    return () => {
      sharedManager.listeners.delete(listener);
      sharedManager.activeUsers = Math.max(0, sharedManager.activeUsers - 1);
      if (sharedManager.activeUsers === 0) {
        closeSocket();
      }
    };
  }, [token, enabled]);

  useEffect(() => {
    setZoneIds(zoneIds);
  }, [zoneKey]);

  const sendMessage = useCallback((payload: unknown) => {
    const ws = sharedManager.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    ws.send(data);
    return true;
  }, []);

  return {
    status: state.status,
    lastMessage: state.lastMessage,
    sendMessage,
  };
}
