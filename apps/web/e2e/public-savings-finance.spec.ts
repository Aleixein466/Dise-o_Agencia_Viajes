import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// E2E 6 — finance. Runs after public-portal.spec.ts (alphabetical, 1 worker) and reuses its CONFIRMED reservation,
// which still has a balance. Registrar = FINANCE user saved by catalog-cartagena.spec.ts; approver = second FINANCE.
const approverEmail = process.env.CARTAGENA_E2E_FINANCE2_EMAIL;
const approverPassword = process.env.CARTAGENA_E2E_RESTRICTED_PASSWORD;
const baseURL = () => test.info().project.use.baseURL ?? "http://127.0.0.1:3201";
const origin = () => new URL(baseURL()).origin;
const sinkDir = () => process.env.E2E_MAIL_SINK_DIR ?? "";
type Mail = { to: string; text: string; subject: string; kind: string; createdAt: string };
const mails = (): Mail[] =>
  readdirSync(sinkDir())
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(sinkDir(), name), "utf8")) as Mail);

async function csrf(request: APIRequestContext): Promise<string> {
  return ((await (await request.get("/api/v1/auth/session")).json()) as { csrfToken: string }).csrfToken;
}
const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Tag (${tag}) >> endobj\ntrailer\n%%EOF\n`, "latin1");
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

async function staffPage(browser: Browser, statePath?: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseURL(), ...(statePath ? { storageState: statePath } : {}) });
  return context.newPage();
}

/** First login of the approver: completes the initial MFA enrolment with a one-time recovery code. */
async function loginApprover(page: Page) {
  await page.goto(`/ingresar?next=${encodeURIComponent("/admin/finanzas")}`);
  await page.locator("#login-email").fill(approverEmail!);
  await page.locator("#login-password").fill(approverPassword!);
  await page.getByRole("button", { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/ingresar\/mfa/);
  await page.getByRole("button", { name: /Configurar una nueva aplicación/ }).click();
  const code = (await page.locator(".admin-recovery-codes").textContent())
    ?.split(/(?:·|Â·)/)
    .map((value) => value.trim())
    .find(Boolean);
  await page.getByRole("button", { name: /Usar un código de recuperación/ }).click();
  await page.locator("#mfa-recovery").fill(code!);
  await page.getByRole("button", { name: /Verificar/ }).click();
  await expect(page).toHaveURL(/\/admin\/finanzas$/);
}

async function apiAbono(request: APIRequestContext, fields: Record<string, string>, receipt: Buffer) {
  return request.post("/api/v1/finance/abonos", {
    headers: { Origin: origin(), "x-csrf-token": await csrf(request) },
    multipart: { ...fields, receipt: { name: "comprobante.pdf", mimeType: "application/pdf", buffer: receipt } },
  });
}

test("finance: manual abono with four-eyes approval, duplicates refused, savings plan, notification", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  if (!approverEmail || !approverPassword) throw new Error("Finance E2E credentials are required.");
  const admin = await staffPage(browser, adminStatePath);
  const registrar = await staffPage(browser, financeStatePath);

  // The reservation confirmed by the portal spec (deposit paid, balance left).
  const list = (await (await admin.request.get("/api/v1/reservations?status=CONFIRMED")).json()) as {
    items: Array<{ id: string; code: string }>;
  };
  expect(list.items.length).toBeGreaterThan(0);
  const reservationId = list.items[0].id;
  const reservationCode = list.items[0].code;
  type Detail = { customer: { id: string; email: string }; payment: { paidCents: string; balanceCents: string } };
  const detail = (await (await admin.request.get(`/api/v1/reservations/${reservationId}`)).json()) as Detail;
  const paidBefore = BigInt(detail.payment.paidCents);
  expect(BigInt(detail.payment.balanceCents)).toBeGreaterThan(BigInt(20_000_000));

  // ADMIN has no finance-write permission; CSRF is required.
  expect(
    (
      await apiAbono(
        admin.request,
        { reservationId, amountCents: "100", method: "CASH", paidAt: today() },
        pdf("admin"),
      )
    ).status(),
  ).toBe(403);
  const noCsrf = await registrar.request.post("/api/v1/finance/abonos", {
    headers: { Origin: origin() },
    multipart: {
      reservationId,
      amountCents: "100",
      method: "CASH",
      paidAt: today(),
      receipt: { name: "c.pdf", mimeType: "application/pdf", buffer: pdf("nocsrf") },
    },
  });
  expect(noCsrf.status()).toBe(403);

  // Registrar records a transfer through the UI.
  const bankRef = `E2E-${randomUUID().slice(0, 8)}`;
  await registrar.goto("/admin/finanzas");
  await registrar.getByLabel("Código de la reserva").fill(reservationCode);
  await registrar.getByLabel("Valor (COP)").fill("100000");
  await registrar.getByLabel("Método").selectOption("BANK_TRANSFER");
  await registrar.getByLabel("Referencia bancaria").fill(bankRef);
  await registrar.getByLabel("Fecha del pago").fill(today());
  await registrar
    .getByLabel("Comprobante")
    .setInputFiles({ name: "comprobante.pdf", mimeType: "application/pdf", buffer: pdf(bankRef) });
  await registrar.getByRole("button", { name: "Registrar abono" }).click();
  await expect(registrar.getByText("Abono registrado. Queda pendiente de aprobación.")).toBeVisible();
  const row = registrar.getByRole("row", { name: new RegExp(bankRef) });
  await expect(row.getByText("Registrado por ti: otra persona de Finanzas debe aprobarlo")).toBeVisible();
  await expect(row.getByRole("button", { name: "Aprobar abono" })).toHaveCount(0);

  type Abonos = { items: Array<{ id: string; bankReference: string | null; status: string }> };
  const abonos = (await (await registrar.request.get("/api/v1/finance/abonos?status=SUBMITTED")).json()) as Abonos;
  const abonoId = abonos.items.find((a) => a.bankReference === bankRef)!.id;
  const registrarCsrf = await csrf(registrar.request);
  // Four eyes: the registrar cannot approve their own abono.
  expect(
    (
      await registrar.request.post(`/api/v1/finance/abonos/${abonoId}/approve`, {
        headers: { Origin: origin(), "x-csrf-token": registrarCsrf },
      })
    ).status(),
  ).toBe(403);
  // Reconciliation: same bank reference, or the same receipt bytes, is refused.
  expect(
    (
      await apiAbono(
        registrar.request,
        { reservationId, amountCents: "100", method: "BANK_TRANSFER", bankReference: bankRef, paidAt: today() },
        pdf("other"),
      )
    ).status(),
  ).toBe(409);
  expect(
    (
      await apiAbono(
        registrar.request,
        { reservationId, amountCents: "100", method: "BANK_TRANSFER", bankReference: `${bankRef}-B`, paidAt: today() },
        pdf(bankRef),
      )
    ).status(),
  ).toBe(409);
  // Binary validation: a text file named .pdf is refused.
  const fake = await registrar.request.post("/api/v1/finance/abonos", {
    headers: { Origin: origin(), "x-csrf-token": registrarCsrf },
    multipart: {
      reservationId,
      amountCents: "100",
      method: "CASH",
      paidAt: today(),
      receipt: { name: "c.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") },
    },
  });
  expect(fake.status()).toBe(400);

  // Approver (another FINANCE user) approves in the UI.
  const approver = await staffPage(browser);
  await loginApprover(approver);
  await approver
    .getByRole("row", { name: new RegExp(bankRef) })
    .getByRole("button", { name: "Aprobar abono" })
    .click();
  await expect(approver.getByText("Abono aprobado.")).toBeVisible();
  type Ledger = { entries: Array<{ kind: string; amountCents: string }>; paidCents: string };
  const ledger = (await (
    await approver.request.get(`/api/v1/finance/ledger?reservationId=${reservationId}`)
  ).json()) as Ledger;
  expect(BigInt(ledger.paidCents)).toBe(paidBefore + BigInt(10_000_000));
  expect(ledger.entries.filter((e) => e.kind === "MANUAL_ABONO")).toHaveLength(1);

  // Concurrent double approval of another abono: exactly one wins, the ledger moves once.
  const second = await apiAbono(
    registrar.request,
    { reservationId, amountCents: "5000000", method: "CASH", paidAt: today() },
    pdf(`${bankRef}-cash`),
  );
  expect(second.status()).toBe(201);
  const secondId = ((await second.json()) as { id: string }).id;
  const approverCsrf = await csrf(approver.request);
  const approve = () =>
    approver.request.post(`/api/v1/finance/abonos/${secondId}/approve`, {
      headers: { Origin: origin(), "x-csrf-token": approverCsrf },
    });
  const statuses = (await Promise.all([approve(), approve()])).map((r) => r.status()).sort();
  expect(statuses).toEqual([201, 409]);
  const ledgerAfter = (await (
    await approver.request.get(`/api/v1/finance/ledger?reservationId=${reservationId}`)
  ).json()) as Ledger;
  expect(BigInt(ledgerAfter.paidCents)).toBe(paidBefore + BigInt(15_000_000));

  // Savings plan (no automatic debits): created in the UI, funded by an approved abono.
  const planName = `Ahorro E2E ${bankRef}`;
  await approver.getByRole("button", { name: "Planes de ahorro" }).click();
  await expect(approver.getByText("Los planes de ahorro no generan cobros automáticos.")).toBeVisible();
  await approver.getByLabel("Correo del cliente").fill(detail.customer.email);
  await approver.getByLabel("Nombre del plan").fill(planName);
  await approver.getByLabel("Meta (COP)").fill("200000");
  await approver.getByLabel("Fecha de la cuota 1").fill(inDays(30));
  await approver.getByLabel("Valor de la cuota 1 (COP)").fill("100000");
  await approver.getByRole("button", { name: "Agregar cuota" }).click();
  await approver.getByLabel("Fecha de la cuota 2").fill(inDays(60));
  await approver.getByLabel("Valor de la cuota 2 (COP)").fill("100000");
  await approver.getByRole("button", { name: "Crear plan de ahorro" }).last().click();
  await expect(approver.getByRole("button", { name: `Ver plan ${planName}` })).toBeVisible();
  const plans = (await (
    await approver.request.get(`/api/v1/finance/savings-plans?customerId=${detail.customer.id}`)
  ).json()) as Array<{ id: string; name: string }>;
  const planId = plans.find((p) => p.name === planName)!.id;
  const toPlan = await apiAbono(
    registrar.request,
    { savingsPlanId: planId, amountCents: "10000000", method: "CASH", paidAt: today() },
    pdf(`${bankRef}-plan`),
  );
  expect(toPlan.status()).toBe(201);
  expect(
    (
      await approver.request.post(`/api/v1/finance/abonos/${((await toPlan.json()) as { id: string }).id}/approve`, {
        headers: { Origin: origin(), "x-csrf-token": approverCsrf },
      })
    ).status(),
  ).toBe(201);

  // Customer: sees the plan with cuota 1 paid; cannot read staff finance data; foreign plan ids are 404.
  const customer = await staffPage(browser);
  const before = Date.now() - 1000;
  expect(
    (
      await customer.request.post("/api/v1/customer-auth/request-code", {
        headers: { Origin: origin() },
        data: { email: detail.customer.email },
      })
    ).status(),
  ).toBe(202);
  let code: string | undefined;
  await expect
    .poll(() => {
      const mail = mails()
        .filter(
          (m) =>
            m.to === detail.customer.email && m.kind === "customer_login_code" && Date.parse(m.createdAt) >= before,
        )
        .pop();
      code = mail ? /(\d{8})/.exec(mail.text)?.[1] : undefined;
      return code;
    })
    .toMatch(/^\d{8}$/);
  expect(
    (
      await customer.request.post("/api/v1/customer-auth/verify", {
        headers: { Origin: origin() },
        data: { email: detail.customer.email, code },
      })
    ).ok(),
  ).toBe(true);
  type Plan = { id: string; paidCents: string; installments: Array<{ status: string }> };
  const mine = (await (await customer.request.get("/api/v1/me/savings-plans")).json()) as Plan[];
  const plan = mine.find((p) => p.id === planId)!;
  expect(plan.paidCents).toBe("10000000");
  expect(plan.installments.map((i) => i.status)).toEqual(["PAID", "PENDING"]);
  expect((await customer.request.get(`/api/v1/me/savings-plans/${randomUUID()}`)).status()).toBe(404);
  expect((await customer.request.get("/api/v1/finance/abonos")).status()).toBe(403);
  await customer.goto(`/mi-cuenta/ahorro/${planId}`);
  await expect(customer.getByText("Pagada").first()).toBeVisible();
  await expect(customer.getByText("Para abonar comunícate con tu asesor")).toBeVisible();

  // Test notification: the approved abono produced a "payment.approved" mail (file sink only, nothing real sent),
  // and no notification ever carries a login code.
  await expect
    .poll(() => mails().filter((m) => m.to === detail.customer.email && m.kind === "payment.approved").length, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const issued = mails()
    .filter((m) => m.kind === "customer_login_code")
    .map((m) => /(\d{8})/.exec(m.text)?.[1])
    .filter((c): c is string => Boolean(c));
  expect(issued.length).toBeGreaterThan(0);
  for (const mail of mails().filter((m) => m.kind !== "customer_login_code"))
    for (const issuedCode of issued) expect(mail.text).not.toContain(issuedCode);

  // Responsive + WCAG on the finance screens.
  for (const [page, path] of [
    [approver, "/admin/finanzas"],
    [customer, `/mi-cuenta/ahorro/${planId}`],
  ] as const) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    await expect(page.locator("h1, h2").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  }
});
