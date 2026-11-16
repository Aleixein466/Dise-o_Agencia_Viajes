import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminStatePath } from "./e2e-state";

// E2E — PQRS in the customer portal: filing, staff answer/internal note, statuses, reply, closing, and
// isolation between two customers. Runs after catalog-cartagena.spec.ts (alphabetical order, 1 worker).
test.use({ storageState: adminStatePath });

const baseURL = () => test.info().project.use.baseURL ?? "http://127.0.0.1:3201";
const origin = () => new URL(baseURL()).origin;

async function mailedCode(email: string, after: number): Promise<string> {
  const dir = process.env.E2E_MAIL_SINK_DIR;
  if (!dir) throw new Error("E2E_MAIL_SINK_DIR is required (set by scripts/run-cartagena-e2e.ps1)");
  let code: string | undefined;
  await expect
    .poll(() => {
      const mail = readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map(
          (name) =>
            JSON.parse(readFileSync(join(dir, name), "utf8")) as {
              to: string;
              kind?: string;
              text: string;
              createdAt: string;
            },
        )
        .filter((m) => m.to === email && m.kind === "customer_login_code" && Date.parse(m.createdAt) >= after)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      code = mail ? /(\d{8})/.exec(mail.text)?.[1] : undefined;
      return code;
    })
    .toMatch(/^\d{8}$/);
  return code!;
}

/** A public quote request creates the customer record the portal login needs. */
async function createCustomer(request: APIRequestContext, name: string, email: string) {
  const destinations = (await (await request.get("/api/v1/public/destinations")).json()) as Array<{
    name: string;
    packages: Array<{ id: string }>;
  }>;
  const packageId = destinations.find((d) => d.name === "Destino Público E2E")?.packages[0]?.id;
  expect(packageId).toBeTruthy();
  const created = await request.post("/api/v1/public/quote-requests", {
    headers: { Origin: origin() },
    data: {
      packageId,
      adults: 1,
      childAges: [],
      optionalTourIds: [],
      addOnIds: [],
      contact: { name, email, phone: "3000000003" },
      dataConsent: true,
      idempotencyKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
}

async function signedInCustomer(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseURL(), storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const before = Date.now() - 1000;
  expect(
    (
      await page.request.post("/api/v1/customer-auth/request-code", { headers: { Origin: origin() }, data: { email } })
    ).status(),
  ).toBe(202);
  const code = await mailedCode(email, before);
  expect(
    (
      await page.request.post("/api/v1/customer-auth/verify", { headers: { Origin: origin() }, data: { email, code } })
    ).ok(),
  ).toBe(true);
  return page;
}

async function staff(request: APIRequestContext) {
  const session = (await (await request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
  const headers = { Origin: origin(), "x-csrf-token": session.csrfToken };
  const detail = async (id: string) =>
    (await (await request.get(`/api/v1/pqrs/${id}`)).json()) as { version: number; status: string };
  return {
    status: async (id: string, status: string) => {
      const res = await request.post(`/api/v1/pqrs/${id}/status`, {
        headers,
        data: { status, expectedVersion: (await detail(id)).version },
      });
      expect(res.status(), `status → ${status}`).toBe(200);
    },
    message: async (id: string, message: string, internal: boolean) => {
      expect(
        (await request.post(`/api/v1/pqrs/${id}/messages`, { headers, data: { message, internal } })).status(),
      ).toBe(201);
    },
    detail,
  };
}

test("portal PQRS: file, answer, wait for customer, reply, close; another customer sees nothing", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const emailA = `pqrs-a-${suffix}@publico-e2e.ricaurte.test`;
  const emailB = `pqrs-b-${suffix}@publico-e2e.ricaurte.test`;
  await createCustomer(page.request, "Cliente PQRS A", emailA);
  await createCustomer(page.request, "Cliente PQRS B", emailB);

  // Customer A files a PQRS from the portal.
  const a = await signedInCustomer(browser, emailA);
  await a.goto("/mi-cuenta");
  await expect(a.getByRole("heading", { name: "Mis PQRS" })).toBeVisible();
  await a.getByRole("button", { name: "Nueva PQRS" }).click();
  const form = a.locator("form", { has: a.getByRole("heading", { name: "Nueva PQRS" }) });
  await form.getByLabel("Tipo de solicitud *").selectOption("CLAIM");
  await form.getByLabel("Asunto *").fill(`Reclamo portal ${suffix}`);
  await form.getByLabel("Descripción *").fill("Reclamo ficticio de prueba E2E desde el portal del cliente.");
  await form.getByRole("button", { name: "Radicar PQRS" }).click();
  const done = a.getByText(/Radicamos tu PQRS con la referencia PQR-[0-9A-F]{12}\./);
  await expect(done).toBeVisible();
  const reference = /PQR-[0-9A-F]{12}/.exec((await done.innerText()) ?? "")![0];

  const mine = (await (await a.request.get("/api/v1/me/pqrs")).json()) as {
    items: Array<{ id: string; reference: string; status: string }>;
  };
  const ticket = mine.items.find((item) => item.reference === reference);
  expect(ticket?.status).toBe("RECEIVED");
  const id = ticket!.id;

  // Staff answers publicly, adds an internal note and asks the customer for information.
  const s = await staff(page.request);
  await s.status(id, "IN_REVIEW");
  await s.message(id, `Necesitamos el número de factura (${suffix}).`, false);
  await s.message(id, `Nota interna portal ${suffix}: revisar con el hotel.`, true);
  await s.status(id, "WAITING_FOR_CUSTOMER");

  // Customer A sees the answer and the status, never the internal note, and replies.
  await a.goto(`/mi-cuenta/pqrs/${id}`);
  await expect(a.getByRole("heading", { name: `Reclamo portal ${suffix}` })).toBeVisible();
  await expect(a.getByText(`Necesitamos el número de factura (${suffix}).`)).toBeVisible();
  await expect(a.getByText("Esperando tu respuesta").first()).toBeVisible();
  await expect(a.getByText(`Nota interna portal ${suffix}`)).toHaveCount(0);
  expect(JSON.stringify(await (await a.request.get(`/api/v1/me/pqrs/${id}`)).json())).not.toContain("Nota interna");
  await a.getByLabel("Tu mensaje").fill("Adjunto el número de factura FV-0001 (ficticio).");
  await a.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(a.getByText("Mensaje enviado.")).toBeVisible();
  await expect(a.getByText("Adjunto el número de factura FV-0001 (ficticio).")).toBeVisible();
  expect((await s.detail(id)).status).toBe("IN_REVIEW");

  // Customer B: no access to A's ticket by list, detail, reply or UI.
  const b = await signedInCustomer(browser, emailB);
  const listB = (await (await b.request.get("/api/v1/me/pqrs")).json()) as { items: Array<{ id: string }> };
  expect(listB.items.map((item) => item.id)).not.toContain(id);
  expect((await b.request.get(`/api/v1/me/pqrs/${id}`)).status()).toBe(404);
  const bSession = (await (await b.request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
  const foreignReply = await b.request.post(`/api/v1/me/pqrs/${id}/messages`, {
    headers: { Origin: origin(), "x-csrf-token": bSession.csrfToken },
    data: { message: "Intento ajeno" },
  });
  expect(foreignReply.status()).toBe(404);
  await b.goto(`/mi-cuenta/pqrs/${id}`);
  await expect(b.getByText(`Reclamo portal ${suffix}`)).toHaveCount(0);
  // Staff routes stay closed to customers.
  expect((await b.request.get("/api/v1/pqrs")).status()).toBe(403);

  // Staff answers and closes; the portal shows "Cerrada" and no reply form.
  await s.message(id, "Aplicamos el ajuste solicitado. Gracias.", false);
  await s.status(id, "ANSWERED");
  await s.status(id, "CLOSED");
  await a.goto(`/mi-cuenta/pqrs/${id}`);
  await expect(a.getByText("Cerrada").first()).toBeVisible();
  await expect(a.getByRole("button", { name: "Enviar mensaje" })).toHaveCount(0);
  const closedReply = await a.request.post(`/api/v1/me/pqrs/${id}/messages`, {
    headers: {
      Origin: origin(),
      "x-csrf-token": ((await (await a.request.get("/api/v1/auth/session")).json()) as { csrfToken: string }).csrfToken,
    },
    data: { message: "Una pregunta más" },
  });
  expect(closedReply.status()).toBe(409);

  // Anonymous access to the portal API is refused.
  const anon = await browser.newContext({ baseURL: baseURL(), storageState: { cookies: [], origins: [] } });
  expect((await anon.request.get("/api/v1/me/pqrs")).status()).toBe(401);
  await Promise.all([anon.close(), a.context().close(), b.context().close()]);
});
