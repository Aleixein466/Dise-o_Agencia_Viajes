import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/destinos", "/destinos/cartagena", "/cotizar"]) {
  test(`a11y ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const bad = results.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) }));
    expect(bad).toEqual([]);
  });
}
