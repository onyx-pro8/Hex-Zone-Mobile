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

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Show a floating toast notification (preferred over Alert for user messages). */
export function showToast(message: string, options: ToastOptions = {}): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  const toast: ToastItem = {
    id: `toast-${Date.now()}-${++seq}`,
    message: trimmed,
    title: options.title?.trim() || undefined,
    type: options.type ?? "info",
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
