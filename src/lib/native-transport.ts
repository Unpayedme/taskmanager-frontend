import {
  Capacitor,
  CapacitorHttp,
  type HttpOptions,
  type HttpResponse
} from "@capacitor/core";
import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter
} from "axios";

export const isAndroid =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export function resolveApiBase(
  native: boolean,
  webBase?: string,
  nativeBase?: string
) {
  if (!native) return webBase || "/api";
  const url = new URL(
    nativeBase || "https://platform-tech-taskmanager.vercel.app/api"
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/api"
  ) {
    throw new Error(
      "The Android API URL must be the HTTPS frontend origin followed by /api."
    );
  }
  return `${url.origin}/api`;
}

// Native HTTP uses Android's persistent cookie manager, including HttpOnly cookies.
// Web requests retain Axios' normal browser transport and same-origin CSRF checks.
export function createNativeAdapter(
  apiBase: string,
  request: (options: HttpOptions) => Promise<HttpResponse> = options =>
    CapacitorHttp.request(options)
): AxiosAdapter {
  const origin = new URL(apiBase).origin;
  return async config => {
    const url = new URL(axios.getUri(config));
    if (url.origin !== origin || !url.pathname.startsWith("/api/"))
      throw new AxiosError(
        "Untrusted API destination",
        "ERR_BAD_REQUEST",
        config
      );
    if (config.signal?.aborted) throw new CanceledError();
    const headers = Object.fromEntries(
      Object.entries(config.headers.toJSON())
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, String(value)])
    );
    headers.Origin = origin;
    const result = await request({
      url: url.href,
      method: (config.method || "GET").toUpperCase(),
      headers,
      data: config.data,
      connectTimeout: config.timeout || 30000,
      readTimeout: config.timeout || 30000,
      responseType: "json",
      disableRedirects: true
    });
    if (config.signal?.aborted) throw new CanceledError();
    const response = {
      data: result.data,
      status: result.status,
      statusText: String(result.status),
      config,
      headers: new AxiosHeaders(
        Object.fromEntries(
          Object.entries(result.headers).filter(
            ([key]) =>
              !["set-cookie", "set-cookie2"].includes(key.toLowerCase())
          )
        )
      )
    };
    if (config.validateStatus && !config.validateStatus(result.status))
      throw new AxiosError(
        "API request failed",
        result.status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
        config,
        undefined,
        response
      );
    return response;
  };
}
