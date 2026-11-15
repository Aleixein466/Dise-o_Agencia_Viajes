import { mkdirSync } from "node:fs";

import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath, stateDir } from "./e2e-state";

// Milestone 6 sweep: every main screen at phone, tablet and desktop widths must not scroll horizontally, must pass
// WCAG 2.2 AA automated checks and must not log console errors. Screenshots go to %TEMP% for manual review.
const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 900 },
];
const shots = join(stateDir, "sweep");
mkdirSync(shots, { recursive: true });

async function firstDestination(page: Page): Promise<string> {
  await page.goto("/destinos");
  const href = await page.locator('a[href^="/destinos/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

async function check(page: Page, path: string, label: string) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const response = await page.goto(path);
    expect(response?.status(), `${label} ${vp.name} status`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first(), `${label} ${vp.name} h1`).toBeVisible();
    // Deepest elements sticking out of the viewport, so a failure names its culprit.
    const offenders = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth + 1;
      return [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > limit)
        .filter((el) => ![...el.children].some((child) => child.getBoundingClientRect().right > limit))
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
        );
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect.soft(overflow, `${label} ${vp.name} horizontal overflow: ${offenders.join(" | ")}`).toBeLessThanOrEqual(0);
    const broken = await page.evaluate(() =>
      [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc),
    );
    expect.soft(broken, `${label} ${vp.name} broken images`).toEqual([]);
    await page.screenshot({ path: join(shots, `${label}-${vp.name}.png`), fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect.soft(axe.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  page.off("console", onConsole);
  // 401/403 probes for anonymous session checks are expected network noise, not app errors.
  expect
    .soft(
      errors.filter((e) => !/40[13]/.test(e)),
      `${label} console errors`,
    )
    .toEqual([]);
}

test("public screens are responsive and accessible", async ({ page }) => {
  test.setTimeout(240_000);
  const detail = await firstDestination(page);
  for (const [path, label] of [
    ["/", "inicio"],
    ["/destinos", "destinos"],
    [detail, "detalle"],
    ["/cotizar", "constructor"],
    ["/seguimiento", "seguimiento"],
    ["/mi-cuenta", "acceso-clientes"],
    ["/pqrs", "pqrs"],
    ["/contacto", "contacto"],
    ["/ingresar", "ingresar"],
  ] as const)
    await check(page, path, label);
});

test("admin dashboard shows role-scoped indicators", async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: adminStatePath });
  const admin = await adminContext.newPage();
  await admin.goto("/admin");
  for (const title of ["Solicitudes abiertas", "Reservas en curso", "Abonos por aprobar", "PQRS abiertas"])
    await expect(admin.getByRole("heading", { name: title })).toBeVisible();
  await expect(admin.getByText("Sin datos todavía")).toHaveCount(0);
  await admin.getByRole("link", { name: "Abrir pqrs abiertas" }).click();
  await expect(admin).toHaveURL(/\/admin\/pqrs$/);
  await adminContext.close();

  // FINANCE has no pqrs:read: the API omits that block and the page shows no PQRS card.
  const financeContext = await browser.newContext({ storageState: financeStatePath });
  const finance = await financeContext.newPage();
  const [summary] = await Promise.all([
    finance.waitForResponse((r) => r.url().endsWith("/api/v1/admin/dashboard")),
    finance.goto("/admin"),
  ]);
  expect(summary.status()).toBe(200);
  expect(Object.keys(await summary.json()).sort()).toEqual(["payments", "quotes", "reservations"]);
  await expect(finance.getByRole("heading", { name: "Abonos por aprobar" })).toBeVisible();
  await expect(finance.getByRole("heading", { name: "PQRS abiertas" })).toHaveCount(0);
  await financeContext.close();
});

test("back-office screens are responsive and accessible", async ({ browser }) => {
  test.setTimeout(300_000);
  const adminContext = await browser.newContext({ storageState: adminStatePath });
  const admin = await adminContext.newPage();
  for (const [path, label] of [
    ["/admin", "admin"],
    ["/admin/solicitudes", "crm"],
    ["/admin/pqrs", "pqrs-admin"],
    ["/admin/cotizaciones", "cotizaciones"],
    ["/admin/reservas", "reservas"],
    ["/admin/galeria", "galeria"],
    ["/admin/tarifas", "tarifas"],
    ["/admin/tarifas?tab=temporadas", "tarifas-temporadas"],
    ["/admin/tarifas?tab=edades", "tarifas-edades"],
    ["/admin/tarifas?tab=promociones", "tarifas-promociones"],
    ["/admin/paquetes", "paquetes"],
    ["/admin/usuarios", "usuarios"],
    ["/admin/auditoria", "auditoria"],
    ["/admin/transporte", "transporte"],
  ] as const)
    await check(admin, path, label);
  await adminContext.close();
  const financeContext = await browser.newContext({ storageState: financeStatePath });
  const finance = await financeContext.newPage();
  await check(finance, "/admin/finanzas", "finanzas");
  await financeContext.close();
});
