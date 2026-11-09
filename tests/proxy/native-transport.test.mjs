import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import {
  createNativeAdapter,
  resolveApiBase
} from "../../src/lib/native-transport.ts";

await test("Android uses the HTTPS frontend proxy and web keeps the same-origin API", () => {
  assert.equal(resolveApiBase(false), "/api");
  assert.equal(
    resolveApiBase(true),
    "https://platform-tech-taskmanager.vercel.app/api"
  );
  for (const value of [
    "http://localhost/api",
    "https://example.com/",
    "https://user:secret@example.com/api",
    "https://example.com/api?token=secret"
  ])
    assert.throws(() => resolveApiBase(true, undefined, value));
});

await test("native transport preserves filters, credentials and trusted Origin without exposing refresh-cookie headers", async () => {
  let sent;
  const client = axios.create({
    baseURL: "https://example.com/api",
    adapter: createNativeAdapter("https://example.com/api", async options => {
      sent = options;
      return {
        status: 200,
        data: { tasks: [] },
        headers: {
          "Set-Cookie": "tm_refresh=private; HttpOnly",
          "Content-Type": "application/json"
        },
        url: options.url
      };
    })
  });
  const result = await client.get("/tasks", {
    params: { today: "2026-11-09", page: 2 },
    headers: { Authorization: "Bearer access" }
  });
  assert.equal(sent.headers.Origin, "https://example.com");
  assert.equal(sent.headers.Authorization, "Bearer access");
  assert.equal(new URL(sent.url).searchParams.get("page"), "2");
  assert.equal(result.headers.has("set-cookie"), false);
});

await test("native transport rejects failed HTTP responses so refresh and logout error handling remain effective", async () => {
  const client = axios.create({
    baseURL: "https://example.com/api",
    adapter: createNativeAdapter("https://example.com/api", async options => ({
      status: 401,
      data: { error: { code: "TOKEN_EXPIRED" } },
      headers: {},
      url: options.url
    }))
  });
  await assert.rejects(
    client.get("/tasks"),
    error =>
      error.response?.status === 401 &&
      error.response.data.error.code === "TOKEN_EXPIRED"
  );
  await assert.rejects(
    client.get("https://attacker.example/api/tasks"),
    error => error.code === "ERR_BAD_REQUEST"
  );
});
