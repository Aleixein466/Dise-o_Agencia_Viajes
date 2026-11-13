import { expect, test } from "@playwright/test";

test("skip link is first focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
});

test("mobile menu toggles with Enter and Escape", async ({ page }, info) => {
  test.skip((page.viewportSize()?.width ?? 0) > 400, "mobile width only");
  void info;
  await page.goto("/");
  const toggle = page.locator("button.menu-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
