import { defineConfig, devices } from "@playwright/test";

/**
 * Cookie-authenticated tests deliberately run in one browser against an explicitly supplied local URL.
 * This avoids starting a test server with a production-like API URL and keeps them out of public previews.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "auth-admin.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.AUTH_E2E_BASE_URL ?? "http://127.0.0.1:3101",
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
