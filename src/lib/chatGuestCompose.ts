/** CHAT compose recipient rules: pending (FIFO) + approved only — not full guest management. */

export type ChatComposeGuestStatus = "PENDING" | "APPROVED" | "REJECTED" | "ARRIVED";

export type ChatComposeGuest = {
  id: string;
  name: string;
  status: ChatComposeGuestStatus;
  expectation?: "expected" | "unexpected";
  created_at?: string;
};

function isPendingChatStatus(status: ChatComposeGuestStatus): boolean {
  return status === "PENDING" || status === "ARRIVED";
}

function createdAtMs(value: string | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** Guests selectable in member CHAT compose (not Guest Management). */
export function filterChatComposeGuests<T extends ChatComposeGuest>(rows: T[]): T[] {
  return rows
    .filter(
      (g) =>
        g.status === "PENDING" ||
        g.status === "ARRIVED" ||
        g.status === "APPROVED",
    )
    .sort((a, b) => {
      const aPending = isPendingChatStatus(a.status);
      const bPending = isPendingChatStatus(b.status);
      if (aPending !== bPending) return aPending ? -1 : 1;
      if (aPending && bPending) {
        const byTime = createdAtMs(a.created_at) - createdAtMs(b.created_at);
        if (byTime !== 0) return byTime;
        return a.id.localeCompare(b.id);
      }
      return a.name.localeCompare(b.name);
    });
}

/** Prefer oldest pending guest; else first approved. */
export function defaultChatComposeGuestId(guests: ChatComposeGuest[]): string {
  const pending = guests.filter((g) => isPendingChatStatus(g.status));
  const pick = pending[0] ?? guests[0];
  return pick?.id ?? "";
}

export function isAdminGuestPeer(peer: {
  role?: string;
  can_receive_chat?: boolean;
}): boolean {
  const role = String(peer.role ?? "").trim().toLowerCase();
  if (!role) return true;
  return role.includes("admin");
}
