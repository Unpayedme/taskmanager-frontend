import axios, { type InternalAxiosRequestConfig } from "axios";
import { reactive } from "vue";
import type { User } from "../types";
import { clearTaskCaches } from "./cache";

export const apiBase = import.meta.env.QCLI_API_BASE_URL || "/api";
export const authState = reactive({
  user: null as User | null,
  ready: false,
  error: "",
  googleEnabled: false
});
const authClient = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  timeout: 15000
});
export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  timeout: 15000
});
let accessToken = "";
let generation = 0;
let refreshing: Promise<void> | null = null;
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("taskmanager-session")
    : null;

function clearSession(broadcast = false) {
  generation++;
  accessToken = "";
  authState.user = null;
  clearTaskCaches();
  if (broadcast) channel?.postMessage({ type: "logout" });
}
channel?.addEventListener("message", (event: MessageEvent) => {
  if (event.data?.type === "logout") clearSession();
});

function acceptSession(data: { user: User; accessToken: string }) {
  if (authState.user?.id && authState.user.id !== data.user.id)
    clearTaskCaches();
  accessToken = data.accessToken;
  authState.user = data.user;
  authState.error = "";
}

async function sessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request("taskmanager-refresh", action);
  return action();
}

export function refreshSession(): Promise<void> {
  if (!refreshing) {
    const startedAt = generation;
    refreshing = sessionLock(async () => {
      if (startedAt !== generation) throw new Error("Session changed");
      const { data } = await authClient.post<{
        user: User;
        accessToken: string;
      }>("/auth/refresh");
      if (startedAt !== generation) throw new Error("Session changed");
      acceptSession(data);
    })
      .catch((error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401)
          clearSession();
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type RetryConfig = InternalAxiosRequestConfig & {
  refreshed?: boolean;
  sessionGeneration?: number;
};
api.interceptors.request.use((config: RetryConfig) => {
  config.sessionGeneration ??= generation;
  if (accessToken) config.headers.set("Authorization", `Bearer ${accessToken}`);
  return config;
});
api.interceptors.response.use(
  response => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    const config = error.config as RetryConfig | undefined;
    if (config?.sessionGeneration !== generation) throw error;
    if (
      error.response?.status === 401 &&
      error.response.data?.error?.code === "TOKEN_EXPIRED" &&
      config &&
      !config.refreshed
    ) {
      config.refreshed = true;
      await refreshSession();
      config.headers.set("Authorization", `Bearer ${accessToken}`);
      return api(config);
    }
    if (
      error.response?.status === 401 &&
      error.response.data?.error?.code === "SESSION_REVOKED"
    )
      clearSession(true);
    throw error;
  }
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.error?.details?.[0];
    if (detail?.message) return detail.message;
    if (error.response?.data?.error?.message)
      return error.response.data.error.message;
    if (!error.response)
      return "Could not reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export async function bootstrapSession() {
  authState.ready = false;
  try {
    await refreshSession();
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401)
      authState.error = errorMessage(error);
  } finally {
    authState.ready = true;
  }
  try {
    authState.googleEnabled = (
      await authClient.get<{ googleEnabled: boolean }>("/auth/config")
    ).data.googleEnabled;
  } catch {
    authState.googleEnabled = false;
  }
}

export async function signIn(
  mode: "login" | "register",
  input: { name?: string; email: string; password: string }
) {
  generation++;
  const startedAt = generation;
  const { data } = await sessionLock(() =>
    authClient.post<{ user: User; accessToken: string }>(`/auth/${mode}`, input)
  );
  if (startedAt !== generation) return;
  clearTaskCaches();
  acceptSession(data);
  channel?.postMessage({ type: "logout" });
}

export async function signOut() {
  await sessionLock(() => authClient.post("/auth/logout"));
  clearSession(true);
}
