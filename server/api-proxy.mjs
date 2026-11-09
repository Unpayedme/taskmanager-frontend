import { isIP } from "node:net";

export function deploymentConfig(source = process.env, allowLocalHttp = false) {
  const url = new URL(
    source.RAILWAY_API_URL || "https://not-configured.invalid"
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !source.RAILWAY_API_URL ||
    (url.protocol !== "https:" &&
      !(allowLocalHttp && local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "RAILWAY_API_URL must be an HTTPS origin without credentials, paths, queries or fragments."
    );
  if (
    !source.API_PROXY_SECRET ||
    source.API_PROXY_SECRET.length < 32 ||
    /replace|change.?me|placeholder|example/i.test(source.API_PROXY_SECRET)
  )
    throw new Error(
      "Set API_PROXY_SECRET to the same random secret configured on Railway (at least 32 characters)."
    );
  if (source.QCLI_API_BASE_URL && source.QCLI_API_BASE_URL !== "/api")
    throw new Error(
      "Keep QCLI_API_BASE_URL=/api so authentication uses the Vercel proxy."
    );
  return { origin: url.origin, secret: source.API_PROXY_SECRET };
}

const failure = (status, code, message) =>
  Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store"
      }
    }
  );

export function createApiProxy(config, fetchUpstream = fetch) {
  return async request => {
    const incoming = new URL(request.url);
    const route =
      incoming.pathname === "/api/proxy"
        ? incoming.searchParams.get("__path")
        : incoming.pathname.replace(/^\/api\//, "");
    if (
      !incoming.pathname.startsWith("/api/") ||
      !route ||
      !/^[a-zA-Z0-9/_-]+$/.test(route)
    )
      return failure(400, "INVALID_API_PATH", "Invalid API path.");
    if (
      !["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"].includes(
        request.method
      )
    )
      return failure(405, "METHOD_NOT_ALLOWED", "Method not allowed.");

    // Vercel overwrites this platform header. Never accept the browser's custom proxy headers.
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      ""
    )
      .split(",")[0]
      .trim();
    if (!isIP(ip))
      return failure(
        400,
        "INVALID_CLIENT_IP",
        "Client address is unavailable."
      );
    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "authorization",
      "cookie",
      "origin",
      "user-agent"
    ])
      if (request.headers.has(name))
        headers.set(name, request.headers.get(name));
    headers.set("x-taskmanager-proxy-secret", config.secret);
    headers.set("x-taskmanager-client-ip", ip);
    incoming.searchParams.delete("__path");
    const target = new URL(`/api/${route}`, config.origin);
    target.search = incoming.search;

    try {
      const body = ["GET", "HEAD"].includes(request.method)
        ? undefined
        : new Uint8Array(await request.arrayBuffer());
      if (body && body.byteLength > 32768)
        return failure(413, "INVALID_BODY", "Request body is too large.");
      const upstream = await fetchUpstream(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)])
      });
      const outgoing = new Headers();
      for (const [name, value] of upstream.headers) {
        if (
          ![
            "set-cookie",
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
            "keep-alive",
            "upgrade"
          ].includes(name)
        )
          outgoing.set(name, value);
      }
      for (const cookie of upstream.headers.getSetCookie())
        outgoing.append("set-cookie", cookie);
      for (const name of [
        "Cache-Control",
        "CDN-Cache-Control",
        "Vercel-CDN-Cache-Control"
      ])
        outgoing.set(name, "no-store");
      return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers: outgoing
      });
    } catch (error) {
      return error?.name === "TimeoutError" || error?.name === "AbortError"
        ? failure(
            504,
            "API_TIMEOUT",
            "The server took too long. Please try again."
          )
        : failure(
            502,
            "API_UNAVAILABLE",
            "The server is unavailable. Please try again."
          );
    }
  };
}

export async function proxyRequest(request) {
  try {
    return await createApiProxy(deploymentConfig())(request);
  } catch {
    return failure(
      503,
      "DEPLOYMENT_NOT_CONFIGURED",
      "The application API is not configured."
    );
  }
}
