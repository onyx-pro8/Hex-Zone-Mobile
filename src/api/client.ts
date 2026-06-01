import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import { clearToken, getToken } from "@/lib/storage";
import { emitUnauthorized } from "@/lib/authEvents";

type ExtraConfig = { apiBaseUrl?: string };

const expoConfigExtra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export const API_BASE_URL =
  expoConfigExtra.apiBaseUrl ||
  "https://zone-weaver-server-7ksef.ondigitalocean.app/";

const LOG_PREFIX = "[ZoneWeaver/api]";

if (__DEV__) {
  console.log(`${LOG_PREFIX} API_BASE_URL =`, API_BASE_URL);
}

function safePreviewBody(body: unknown): unknown {
  if (body == null) return undefined;
  try {
    const json = typeof body === "string" ? body : JSON.stringify(body);
    if (!json) return undefined;
    return json.length > 600 ? `${json.slice(0, 600)}…(${json.length} chars)` : json;
  } catch {
    return "<unserializable>";
  }
}

export type ApiEnvelope<T> = {
  status: "success" | "error";
  data: T;
  error?: { message?: string } | null;
  message?: string;
};

export type ApiResult<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  unauthorized?: boolean;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

type TimedConfig = AxiosRequestConfig & { metadata?: { startedAt: number } };

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (__DEV__) {
    (config as TimedConfig).metadata = { startedAt: Date.now() };
    const method = String(config.method ?? "GET").toUpperCase();
    const fullUrl = `${config.baseURL ?? ""}${config.url ?? ""}`;
    console.log(`${LOG_PREFIX} → ${method} ${fullUrl}`, {
      params: config.params,
      hasAuth: Boolean(config.headers?.Authorization),
      body: safePreviewBody(config.data),
    });
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      const cfg = response.config as TimedConfig;
      const ms = cfg.metadata ? Date.now() - cfg.metadata.startedAt : -1;
      const method = String(response.config.method ?? "GET").toUpperCase();
      const fullUrl = `${response.config.baseURL ?? ""}${response.config.url ?? ""}`;
      console.log(
        `${LOG_PREFIX} ← ${response.status} ${method} ${fullUrl} (${ms}ms)`,
        { body: safePreviewBody(response.data) },
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    if (__DEV__) {
      const cfg = (error.config ?? {}) as TimedConfig;
      const ms = cfg.metadata ? Date.now() - cfg.metadata.startedAt : -1;
      const method = String(cfg.method ?? "GET").toUpperCase();
      const fullUrl = `${cfg.baseURL ?? ""}${cfg.url ?? ""}`;
      const status = error.response?.status ?? "no-response";
      console.warn(
        `${LOG_PREFIX} ✕ ${status} ${method} ${fullUrl} (${ms}ms)`,
        {
          message: error.message,
          code: error.code,
          response: safePreviewBody(error.response?.data),
        },
      );
    }
    if (error.response?.status === 401) {
      await clearToken();
      emitUnauthorized();
    }
    return Promise.reject(error);
  },
);

function normalizeApiData<T>(raw: unknown): T {
  if (
    raw &&
    typeof raw === "object" &&
    "status" in raw &&
    "data" in raw &&
    (raw as Record<string, unknown>).status === "success"
  ) {
    return (raw as ApiEnvelope<T>).data;
  }
  return raw as T;
}

function normalizeEnvelopeError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || !("status" in raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.status !== "error") return null;
  const topMsg = typeof row.message === "string" ? row.message.trim() : "";
  const nested =
    row.error && typeof row.error === "object" && row.error !== null
      ? String((row.error as { message?: string }).message ?? "").trim()
      : "";
  return topMsg || nested || "Request failed";
}

function toErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const envelopeError = normalizeEnvelopeError(error.response?.data);
    if (envelopeError) {
      if (status === 401) return `${envelopeError} Please sign in again.`;
      return envelopeError;
    }
    const message =
      (error.response?.data as { message?: string } | undefined)?.message ||
      error.message;
    const base = message || "Request failed";
    if (status === 401) return `${base} Please sign in again.`;
    return base;
  }
  if (error instanceof Error) return error.message;
  return "Request failed";
}

export async function request<T>(
  config: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const response = await apiClient.request(config);
    return {
      data: normalizeApiData<T>(response.data),
      error: null,
      loading: false,
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    return {
      data: null,
      error: toErrorMessage(error),
      loading: false,
      ...(status === 401 ? { unauthorized: true } : {}),
    };
  }
}
