import { expect, test } from "@playwright/test";

const paths = ["/", "/destinos", "/destinos/cartagena", "/cotizar", "/contacto", "/pqrs", "/privacidad", "/terminos"];

for (const path of paths) {
  test(`smoke ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator("html").getAttribute("lang")).toMatch(/^es/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
