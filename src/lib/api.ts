import axios, { type InternalAxiosRequestConfig } from "axios";
import { reactive } from "vue";
import type { User } from "../types";
import { clearTaskCaches } from "./cache";
import {
  createNativeAdapter,
  isAndroid,
  resolveApiBase
} from "./native-transport";

export const apiBase = resolveApiBase(
  isAndroid,
  import.meta.env.QCLI_API_BASE_URL,
  import.meta.env.QCLI_NATIVE_API_BASE_URL
);
export const authState = reactive({
  user: null as User | null,
  ready: false,
  error: "",
  googleEnabled: false,
  googleClientId: ""
});
const authClient = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  timeout: 15000,
  ...(isAndroid
    ? { adapter: createNativeAdapter(apiBase), timeout: 30000 }
    : {})
});
export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  timeout: 15000,
  ...(isAndroid
    ? { adapter: createNativeAdapter(apiBase), timeout: 30000 }
    : {})
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
        if (
          startedAt === generation &&
          axios.isAxiosError(error) &&
          error.response?.status === 401
        )
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
      if (config.sessionGeneration !== generation) throw error;
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
    await loadGoogleConfig();
  } catch {
    authState.googleEnabled = false;
  }
}

async function loadGoogleConfig() {
  const { data } = await authClient.get<{
    googleEnabled: boolean;
    googleClientId?: string;
  }>("/auth/config");
  authState.googleEnabled = data.googleEnabled;
  authState.googleClientId = data.googleClientId || "";
}

export async function signInWithGoogle() {
  if (!isAndroid) {
    window.location.assign(`${apiBase}/auth/google`);
    return;
  }
  if (!authState.googleClientId) await loadGoogleConfig();
  if (!authState.googleEnabled || !authState.googleClientId)
    throw new Error(
      "Google sign-in is not configured on the server. Please retry after it is configured."
    );
  const startedAt = ++generation;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: {
      webClientId: authState.googleClientId,
      mode: "online",
      skipAuthOnlyAuthorizationAfterSignIn: true
    }
  });
  const { data: challenge } = await authClient.post<{
    challengeId: string;
    nonce: string;
  }>("/auth/google/native/challenge");
  let identity;
  try {
    identity = await SocialLogin.login({
      provider: "google",
      options: { nonce: challenge.nonce }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|dismiss|\b12501\b/i.test(message)) return;
    throw new Error(
      "Google sign-in could not be completed. Check the Android OAuth client and signing certificate, then try again."
    );
  }
  if (startedAt !== generation) return;
  if (identity.result.responseType !== "online" || !identity.result.idToken)
    throw new Error(
      "Google did not return an identity token. Please try again."
    );
  const idToken = identity.result.idToken;
  const { data } = await sessionLock(() =>
    authClient.post<{ user: User; accessToken: string }>(
      "/auth/google/native",
      { challengeId: challenge.challengeId, idToken }
    )
  );
  if (startedAt !== generation) return;
  clearTaskCaches();
  acceptSession(data);
  channel?.postMessage({ type: "logout" });
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
  if (isAndroid) {
    try {
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.logout({ provider: "google" });
    } catch {
      /* The application session is already revoked; provider UI cleanup is best effort. */
    }
  }
}
