import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  use: {
    ignoreHTTPSErrors:
      process.env.E2E_LOCAL_TLS === "1" &&
      /^https:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(
        process.env.E2E_BASE_URL || ""
      ),
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
