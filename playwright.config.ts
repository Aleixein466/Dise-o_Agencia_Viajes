import { defineConfig, devices, type PlaywrightTestProject } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const sizes = [
  { name: "375", width: 375, height: 812, dark: true },
  { name: "768", width: 768, height: 1024, dark: false },
  { name: "1280", width: 1280, height: 800, dark: false },
  { name: "1440", width: 1440, height: 900, dark: true },
];

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: sizes.flatMap((s) => {
    const base = { ...devices["Desktop Chrome"], viewport: { width: s.width, height: s.height } };
    const list: PlaywrightTestProject[] = [{ name: `chromium-${s.name}`, use: base }];
    if (s.dark) list.push({ name: `chromium-${s.name}-dark`, use: { ...base, colorScheme: "dark" as const } });
    return list;
  }),
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
