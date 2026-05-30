import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import { clearToken, getToken } from "@/lib/storage";

type ExtraConfig = { apiBaseUrl?: string };

const expoConfigExtra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export const API_BASE_URL =
  expoConfigExtra.apiBaseUrl ||
  "https://zone-weaver-wwws2.ondigitalocean.app";

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
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearToken();
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
    return { data: null, error: toErrorMessage(error), loading: false };
  }
}
