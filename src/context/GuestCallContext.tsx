import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { subscribeRealtimeMessages, useWebSocket } from "@/hooks/useWebSocket";
import {
  emitEscalatedAccessClosed,
  formatCallDuration,
  parseGuestCallSocketMessage,
  sameVisibleCall,
  sessionFromCallPayload,
  zoneIdsEqual,
  type GuestCallRole,
  type GuestCallSession,
} from "@/lib/guestCall";
import {
  handleGuestCallSignal,
  startGuestCallMedia,
  stopGuestCallMedia,
} from "@/lib/guestCallMedia";
import { CallAudioBridge, setMicErrorHandler } from "@/lib/callAudioBridge";
import { ensureMicrophoneForCall } from "@/lib/micPermission";
import { getStoredGuestSession, subscribeGuestSessionChanged } from "@/lib/storage";
import { defaultRealtimeWsBase } from "@/lib/messageSocket";
import { toast } from "@/lib/toast";

type StartAdminCallArgs = {
  guestId: string;
  zoneId: string;
  guestName?: string;
  fullscreen?: boolean;
};

type PresentLocalOutgoingArgs = {
  zoneId: string;
  guestId: string;
  guestName?: string;
  fullscreen?: boolean;
};

type GuestCallContextValue = {
  session: GuestCallSession | null;
  elapsedLabel: string;
  callBusy: boolean;
  /** True after Call is pressed, until the server answers. */
  callRequesting: boolean;
  startAdminCall: (args: StartAdminCallArgs) => boolean;
  startGuestCall: (opts?: {
    fullscreen?: boolean;
    guestId?: string;
    zoneId?: string;
    adminAvatarUrl?: string | null;
  }) => boolean;
  /** Show the guest's outgoing card immediately (escalated auto-call) without sending another invite. */
  presentLocalOutgoingCall: (args: PresentLocalOutgoingArgs) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  /** Guest card is on screen; the admin invite can go out now. */
  notifyCardVisible: () => void;
};

const GuestCallContext = createContext<GuestCallContextValue | null>(null);

function useElapsed(acceptedAt: string | null, active: boolean): string {
  const [label, setLabel] = useState("00:00");
  useEffect(() => {
    if (!active || !acceptedAt) {
      setLabel("00:00");
      return;
    }
    const start = Date.parse(acceptedAt);
    if (!Number.isFinite(start)) {
      setLabel("00:00");
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const elapsedMs = Math.max(0, Date.now() - start);
      setLabel(formatCallDuration(elapsedMs / 1000));
      // Flip on the shared second boundary so both devices show the same time.
      const remainder = elapsedMs % 1000;
      const delay = remainder === 0 ? 1000 : 1000 - remainder;
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [acceptedAt, active]);
  return label;
}

function guestSubject(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded =
      typeof globalThis.atob === "function" ? globalThis.atob(padded) : "";
    if (!decoded) return null;
    const payload = JSON.parse(decoded) as { sub?: unknown };
    const sub = String(payload.sub ?? "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

export function GuestCallProvider({ children }: { children: ReactNode }) {
  const { token: memberToken, user } = useAuth();
  const isAdmin = useIsAdmin();
  const canHandleAdminCall = Boolean(user) && isAdmin;
  const isAdminRef = useRef(canHandleAdminCall);
  isAdminRef.current = canHandleAdminCall;
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestZoneIds, setGuestZoneIds] = useState<string[]>([]);
  const [session, setSession] = useState<GuestCallSession | null>(null);
  const [callRequesting, setCallRequesting] = useState(false);
  const sessionRef = useRef<GuestCallSession | null>(null);
  sessionRef.current = session;

  const guestTokenRef = useRef<string | null>(null);
  guestTokenRef.current = guestToken;
  const guestWsRef = useRef<WebSocket | null>(null);
  const guestCloseRef = useRef<number | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptLockRef = useRef(false);
  const waitingSyncRef = useRef<{ role: GuestCallRole; guestId: string; zoneId: string } | null>(
    null,
  );
  const [guestWsOpen, setGuestWsOpen] = useState(false);
  const lastHandledRef = useRef<{ admin: string | null; guest: string | null }>({
    admin: null,
    guest: null,
  });

  const putSession = useCallback((next: GuestCallSession) => {
    const current = sessionRef.current;
    const resolved =
      current &&
      current.callId === next.callId &&
      current.state === "connected" &&
      next.state !== "connected"
        ? { ...next, state: "connected" as const, acceptedAt: next.acceptedAt || current.acceptedAt }
        : next;
    sessionRef.current = resolved;
    waitingSyncRef.current = null;
    if (answerTimerRef.current) {
      clearTimeout(answerTimerRef.current);
      answerTimerRef.current = null;
    }
    setSession((prev) => (sameVisibleCall(prev, resolved) ? prev : resolved));
  }, []);

  const armedCallRef = useRef<string | null>(null);
  const mediaCallRef = useRef<string | null>(null);
  const clearSession = useCallback(async () => {
    sessionRef.current = null;
    armedCallRef.current = null;
    mediaCallRef.current = null;
    setMicErrorHandler(null);
    setSession(null);
    await stopGuestCallMedia();
  }, []);

  const refreshGuestAuth = useCallback(async () => {
    const stored = await getStoredGuestSession();
    const token = stored?.access_token?.trim() || null;
    const zones = stored
      ? (stored.zone_ids?.length ? stored.zone_ids : [stored.zone_id])
          .map((z) => String(z || "").trim())
          .filter(Boolean)
      : [];
    setGuestToken((prev) => {
      if (prev === token) return prev;
      const socketUp =
        guestWsRef.current?.readyState === WebSocket.OPEN ||
        guestWsRef.current?.readyState === WebSocket.CONNECTING;
      const sameGuest =
        !!prev && !!token && guestSubject(prev) !== null && guestSubject(prev) === guestSubject(token);
      // Status polls mint a fresh JWT every few seconds. Replacing it restarts
      // the socket and drops the reply that opens the sender's card.
      if (socketUp && sameGuest) return prev;
      return token;
    });
    setGuestZoneIds((prev) => (zoneIdsEqual(prev, zones) ? prev : zones));
  }, []);

  useEffect(() => {
    void refreshGuestAuth();
    const unsub = subscribeGuestSessionChanged(() => {
      void refreshGuestAuth();
    });
    // Poll faster until a guest token appears so Call works right after check-in.
    const id = setInterval(
      () => void refreshGuestAuth(),
      guestToken ? 10000 : 1200,
    );
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [refreshGuestAuth, guestToken]);

  const memberZoneIds = useMemo(
    () => (user?.zone_id ? [String(user.zone_id)] : []),
    [user?.zone_id],
  );

  const { sendMessage, status } = useWebSocket({
    token: memberToken,
    zoneIds: memberZoneIds,
    enabled: Boolean(memberToken),
  });
  const memberStatusRef = useRef(status);
  memberStatusRef.current = status;

  const sendCallAs = useCallback(
    (asRole: GuestCallRole, payload: Record<string, unknown>) => {
      if (asRole === "guest") {
        const ws = guestWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
          return true;
        }
        return false;
      }
      return sendMessage(payload);
    },
    [sendMessage],
  );

  const beginMedia = useCallback(
    async (next: GuestCallSession) => {
      const asRole: GuestCallRole = next.isCaller
        ? next.callerRole
        : next.callerRole === "guest"
          ? "admin"
          : "guest";
      setMicErrorHandler(null);
      mediaCallRef.current = next.callId;
      await startGuestCallMedia({
        isOfferer: next.isCaller,
        onSignal: (signal) => {
          const live = sessionRef.current;
          const callId =
            live?.callId && !live.callId.startsWith("pending-")
              ? live.callId
              : next.callId;
          if (!callId || callId.startsWith("pending-") || callId.startsWith("queue-")) {
            return;
          }
          sendCallAs(asRole, {
            type: "CALL_SIGNAL",
            data: { call_id: callId, signal },
          });
        },
      });
    },
    [sendCallAs],
  );

  useEffect(() => {
    if (!session || session.state !== "connected") return;
    if (mediaCallRef.current === session.callId) return;
    void beginMedia(session);
  }, [session, beginMedia]);

  const applyEvent = useCallback(
    async (raw: string | null, asRole: GuestCallRole) => {
      if (!raw) return;
      let envelopeType = "";
      try {
        const envelope = JSON.parse(raw) as {
          type?: string;
          error?: { message?: string; error_code?: string };
        };
        envelopeType = String(envelope.type || "").toUpperCase();
        if (envelopeType === "CALL_SIGNAL") {
          /* voice frames must never be dropped by equality */
        } else if (lastHandledRef.current[asRole] === raw) {
          return;
        }
        if (envelopeType === "ERROR") {
          lastHandledRef.current[asRole] = raw;
          const code = String(envelope.error?.error_code || "");
          if (answerTimerRef.current) {
            clearTimeout(answerTimerRef.current);
            answerTimerRef.current = null;
          }
          setCallRequesting(false);
          const current = sessionRef.current;
          const fatal =
            code === "RECEIVER_OFFLINE" ||
            code === "CALL_FAILED" ||
            code === "CALL_NOT_FOUND" ||
            code === "INVALID_CALL" ||
            code === "FORBIDDEN";
          if (!fatal) return;
          waitingSyncRef.current = null;
          if (current) void clearSession();
          toast.error(envelope.error?.message || "The call could not be started.", {
            title: "Call",
          });
          return;
        }
      } catch {
        return;
      }
      const ev = parseGuestCallSocketMessage(raw);
      if (!ev) return;
      if (ev.type !== "CALL_SIGNAL") {
        lastHandledRef.current[asRole] = raw;
      }

      if (ev.type === "CALL_SIGNAL") {
        const signal = ev.data.signal;
        if (signal && typeof signal === "object") {
          await handleGuestCallSignal(
            signal as Parameters<typeof handleGuestCallSignal>[0],
            (out) => {
              const callId = String(
                ev.data.call_id ?? sessionRef.current?.callId ?? "",
              );
              if (!callId || callId.startsWith("pending-") || callId.startsWith("queue-")) return;
              sendCallAs(asRole, {
                type: "CALL_SIGNAL",
                data: { call_id: callId, signal: out },
              });
            },
          );
        }
        return;
      }

      if (
        ev.type === "CALL_REJECT" ||
        ev.type === "CALL_CANCEL" ||
        ev.type === "CALL_TIMEOUT" ||
        ev.type === "CALL_END"
      ) {
        const endedId = String(ev.data.call_id ?? "").trim();
        const cur = sessionRef.current;
        const endedGuest = String(ev.data.guest_id ?? "").trim();
        const sameCall =
          !cur ||
          !endedId ||
          cur.callId === endedId ||
          cur.callId.startsWith("pending-") ||
          cur.callId.startsWith("queue-") ||
          (endedGuest !== "" && cur.guestId === endedGuest);
        if (!sameCall) return;
        if (ev.data.auto_close_access === true) {
          emitEscalatedAccessClosed();
        }
        await clearSession();
        return;
      }

      if (ev.type === "CALL_STARTED" || (ev.type === "CALL_INVITE" && sessionRef.current?.isCaller && sessionRef.current.callerRole === asRole)) {
        const next = sessionFromCallPayload(ev.data, { localRole: asRole });
        if (!next) return;
        next.isCaller = true;
        if (sessionRef.current?.state === "connected") next.state = "connected";
        // Keep the outgoing card visible while the server id replaces a local pending id.
        if (sessionRef.current?.isCaller) {
          next.adminAvatarUrl = next.adminAvatarUrl || sessionRef.current.adminAvatarUrl;
          next.guestAvatarUrl = next.guestAvatarUrl || sessionRef.current.guestAvatarUrl;
          next.fullscreen = sessionRef.current.fullscreen || next.fullscreen;
        }
        setCallRequesting(false);
        putSession(next);
        return;
      }

      if (ev.type === "CALL_QUEUED") {
        const next = sessionFromCallPayload(ev.data, { localRole: asRole });
        if (!next) return;
        next.state = "queued";
        const alreadyQueued =
          sessionRef.current?.state === "queued" &&
          sessionRef.current.callId === next.callId;
        setCallRequesting(false);
        putSession(next);
        if (!alreadyQueued) {
          const place =
            next.queuePosition && next.queuePosition > 1
              ? ` You are number ${next.queuePosition}.`
              : "";
          toast.info(`You are in the queue.${place}`, { title: "Call", duration: 4200 });
        }
        return;
      }

      if (ev.type === "CALL_INVITE" || ev.type === "CALL_ACCEPT") {
        const next = sessionFromCallPayload(ev.data, { localRole: asRole });
        if (!next) return;
        if (ev.type === "CALL_ACCEPT") {
          const cur = sessionRef.current;
          // Pending local ids differ from the server id — still connect this card.
          if (
            cur &&
            cur.callId !== next.callId &&
            !cur.callId.startsWith("pending-") &&
            !cur.callId.startsWith("queue-") &&
            cur.guestId &&
            next.guestId &&
            cur.guestId !== next.guestId
          ) {
            return;
          }
          next.state = "connected";
          if (cur?.isCaller) next.isCaller = true;
          if (!next.acceptedAt) {
            next.acceptedAt = cur?.acceptedAt || new Date().toISOString();
          }
          if (cur) {
            next.adminAvatarUrl = next.adminAvatarUrl || cur.adminAvatarUrl;
            next.guestAvatarUrl = next.guestAvatarUrl || cur.guestAvatarUrl;
            next.fullscreen = cur.fullscreen || next.fullscreen;
          }
          setCallRequesting(false);
          putSession(next);
          await beginMedia(next);
          return;
        }
        const wasQueued =
          sessionRef.current?.state === "queued" ||
          Boolean(sessionRef.current?.callId.startsWith("queue-"));
        const alreadyLive =
          sessionRef.current?.callId === next.callId &&
          sessionRef.current?.state === "ringing";
        const fromQueue = ev.data.from_queue === true || wasQueued;
        setCallRequesting(false);
        putSession(next);
        if (fromQueue && next.state === "ringing" && !alreadyLive) {
          const message = next.isCaller
            ? next.callerRole === "admin"
              ? `Now calling ${next.guestName}.`
              : "Now calling the administrator."
            : next.callerRole === "admin"
              ? "The administrator is calling."
              : `${next.guestName} is calling.`;
          toast.info(message, { title: "Call", duration: 4200 });
        }
      }
    },
    [beginMedia, clearSession, putSession, sendCallAs],
  );

  const applyEventRef = useRef(applyEvent);
  applyEventRef.current = applyEvent;

  useEffect(() => {
    return subscribeRealtimeMessages((raw) => {
      // Guest calls are guest↔admin only. Members share this socket but must not ring.
      if (!isAdminRef.current) return;
      void applyEventRef.current(raw, "admin");
    });
  }, []);

  // Stable guest socket — only reconnect when the token actually changes.
  useEffect(() => {
    if (!guestToken) {
      setGuestWsOpen(false);
      if (guestWsRef.current) {
        try {
          guestWsRef.current.close();
        } catch {
          /* ignore */
        }
        guestWsRef.current = null;
      }
      return;
    }

    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const url = `${defaultRealtimeWsBase()}?token=${encodeURIComponent(guestToken)}`;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      guestWsRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        attempt = 0;
        guestCloseRef.current = null;
        setGuestWsOpen(true);
        if (guestZoneIds.length) {
          ws.send(JSON.stringify({ type: "SUBSCRIBE", zoneIds: guestZoneIds }));
        }
      };
      ws.onclose = (ev) => {
        guestCloseRef.current = ev.code;
        if (guestWsRef.current === ws) guestWsRef.current = null;
        if (closed) return;
        setGuestWsOpen(false);
        const delay = Math.min(8000, 400 * 2 ** attempt);
        attempt += 1;
        retry = setTimeout(connect, delay);
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        const raw = typeof ev.data === "string" ? ev.data : "";
        if (raw) void applyEventRef.current(raw, "guest");
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      setGuestWsOpen(false);
      const ws = guestWsRef.current;
      guestWsRef.current = null;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
    // guestZoneIds intentionally omitted — subscribe is sent on open; avoid reconnect flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestToken]);

  // If zones arrive after the socket is already open, subscribe without reconnecting.
  useEffect(() => {
    const ws = guestWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !guestZoneIds.length) return;
    ws.send(JSON.stringify({ type: "SUBSCRIBE", zoneIds: guestZoneIds }));
  }, [guestZoneIds]);

  const armServerAnswerWait = useCallback(() => {
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    answerTimerRef.current = setTimeout(() => {
      answerTimerRef.current = null;
      setCallRequesting(false);
      if (!sessionRef.current) {
        toast.error("The server did not answer the call.", { title: "Call" });
      }
    }, 20000);
  }, []);

  const elapsedLabel = useElapsed(
    session?.acceptedAt ?? null,
    session?.state === "connected",
  );

  const startAdminCall = useCallback(
    (args: StartAdminCallArgs) => {
      if (sessionRef.current) return false;
      if (callRequesting) return true;
      setCallRequesting(true);
      void (async () => {
        const mic = await ensureMicrophoneForCall("caller");
        if (!mic.ok) {
          setCallRequesting(false);
          toast.error(mic.message, { title: "Call" });
          return;
        }
        const started = Date.now();
        while (memberStatusRef.current !== "open" && Date.now() - started < 8000) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const sent = sendCallAs("admin", {
          type: "CALL_INVITE",
          data: {
            guest_id: args.guestId,
            zone_id: args.zoneId,
            guest_name: args.guestName || "Guest",
            fullscreen: Boolean(args.fullscreen),
          },
        });
        if (!sent) {
          setCallRequesting(false);
          toast.error("Could not reach the server. Try again.", { title: "Call" });
          return;
        }
        waitingSyncRef.current = {
          role: "admin",
          guestId: args.guestId,
          zoneId: args.zoneId,
        };
        armServerAnswerWait();
      })();
      return true;
    },
    [armServerAnswerWait, callRequesting, sendCallAs],
  );

  const presentLocalOutgoingCall = useCallback((_args: PresentLocalOutgoingArgs) => {
    // Cards open only from the server (CALL_STARTED / CALL_INVITE / CALL_QUEUED).
  }, []);

  const startGuestCall = useCallback(
    (opts?: {
      fullscreen?: boolean;
      guestId?: string;
      zoneId?: string;
      adminAvatarUrl?: string | null;
    }) => {
      if (sessionRef.current && !sessionRef.current.callId.startsWith("pending-")) {
        return false;
      }
      if (callRequesting) return false;
      setCallRequesting(true);
      void (async () => {
        const mic = await ensureMicrophoneForCall("caller");
        if (!mic.ok) {
          setCallRequesting(false);
          toast.error(mic.message, { title: "Call" });
          return;
        }
        if (!guestTokenRef.current) await refreshGuestAuth();
        const started = Date.now();
        while (guestWsRef.current?.readyState !== WebSocket.OPEN && Date.now() - started < 15000) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const sent = sendCallAs("guest", {
          type: "CALL_INVITE",
          data: {
            guest_id: String(opts?.guestId || "").trim(),
            zone_id: String(opts?.zoneId || guestZoneIds[0] || "").trim(),
            fullscreen: Boolean(opts?.fullscreen),
            access_reject_escalation: Boolean(opts?.fullscreen),
            ...(user?.avatar_url ? { guest_avatar_url: user.avatar_url } : {}),
          },
        });
        if (!sent) {
          setCallRequesting(false);
          toast.error(
            guestCloseRef.current === 1008
              ? "The server closed the call connection. Reload and try again."
              : "The call line is still connecting. Try again.",
            { title: "Call" },
          );
          return;
        }
        waitingSyncRef.current = {
          role: "guest",
          guestId: String(opts?.guestId || "").trim(),
          zoneId: String(opts?.zoneId || guestZoneIds[0] || "").trim(),
        };
        armServerAnswerWait();
      })();
      return true;
    },
    [armServerAnswerWait, callRequesting, guestZoneIds, refreshGuestAuth, sendCallAs, user?.avatar_url],
  );

  const roleForSession = useCallback((cur: GuestCallSession): GuestCallRole => {
    return cur.isCaller
      ? cur.callerRole
      : cur.callerRole === "guest"
        ? "admin"
        : "guest";
  }, []);

  // The invite can reach the admin before CALL_STARTED is applied on the guest.
  // Ask the server for the live call until the sender card opens.
  useEffect(() => {
    if (session || !callRequesting) return;
    const send = () => {
      if (sessionRef.current) return;
      const wait = waitingSyncRef.current;
      if (!wait) return;
      sendCallAs(wait.role, {
        type: "CALL_SYNC",
        data: {
          call_id: "",
          guest_id: wait.guestId,
          zone_id: wait.zoneId,
        },
      });
    };
    send();
    const timer = setInterval(send, 1000);
    return () => clearInterval(timer);
  }, [session, callRequesting, sendCallAs]);

  useEffect(() => {
    if (!session || session.state !== "ringing") return;
    if (session.callId.startsWith("pending-") || session.callId.startsWith("queue-")) return;
    const send = () => {
      const cur = sessionRef.current;
      if (!cur || cur.state !== "ringing" || cur.callId !== session.callId) return;
      sendCallAs(roleForSession(cur), {
        type: "CALL_SYNC",
        data: {
          call_id: cur.callId,
          guest_id: cur.guestId,
          zone_id: cur.zoneId,
        },
      });
    };
    send();
    const timer = setInterval(send, 1000);
    return () => clearInterval(timer);
  }, [session, roleForSession, sendCallAs]);

  const acceptCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || cur.state !== "ringing" || cur.isCaller) return;
    if (cur.callId.startsWith("pending-")) return;
    if (acceptLockRef.current) return;
    acceptLockRef.current = true;
    void (async () => {
      try {
        const mic = await ensureMicrophoneForCall("receiver");
        if (!mic.ok) {
          // Stay on ringing. Do not send CALL_ACCEPT.
          toast.error(mic.message, { title: "Call" });
          return;
        }
        const live = sessionRef.current;
        if (!live || live.state !== "ringing" || live.isCaller) return;
        if (live.callId.startsWith("pending-")) return;
        sendCallAs(roleForSession(live), {
          type: "CALL_ACCEPT",
          data: { call_id: live.callId },
        });
      } finally {
        acceptLockRef.current = false;
      }
    })();
  }, [roleForSession, sendCallAs]);

  const notifyCardVisible = useCallback(() => {
    // The invite is sent when Call is pressed. The card opens from the server reply.
  }, []);

  const rejectCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || (cur.state !== "ringing" && cur.state !== "queued")) return;
    const sent = sendCallAs(roleForSession(cur), {
      type: cur.isCaller ? "CALL_CANCEL" : "CALL_REJECT",
      data: {
        call_id: cur.callId,
        guest_id: cur.guestId,
        zone_id: cur.zoneId,
        access_reject_escalation: cur.accessRejectEscalation,
        fullscreen: cur.fullscreen,
      },
    });
    if (!sent) {
      if (cur.callId.startsWith("pending-")) void clearSession();
      toast.error("Could not reach the server. The call is still ringing.", { title: "Call" });
    }
  }, [clearSession, roleForSession, sendCallAs]);

  const endCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (!cur.callId.startsWith("pending-")) {
      sendCallAs(roleForSession(cur), {
        type: "CALL_END",
        data: { call_id: cur.callId },
      });
    }
    void clearSession();
  }, [clearSession, roleForSession, sendCallAs]);

  // Unanswered rings end with the server clock. A connected call is not timed out.
  useEffect(() => {
    if (!session || session.state !== "ringing") return;
    if (session.callId.startsWith("pending-") || session.callId.startsWith("queue-")) return;
    const limitSec = Math.min(45, Math.max(15, session.ringTimeoutSeconds || 30));
    const started = Date.parse(session.createdAt || "");
    const startMs = Number.isFinite(started) ? started : Date.now();
    const remaining = Math.max(0, startMs + limitSec * 1000 - Date.now());
    const timer = setTimeout(() => {
      const cur = sessionRef.current;
      if (!cur || cur.callId !== session.callId || cur.state !== "ringing") return;
      sendCallAs(roleForSession(cur), {
        type: cur.isCaller ? "CALL_CANCEL" : "CALL_REJECT",
        data: {
          call_id: cur.callId,
          guest_id: cur.guestId,
          zone_id: cur.zoneId,
          access_reject_escalation: cur.accessRejectEscalation,
        },
      });
    }, remaining);
    return () => clearTimeout(timer);
  }, [session, roleForSession, sendCallAs]);

  const value = useMemo<GuestCallContextValue>(
    () => ({
      session,
      elapsedLabel,
      callRequesting,
      callBusy: Boolean(session) || callRequesting,
      startAdminCall,
      startGuestCall,
      presentLocalOutgoingCall,
      acceptCall,
      rejectCall,
      cancelCall: rejectCall,
      endCall,
      notifyCardVisible,
    }),
    [
      session,
      elapsedLabel,
      callRequesting,
      startAdminCall,
      startGuestCall,
      presentLocalOutgoingCall,
      acceptCall,
      rejectCall,
      endCall,
      notifyCardVisible,
    ],
  );

  return (
    <GuestCallContext.Provider value={value}>
      {children}
      <CallAudioBridge />
    </GuestCallContext.Provider>
  );
}

export function useGuestCall(): GuestCallContextValue {
  const ctx = useContext(GuestCallContext);
  if (!ctx) {
    throw new Error("useGuestCall must be used within GuestCallProvider");
  }
  return ctx;
}

export function useGuestCallOptional(): GuestCallContextValue | null {
  return useContext(GuestCallContext);
}
