import { expect, test } from "@playwright/test";

const paths = ["/", "/destinos", "/destinos/cartagena", "/cotizar", "/contacto", "/pqrs", "/privacidad", "/terminos"];

for (const path of paths) {
  test(`smoke ${path}`, async ({ page }) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      // Failed requests are judged by URL below; the console line itself carries no URL.
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    // This smoke run serves the web without the API (CI has no database), so only /api/ calls may fail;
    // a broken script, style, image or page is still an error.
    page.on("response", (r) => {
      if (r.status() >= 400 && !new URL(r.url()).pathname.startsWith("/api/")) failed.push(`${r.status()} ${r.url()}`);
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator("html").getAttribute("lang")).toMatch(/^es/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });
}
