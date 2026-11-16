import { mkdirSync, readdirSync, readFileSync } from "node:fs";

import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { adminStatePath, financeStatePath, stateDir } from "./e2e-state";

// Milestone 6 sweep: every main screen at phone, tablet and desktop widths must not scroll horizontally, must pass
// WCAG 2.2 AA automated checks and must not log console errors. Screenshots go to %TEMP% for manual review.
const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];
const shots = join(stateDir, "sweep");
mkdirSync(shots, { recursive: true });

async function firstDestination(page: Page): Promise<string> {
  await page.goto("/destinos");
  const href = await page.locator('a[href^="/destinos/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

/**
 * "Network idle" that ignores Next's RSC prefetches (`?_rsc=`). Cached pages carry `stale-while-revalidate`, and
 * Chromium reports those background refreshes as requests that never finish, so Playwright's own `networkidle`
 * times out on every revisit even though the server answers at once (reproduced in isolation with a bare HTTP
 * server). Every other request, including API calls and images, must still finish, and a stuck one is named.
 */
function trackRequests(page: Page) {
  const pending = new Set<Request>();
  const start = (request: Request) => {
    if (!request.url().includes("_rsc=")) pending.add(request);
  };
  const end = (request: Request) => pending.delete(request);
  page.on("request", start);
  page.on("requestfinished", end);
  page.on("requestfailed", end);
  return {
    async idle(timeoutMs = 30_000) {
      await page.waitForLoadState("load");
      const deadline = Date.now() + timeoutMs;
      let quietSince = Date.now();
      while (Date.now() < deadline) {
        if (pending.size > 0) quietSince = Date.now();
        else if (Date.now() - quietSince >= 500) return;
        await page.waitForTimeout(100);
      }
      throw new Error(`Network never went idle; pending: ${[...pending].map((r) => r.url()).join(", ")}`);
    },
    stop() {
      page.off("request", start);
      page.off("requestfinished", end);
      page.off("requestfailed", end);
    },
  };
}

async function check(page: Page, path: string, label: string) {
  const network = trackRequests(page);
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const response = await page.goto(path);
    expect(response?.status(), `${label} ${vp.name} status`).toBeLessThan(400);
    await network.idle();
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
    // next/image loads lazily and a full-page screenshot does not scroll, so off-screen photos would stay empty and
    // never be checked. Force every rendered image (not those inside a closed <details>) to load, then require it.
    await page.evaluate(() => {
      for (const img of document.images) if (img.checkVisibility() && img.loading === "lazy") img.loading = "eager";
    });
    await page
      .waitForFunction(
        () => [...document.images].filter((img) => img.checkVisibility()).every((img) => img.complete),
        null,
        { timeout: 20_000 },
      )
      .catch(() => undefined); // the assertion below names any image that never loaded
    const broken = await page.evaluate(() =>
      [...document.images]
        // Any image that finished loading broken (hidden ones too), plus any rendered image that never loaded.
        .filter((img) => (img.complete && img.naturalWidth === 0) || (img.checkVisibility() && !img.complete))
        .map((img) => img.currentSrc || img.src),
    );
    expect.soft(broken, `${label} ${vp.name} broken images`).toEqual([]);
    await page.screenshot({ path: join(shots, `${label}-${vp.name}.png`), fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect.soft(axe.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  page.off("console", onConsole);
  network.stop();
  // 401/403 probes for anonymous session checks are expected network noise, not app errors.
  expect
    .soft(
      errors.filter((e) => !/40[13]/.test(e)),
      `${label} console errors`,
    )
    .toEqual([]);
}

test("public screens are responsive and accessible", async ({ page }) => {
  test.setTimeout(320_000);
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
  test.setTimeout(600_000);
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
    ["/admin/clientes", "clientes"],
    ["/admin/cupos", "cupos"],
    ["/admin/contenido", "contenido"],
    ["/admin/configuracion", "configuracion"],
  ] as const)
    await check(admin, path, label);
  await adminContext.close();
  const financeContext = await browser.newContext({ storageState: financeStatePath });
  const finance = await financeContext.newPage();
  await check(finance, "/admin/finanzas", "finanzas");
  await financeContext.close();
});

type SinkMail = { to: string; text: string; kind: string; createdAt: string };
const sinkMails = (): SinkMail[] => {
  const dir = process.env.E2E_MAIL_SINK_DIR ?? "";
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as SinkMail);
};

// Customer portal: signs in as the customer of the reservation confirmed by public-portal.spec.ts (the same chain
// public-savings-finance.spec.ts relies on, so run it after those specs), then sweeps the portal screens.
test("customer portal screens are responsive and accessible", async ({ browser }) => {
  test.setTimeout(400_000);
  const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3201").origin;
  const adminContext = await browser.newContext({ storageState: adminStatePath });
  const list = (await (await adminContext.request.get("/api/v1/reservations?status=CONFIRMED")).json()) as {
    items: Array<{ id: string }>;
  };
  expect(list.items.length, "needs the CONFIRMED reservation created by public-portal.spec.ts").toBeGreaterThan(0);
  const reservationId = list.items[0].id;
  const detail = (await (await adminContext.request.get(`/api/v1/reservations/${reservationId}`)).json()) as {
    customer: { email: string };
  };
  await adminContext.close();
  const email = detail.customer.email;

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const since = Date.now() - 1000;
  expect(
    (
      await customer.request.post("/api/v1/customer-auth/request-code", {
        headers: { Origin: origin },
        data: { email },
      })
    ).status(),
  ).toBe(202);
  let code: string | undefined;
  await expect
    .poll(() => {
      const mail = sinkMails()
        .filter((m) => m.to === email && m.kind === "customer_login_code" && Date.parse(m.createdAt) >= since)
        .pop();
      code = mail ? /(\d{8})/.exec(mail.text)?.[1] : undefined;
      return code;
    })
    .toMatch(/^\d{8}$/);
  expect(
    (
      await customer.request.post("/api/v1/customer-auth/verify", {
        headers: { Origin: origin },
        data: { email, code },
      })
    ).ok(),
  ).toBe(true);

  const quotes = (await (await customer.request.get("/api/v1/me/quotes")).json()) as Array<{ id: string }>;
  const plans = (await (await customer.request.get("/api/v1/me/savings-plans")).json()) as Array<{ id: string }>;
  const pqrs = (await (await customer.request.get("/api/v1/me/pqrs")).json()) as { items: Array<{ id: string }> };
  expect(quotes.length, "the customer has a quote").toBeGreaterThan(0);
  expect(plans.length, "needs the savings plan created by public-savings-finance.spec.ts").toBeGreaterThan(0);
  const routes: Array<[string, string]> = [
    ["/mi-cuenta", "portal-inicio"],
    [`/mi-cuenta/reservas/${reservationId}`, "portal-reserva"],
    [`/mi-cuenta/solicitudes/${quotes[0].id}`, "portal-solicitud"],
    [`/mi-cuenta/ahorro/${plans[0].id}`, "portal-ahorro"],
  ];
  // A PQRS is filed by other customers in public-pqrs-portal.spec.ts; sweep it only when this customer has one.
  if (pqrs.items[0]) routes.push([`/mi-cuenta/pqrs/${pqrs.items[0].id}`, "portal-pqrs"]);
  for (const [path, label] of routes) await check(customer, path, label);
  await customerContext.close();
});
