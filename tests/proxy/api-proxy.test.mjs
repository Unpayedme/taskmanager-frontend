import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiProxy, deploymentConfig } from "../../server/api-proxy.mjs";

const config = {
  origin: "https://api.example.com",
  secret: "a-secure-proxy-key-with-at-least-32-characters"
};
const incoming = (path = "/api/proxy?__path=tasks", options = {}) =>
  new Request(`https://tasks.example.com${path}`, {
    ...options,
    headers: { "x-vercel-forwarded-for": "203.0.113.42", ...options.headers }
  });

await test("deployment validation keeps secrets server-side and requires an HTTPS backend origin", () => {
  const valid = {
    BACKEND_API_URL: config.origin,
    API_PROXY_SECRET: config.secret
  };
  assert.equal(deploymentConfig(valid).origin, config.origin);
  assert.equal(
    deploymentConfig({
      RAILWAY_API_URL: config.origin,
      API_PROXY_SECRET: config.secret
    }).origin,
    config.origin
  );
  assert.equal(
    deploymentConfig({
      ...valid,
      RAILWAY_API_URL: "https://old-api.example.com"
    }).origin,
    config.origin
  );
  for (const change of [
    { BACKEND_API_URL: "http://api.example.com" },
    { BACKEND_API_URL: "https://user:password@api.example.com" },
    { BACKEND_API_URL: "https://api.example.com/path" },
    { API_PROXY_SECRET: "replace-with-a-placeholder-secret-123456" },
    { QCLI_API_BASE_URL: config.origin }
  ])
    assert.throws(() => deploymentConfig({ ...valid, ...change }));
});

await test("the proxy preserves task queries, original Origin, authentication and JSON bodies", async () => {
  let captured;
  const proxy = createApiProxy(config, async (url, options) => {
    assert(url instanceof URL);
    captured = { url: url.href, ...options };
    return Response.json({ task: { title: "Saved" } }, { status: 201 });
  });
  const response = await proxy(
    incoming("/api/proxy?__path=tasks&search=hello%20world", {
      method: "POST",
      headers: {
        origin: "https://tasks.example.com",
        authorization: "Bearer token",
        cookie: "tm_refresh=cookie",
        "content-type": "application/json",
        "x-taskmanager-client-ip": "1.2.3.4",
        "x-taskmanager-proxy-secret": "forged"
      },
      body: JSON.stringify({ title: "Saved" })
    })
  );
  assert.equal(response.status, 201);
  assert.equal(
    captured.url,
    "https://api.example.com/api/tasks?search=hello+world"
  );
  assert.equal(captured.headers.get("origin"), "https://tasks.example.com");
  assert.equal(captured.headers.get("authorization"), "Bearer token");
  assert.equal(captured.headers.get("cookie"), "tm_refresh=cookie");
  assert.equal(captured.headers.get("x-taskmanager-client-ip"), "203.0.113.42");
  assert.equal(
    captured.headers.get("x-taskmanager-proxy-secret"),
    config.secret
  );
  assert.deepEqual(JSON.parse(Buffer.from(captured.body).toString()), {
    title: "Saved"
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

await test("Google redirects and multiple Set-Cookie headers are returned to the browser without being followed", async () => {
  const cookies = [
    "tm_oauth=state; Path=/api/auth/google; Secure; HttpOnly; SameSite=Lax",
    "tm_refresh=token; Path=/api/auth; Secure; HttpOnly; SameSite=Lax"
  ];
  const proxy = createApiProxy(config, async (_url, options) => {
    assert.equal(options.redirect, "manual");
    const headers = new Headers({
      location: "https://accounts.google.com/authorize",
      "content-encoding": "gzip",
      "content-length": "500"
    });
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers });
  });
  const response = await proxy(incoming("/api/proxy?__path=auth/google"));
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://accounts.google.com/authorize"
  );
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.equal(response.headers.has("content-encoding"), false);
  assert.equal(response.headers.has("content-length"), false);
});

await test("the proxy does not invent an Origin header for requests that lack one", async () => {
  const proxy = createApiProxy(config, async (_url, options) => {
    assert.equal(options.headers.has("origin"), false);
    return new Response(null, { status: 204 });
  });
  assert.equal(
    (await proxy(incoming("/api/auth/logout", { method: "POST" }))).status,
    204
  );
});

await test("invalid paths, oversized writes, unsupported methods and missing client IPs never reach the backend", async () => {
  const proxy = createApiProxy(config, () => {
    throw new Error("Unexpected network call");
  });
  assert.equal(
    (await proxy(incoming("/api/proxy?__path=../admin"))).status,
    400
  );
  assert.equal(
    (await proxy(incoming("/api/proxy?__path=https://attacker.example")))
      .status,
    400
  );
  assert.equal(
    (await proxy(incoming(undefined, { method: "PUT" }))).status,
    405
  );
  assert.equal(
    (
      await proxy(
        incoming(undefined, { method: "POST", body: "x".repeat(32769) })
      )
    ).status,
    413
  );
  assert.equal(
    (await proxy(new Request("https://tasks.example.com/api/tasks"))).status,
    400
  );
});

await test("upstream failures produce useful errors without leaking the backend URL or secrets", async () => {
  const proxy = createApiProxy(config, async () => {
    throw new Error(config.secret);
  });
  const response = await proxy(incoming());
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes(config.secret), false);
  const timeout = createApiProxy(config, async () => {
    throw new DOMException("Timeout", "TimeoutError");
  });
  assert.equal((await timeout(incoming())).status, 504);
});
