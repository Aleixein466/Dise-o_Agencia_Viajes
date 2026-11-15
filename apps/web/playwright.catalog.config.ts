import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: [
    "catalog-cartagena.spec.ts",
    "public-admin-commercial-rules.spec.ts",
    "public-audit-log.spec.ts",
    "public-transport-options.spec.ts",
    "public-builder.spec.ts",
    "public-crm.spec.ts",
    "public-portal.spec.ts",
    "public-pricing-rules.spec.ts",
    "public-pqrs-portal.spec.ts",
    "public-pqrs.spec.ts",
    "public-savings-finance.spec.ts",
    "zz-responsive-sweep.spec.ts",
  ],
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.CARTAGENA_E2E_BASE_URL ?? "http://127.0.0.1:3201",
    ...devices["Desktop Chrome"],
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
