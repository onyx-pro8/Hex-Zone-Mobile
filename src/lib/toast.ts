export type ToastType = "info" | "success" | "warning" | "error";

export type ToastOptions = {
  title?: string;
  type?: ToastType;
  /** Milliseconds before auto-dismiss. Default 3200. */
  duration?: number;
};

export type ToastItem = {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  duration: number;
};

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** Suppress identical toasts fired back-to-back (e.g. setError + toast.warning). */
const DEDUPE_MS = 1200;
let lastFingerprint = "";
let lastShownAt = 0;

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function fingerprint(message: string, type: ToastType, title?: string): string {
  return `${type}|${title ?? ""}|${message}`;
}

/** Show a floating toast notification (preferred over Alert for user messages). */
export function showToast(message: string, options: ToastOptions = {}): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  const type = options.type ?? "info";
  const title = options.title?.trim() || undefined;
  const key = fingerprint(trimmed, type, title);
  const now = Date.now();
  // Also suppress same message with a different type within the window
  // (e.g. warning + error both saying "Enter a communal ID first.").
  const sameMessageRecently =
    now - lastShownAt < DEDUPE_MS &&
    (lastFingerprint === key ||
      lastFingerprint.endsWith(`|${trimmed}`) ||
      key.endsWith(`|${trimmed}`));
  if (sameMessageRecently) return;
  lastFingerprint = key;
  lastShownAt = now;

  const toast: ToastItem = {
    id: `toast-${now}-${++seq}`,
    message: trimmed,
    title,
    type,
    duration: options.duration ?? 3200,
  };
  listeners.forEach((listener) => listener(toast));
}

export const toast = {
  info: (message: string, options?: Omit<ToastOptions, "type">) =>
    showToast(message, { ...options, type: "info" }),
  success: (message: string, options?: Omit<ToastOptions, "type">) =>
    showToast(message, { ...options, type: "success" }),
  warning: (message: string, options?: Omit<ToastOptions, "type">) =>
    showToast(message, { ...options, type: "warning" }),
  error: (message: string, options?: Omit<ToastOptions, "type">) =>
    showToast(message, { ...options, type: "error" }),
};
