import { useCallback, useEffect, useState } from "react";
import { getMembers } from "@/api/members";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  parseGuestPresenceSocketEvent,
  parseMemberPresenceSocketEvent,
} from "@/lib/messageSocket";

export type MemberPresenceMap = Record<number, boolean>;
export type GuestPresenceMap = Record<string, boolean>;

/**
 * Live owner online/offline map seeded from /members and updated by
 * MEMBER_PRESENCE WebSocket frames. Guest senders use GUEST_PRESENCE.
 */
export function useMemberPresence(): {
  presence: MemberPresenceMap;
  isOnline: (ownerId: number | null | undefined) => boolean;
  isGuestOnline: (guestId: string | null | undefined) => boolean;
  seedGuestPresence: (guestId: string, online: boolean) => void;
} {
  const { token } = useAuth();
  const [presence, setPresence] = useState<MemberPresenceMap>({});
  const [guestPresence, setGuestPresence] = useState<GuestPresenceMap>({});
  const { lastMessage } = useWebSocket({
    token,
    zoneIds: [],
    enabled: Boolean(token),
  });

  useEffect(() => {
    let active = true;
    void getMembers().then((res) => {
      if (!active || res.error) return;
      const next: MemberPresenceMap = {};
      for (const row of res.data ?? []) {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        next[id] = row.online === true;
      }
      setPresence(next);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    const memberEvt = parseMemberPresenceSocketEvent(lastMessage);
    if (memberEvt) {
      setPresence((prev) => {
        if (prev[memberEvt.ownerId] === memberEvt.online) return prev;
        return { ...prev, [memberEvt.ownerId]: memberEvt.online };
      });
      return;
    }
    const guestEvt = parseGuestPresenceSocketEvent(lastMessage);
    if (guestEvt) {
      setGuestPresence((prev) => {
        if (prev[guestEvt.guestId] === guestEvt.online) return prev;
        return { ...prev, [guestEvt.guestId]: guestEvt.online };
      });
      return;
    }
    try {
      const parsed = JSON.parse(lastMessage) as { type?: string; data?: Record<string, unknown> };
      if (parsed.type === "NEW_MESSAGE" && parsed.data) {
        const senderGuest =
          typeof parsed.data.guest_sender_id === "string"
            ? parsed.data.guest_sender_id.trim()
            : "";
        const senderId = parsed.data.sender_id;
        const guestId =
          senderGuest ||
          ((senderId == null || senderId === 0) && typeof parsed.data.guest_id === "string"
            ? parsed.data.guest_id.trim()
            : "");
        const flaggedOnline = parsed.data.guest_online === true;
        if (guestId && (flaggedOnline || senderGuest || senderId == null || senderId === 0)) {
          setGuestPresence((prev) =>
            prev[guestId] === true ? prev : { ...prev, [guestId]: true },
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, [lastMessage]);

  const isOnline = useCallback(
    (ownerId: number | null | undefined) => {
      if (ownerId == null || !Number.isFinite(ownerId) || ownerId <= 0) {
        return false;
      }
      return presence[ownerId] === true;
    },
    [presence],
  );

  const isGuestOnline = useCallback(
    (guestId: string | null | undefined) => {
      const gid = (guestId ?? "").trim();
      if (!gid) return false;
      return guestPresence[gid] === true;
    },
    [guestPresence],
  );

  const seedGuestPresence = useCallback((guestId: string, online: boolean) => {
    const gid = guestId.trim();
    if (!gid) return;
    setGuestPresence((prev) => {
      if (prev[gid] === online) return prev;
      return { ...prev, [gid]: online };
    });
  }, []);

  return { presence, isOnline, isGuestOnline, seedGuestPresence };
}
