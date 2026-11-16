import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminStatePath } from "./e2e-state";

// E2E 5 — customer portal + reservations. Runs after public-crm.spec.ts, reusing the admin MFA session.
test.use({ storageState: adminStatePath });

const baseURL = () => test.info().project.use.baseURL ?? "http://127.0.0.1:3201";
const origin = () => new URL(baseURL()).origin;
const sinkDir = () => {
  const dir = process.env.E2E_MAIL_SINK_DIR;
  if (!dir) throw new Error("E2E_MAIL_SINK_DIR is required (set by scripts/run-cartagena-e2e.ps1)");
  return dir;
};

/** Latest login code mailed to `email` by the test-only file adapter. */
async function mailedCode(email: string, after: number): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(() => {
      const mails = readdirSync(sinkDir())
        .filter((name) => name.endsWith(".json"))
        .map(
          (name) =>
            JSON.parse(readFileSync(join(sinkDir(), name), "utf8")) as { to: string; text: string; createdAt: string },
        )
        .filter((mail) => mail.to === email && Date.parse(mail.createdAt) >= after)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      code = mails[0] ? /(\d{8})/.exec(mails[0].text)?.[1] : undefined;
      return code;
    })
    .toMatch(/^\d{8}$/);
  return code as string;
}

async function csrf(request: APIRequestContext): Promise<string> {
  const session = (await (await request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
  return session.csrfToken;
}

async function publicRequest(request: APIRequestContext, name: string, email: string): Promise<string> {
  const destinations = (await (await request.get("/api/v1/public/destinations")).json()) as Array<{
    name: string;
    packages: Array<{ id: string }>;
  }>;
  const packageId = destinations.find((d) => d.name === "Destino Público E2E")?.packages[0]?.id;
  expect(packageId).toBeTruthy();
  const builder = (await (await request.get(`/api/v1/public/packages/${packageId}/builder`)).json()) as {
    hotels: Array<{ id: string; roomTypes: Array<{ id: string }> }>;
  };
  const created = await request.post("/api/v1/public/quote-requests", {
    headers: { Origin: origin() },
    data: {
      packageId,
      hotelId: builder.hotels[0].id,
      roomTypeId: builder.hotels[0].roomTypes[0].id,
      adults: 2,
      childAges: [],
      optionalTourIds: [],
      addOnIds: [],
      contact: { name, email, phone: "3000000002" },
      dataConsent: true,
      idempotencyKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { reference: string }).reference;
}

/** Staff moves the request to PROPOSAL_SENT through the audited CRM API. */
async function sendProposal(request: APIRequestContext, reference: string): Promise<string> {
  const list = (await (await request.get(`/api/v1/crm/requests?q=${encodeURIComponent(reference)}`)).json()) as {
    items: Array<{ id: string }>;
  };
  const id = list.items[0].id;
  const advisors = (await (await request.get("/api/v1/crm/advisors")).json()) as Array<{ id: string; name: string }>;
  const advisorId = advisors.find((a) => a.name === "Operador Temporal")?.id ?? advisors[0].id;
  const headers = { Origin: origin(), "x-csrf-token": await csrf(request) };
  const detail = async () => (await (await request.get(`/api/v1/crm/requests/${id}`)).json()) as { revision: number };
  expect(
    (
      await request.post(`/api/v1/crm/requests/${id}/assign`, {
        headers,
        data: { advisorId, expectedRevision: (await detail()).revision },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/api/v1/crm/requests/${id}/status`, {
        headers,
        data: { status: "PROPOSAL_SENT", expectedRevision: (await detail()).revision },
      })
    ).ok(),
  ).toBe(true);
  return id;
}

async function customerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseURL(), storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

async function loginThroughUi(page: Page, email: string) {
  await page.goto("/mi-cuenta");
  await expect(page.getByRole("heading", { name: "Ingresa a tu cuenta" })).toBeVisible();
  const before = Date.now() - 1000;
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByRole("heading", { name: "Escribe tu código" })).toBeVisible();
  await page.getByLabel("Código de 8 dígitos").fill(await mailedCode(email, before));
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
}

test("portal: verified customer accepts a proposal, requests a reservation, staff confirms availability manually", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const emailA = `portal-a-${suffix}@publico-e2e.ricaurte.test`;
  const emailB = `portal-b-${suffix}@publico-e2e.ricaurte.test`;
  const referenceA = await publicRequest(page.request, "Cliente Portal A", emailA);
  const referenceB = await publicRequest(page.request, "Cliente Portal B", emailB);
  const quoteA = await sendProposal(page.request, referenceA);

  // Unknown emails get the same generic answer and no mail.
  const unknown = await page.request.post("/api/v1/customer-auth/request-code", {
    headers: { Origin: origin() },
    data: { email: `nadie-${suffix}@publico-e2e.ricaurte.test` },
  });
  expect(unknown.status()).toBe(202);

  // Customer A: email code login, accept, request reservation.
  const customer = await customerPage(browser);
  await loginThroughUi(customer, emailA);
  await customer.getByRole("link", { name: "Ver solicitud" }).first().click();
  await expect(customer).toHaveURL(new RegExp(`/mi-cuenta/solicitudes/${quoteA}$`));
  await customer.getByRole("button", { name: "Aceptar propuesta" }).click();
  await customer.getByRole("button", { name: "Sí, aceptar" }).click();
  await expect(customer.getByRole("heading", { name: "Solicitar reserva" })).toBeVisible();
  const start = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  await customer.getByLabel("Fecha de inicio del viaje").fill(start);
  const names = customer.getByLabel("Nombre completo");
  await names.nth(0).fill("Ana Portal Prueba");
  await names.nth(1).fill("Beto Portal Prueba");
  await customer.getByRole("button", { name: "Enviar solicitud de reserva" }).click();
  await expect(customer).toHaveURL(/\/mi-cuenta\/reservas\/[0-9a-f-]{36}$/);
  const reservationId = customer.url().split("/").pop() as string;
  await expect(customer.getByText("Pendiente de confirmación por un asesor")).toBeVisible();

  // A repeated request returns the same reservation, never a duplicate.
  const customerCsrf = await csrf(customer.request);
  const replay = await customer.request.post(`/api/v1/me/quotes/${quoteA}/reservation`, {
    headers: { Origin: origin(), "x-csrf-token": customerCsrf },
    data: {
      startsOn: start,
      travelers: [
        { fullName: "Ana Portal Prueba", category: "ADULT" },
        { fullName: "Beto Portal Prueba", category: "ADULT" },
      ],
    },
  });
  expect(replay.status()).toBe(200);
  expect(((await replay.json()) as { id: string }).id).toBe(reservationId);

  // A customer session cannot touch staff endpoints.
  expect((await customer.request.get(`/api/v1/reservations/${reservationId}`)).status()).toBe(403);

  // Staff: manual validation in /admin/reservas.
  await page.goto(`/admin/reservas?id=${reservationId}`);
  await page.getByRole("button", { name: "Iniciar validación" }).click();
  // Staff decides the minimum deposit (COP 200.000 of 1.000.000); nothing is invented by the system.
  await page.getByLabel("Abono mínimo requerido (COP)").fill("200000");
  await page.getByRole("button", { name: "Confirmar disponibilidad" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar disponibilidad" })).toHaveCount(0);

  // Stale version is rejected (no lost update).
  const staffCsrf = await csrf(page.request);
  const stale = await page.request.post(`/api/v1/reservations/${reservationId}/events`, {
    headers: { Origin: origin(), "x-csrf-token": staffCsrf },
    data: { event: "CANCEL", expectedVersion: 0, reason: "Prueba de versión" },
  });
  expect(stale.status()).toBe(409);

  // Persisted state + audit trail, read back from PostgreSQL through the API.
  const detail = (await (await page.request.get(`/api/v1/reservations/${reservationId}`)).json()) as {
    status: string;
    availabilityValidatedAt: string | null;
    history: Array<{ event: string; toStatus: string }>;
  };
  expect(detail.status).toBe("PENDING_PAYMENT");
  expect(detail.availabilityValidatedAt).toBeTruthy();
  expect(detail.history.map((h) => h.event)).toEqual(
    expect.arrayContaining(["SUBMIT_REQUEST", "START_VALIDATION", "APPROVE_FOR_PAYMENT"]),
  );

  // Customer sees the new state.
  await customer.reload();
  await expect(customer.getByText("Disponibilidad confirmada · pendiente de pago").first()).toBeVisible();

  // Customer B: valid session, but every foreign id answers 404 and its unaccepted quote cannot be reserved.
  const other = await customerPage(browser);
  const before = Date.now() - 1000;
  expect(
    (
      await other.request.post("/api/v1/customer-auth/request-code", {
        headers: { Origin: origin() },
        data: { email: emailB },
      })
    ).status(),
  ).toBe(202);
  const verified = await other.request.post("/api/v1/customer-auth/verify", {
    headers: { Origin: origin() },
    data: { email: emailB, code: await mailedCode(emailB, before) },
  });
  expect(verified.ok()).toBe(true);
  const otherCsrf = await csrf(other.request);
  const mutate = { Origin: origin(), "x-csrf-token": otherCsrf };
  expect((await other.request.get(`/api/v1/me/quotes/${quoteA}`)).status()).toBe(404);
  expect((await other.request.get(`/api/v1/me/reservations/${reservationId}`)).status()).toBe(404);
  expect(
    (
      await other.request.post(`/api/v1/me/reservations/${reservationId}/cancel`, {
        headers: mutate,
        data: { reason: "Intento ajeno", expectedVersion: 0 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(`/api/v1/me/quotes/${quoteA}/decision`, {
        headers: mutate,
        data: { decision: "DECLINE", expectedRevision: 1 },
      })
    ).status(),
  ).toBe(404);
  const ownQuotes = (await (await other.request.get("/api/v1/me/quotes")).json()) as Array<{
    id: string;
    reference: string;
    status: string;
  }>;
  expect(ownQuotes.map((q) => q.reference)).toEqual([referenceB]);
  const notAccepted = await other.request.post(`/api/v1/me/quotes/${ownQuotes[0].id}/reservation`, {
    headers: mutate,
    data: {
      startsOn: start,
      travelers: [
        { fullName: "Carla Ajena", category: "ADULT" },
        { fullName: "Dario Ajeno", category: "ADULT" },
      ],
    },
  });
  expect(notAccepted.status()).toBe(409);
  // Mutations without CSRF are refused.
  expect(
    (
      await other.request.post(`/api/v1/me/quotes/${ownQuotes[0].id}/decision`, {
        headers: { Origin: origin() },
        data: { decision: "DECLINE", expectedRevision: 1 },
      })
    ).status(),
  ).toBe(403);

  // Customer A still has its reservation untouched.
  const mine = (await (await customer.request.get(`/api/v1/me/reservations/${reservationId}`)).json()) as {
    status: string;
  };
  expect(mine.status).toBe("PENDING_PAYMENT");

  // Online abonos through the sandbox test adapter (no real charges). A declined attempt moves no money.
  const pay = async (pesos: string, outcome: "aprobado" | "rechazado") => {
    await customer.goto(`/mi-cuenta/reservas/${reservationId}`);
    await customer.getByLabel("Valor a abonar (COP)").fill(pesos);
    await customer.getByRole("button", { name: "Pagar en entorno de prueba" }).click();
    await expect(customer).toHaveURL(/\/pagos\/prueba\/TEST-[0-9A-F]{16}$/);
    await expect(customer.getByText("Entorno de prueba — no se realiza ningún cobro")).toBeVisible();
    await customer.getByRole("button", { name: `Simular pago ${outcome}` }).click();
    await expect(
      customer.getByText(`Resultado del pago: ${outcome === "aprobado" ? "Aprobado" : "Rechazado"}.`),
    ).toBeVisible();
    const reference = customer.url().split("/").pop() as string;
    await customer.getByRole("link", { name: "Volver a mi reserva" }).click();
    await expect(customer).toHaveURL(new RegExp(`/mi-cuenta/reservas/${reservationId}$`));
    return reference;
  };
  await pay("50000", "rechazado");
  await expect(customer.getByText("Disponibilidad confirmada · pendiente de pago").first()).toBeVisible();
  const approvedRef = await pay("200000", "aprobado");
  await expect(customer.getByText("Pago parcial recibido").first()).toBeVisible();
  type Money = {
    status: string;
    payment: { paidCents: string; balanceCents: string };
    payments: Array<{ status: string }>;
  };
  const money = (await (await customer.request.get(`/api/v1/me/reservations/${reservationId}`)).json()) as Money;
  expect(money.status).toBe("PARTIALLY_PAID");
  expect(money.payment).toMatchObject({ paidCents: "20000000", balanceCents: "80000000" });
  expect(money.payments.map((p) => p.status).sort()).toEqual(["APPROVED", "DECLINED"]);

  // Replaying the provider decision, forging an event, or another customer probing the checkout changes nothing.
  const replayDecision = await customer.request.post(`/api/v1/payments/sandbox/${approvedRef}/decision`, {
    headers: { Origin: origin(), "x-csrf-token": await csrf(customer.request) },
    data: { outcome: "APPROVED" },
  });
  expect(replayDecision.status()).toBe(200);
  const forged = await page.request.post("/api/v1/payments/webhooks/sandbox", {
    data: {
      event: "transaction.updated",
      data: {
        transaction: {
          id: randomUUID(),
          reference: approvedRef,
          amount_in_cents: 80000000,
          currency: "COP",
          status: "APPROVED",
        },
      },
      signature: {
        properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
        checksum: "0".repeat(64),
      },
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
  expect(forged.status()).toBe(401);
  expect((await other.request.get(`/api/v1/payments/sandbox/${approvedRef}`)).status()).toBe(404);
  const after = (await (await customer.request.get(`/api/v1/me/reservations/${reservationId}`)).json()) as Money;
  expect(after.payment.paidCents).toBe("20000000");

  // Deposit covered: staff confirms the reservation manually.
  await page.goto(`/admin/reservas?id=${reservationId}`);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByRole("button", { name: "Confirmar reserva" })).toHaveCount(0);
  const confirmed = (await (await page.request.get(`/api/v1/reservations/${reservationId}`)).json()) as {
    status: string;
    history: Array<{ event: string }>;
  };
  expect(confirmed.status).toBe("CONFIRMED");
  expect(confirmed.history.map((h) => h.event)).toEqual(expect.arrayContaining(["PAYMENT_SETTLED", "CONFIRM"]));
  await customer.goto(`/mi-cuenta/reservas/${reservationId}`);
  await expect(customer.getByText("Reserva confirmada").first()).toBeVisible();

  // Responsive (360 px, no horizontal scroll) and WCAG checks on the portal.
  for (const path of ["/mi-cuenta", `/mi-cuenta/reservas/${reservationId}`, `/pagos/prueba/${approvedRef}`]) {
    await customer.setViewportSize({ width: 360, height: 800 });
    await customer.goto(path);
    await expect(customer.locator("h2").first()).toBeVisible();
    const overflow = await customer.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page: customer })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  }
  // Login form a11y as well.
  const anon = await customerPage(browser);
  await anon.setViewportSize({ width: 360, height: 800 });
  await anon.goto("/mi-cuenta");
  await expect(anon.getByRole("heading", { name: "Ingresa a tu cuenta" })).toBeVisible();
  const axeLogin = await new AxeBuilder({ page: anon })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axeLogin.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
