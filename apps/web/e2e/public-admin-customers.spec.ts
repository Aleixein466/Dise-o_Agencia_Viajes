import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Admin customers module against the isolated seeded instance. Two customers are created exactly as the public wizard
// does (one public quote request each), with timestamped names and emails, then searched, opened, edited and annotated.
// Named public-* so it runs after catalog-cartagena, which saves the MFA-complete admin and finance sessions.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const A = {
  name: `E2E Cliente A ${stamp}`,
  email: `cliente-a-${stamp}@publico-e2e.ricaurte.test`,
  phone: "3000000101",
};
const B = {
  name: `E2E Cliente B ${stamp}`,
  email: `cliente-b-${stamp}@publico-e2e.ricaurte.test`,
  phone: "3000000102",
};
const form = (page: Page) => page.locator("form.admin-commercial-form");

async function publicQuote(request: APIRequestContext, origin: string, contact: typeof A) {
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
    headers: { Origin: origin },
    data: {
      packageId,
      hotelId: builder.hotels[0].id,
      roomTypeId: builder.hotels[0].roomTypes[0].id,
      adults: 2,
      childAges: [],
      optionalTourIds: [],
      addOnIds: [],
      contact,
      dataConsent: true,
      idempotencyKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { reference: string }).reference;
}

async function openProfile(page: Page, name: string) {
  await page.goto("/admin/clientes");
  await expect(page.getByRole("heading", { name: "Clientes", level: 1 })).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar cliente" }).fill(name);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: `Ver perfil de ${name}` }).click();
  await expect(page.getByRole("heading", { name: `Cliente: ${name}` })).toBeFocused();
}

test.describe("Admin customers", () => {
  let reference = "";

  test("search, profile with history, edit contact, duplicate email and internal notes", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3201").origin;
    reference = await publicQuote(page.request, origin, A);
    await publicQuote(page.request, origin, B);

    // Search is case-insensitive and the list never carries the full document number.
    const list = (await (
      await page.request.get(`/api/v1/customers?q=${encodeURIComponent(A.email.toUpperCase())}`)
    ).json()) as { total: number; items: Record<string, unknown>[] };
    expect(list.total).toBe(1);
    expect(Object.keys(list.items[0])).not.toContain("documentNumber");
    expect(Object.keys(list.items[0])).toContain("documentNumberMasked");
    expect((await page.request.get("/api/v1/customers?pageSize=101")).status()).toBe(400);

    await openProfile(page, A.name);
    const profile = page.locator("section").filter({ has: page.getByRole("heading", { name: `Cliente: ${A.name}` }) });
    await expect(profile).toContainText(A.email);
    await expect(profile.getByRole("region", { name: "Cotizaciones del cliente" })).toContainText(reference);
    await expect(profile.getByText("Sin notas internas.")).toBeVisible();

    // Inline validation, then a real edit.
    await profile.getByRole("button", { name: "Editar contacto" }).click();
    await form(page)
      .getByLabel(/^Teléfono/)
      .fill("12");
    await form(page).getByRole("button", { name: "Guardar contacto" }).click();
    await expect(form(page).getByLabel(/^Teléfono/)).toBeFocused();
    await form(page)
      .getByLabel(/^Teléfono/)
      .fill("+57 310 555 0101");
    await form(page).getByLabel(/^País/).fill("co");
    await form(page).getByRole("button", { name: "Guardar contacto" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Datos de contacto guardados." })).toBeVisible();
    await expect(profile).toContainText("+57 310 555 0101");
    await expect(profile).toContainText("CO");

    // Another customer's email is refused: no duplicate customers.
    await profile.getByRole("button", { name: "Editar contacto" }).click();
    await form(page)
      .getByLabel(/^Correo/)
      .fill(B.email.toUpperCase());
    await form(page).getByRole("button", { name: "Guardar contacto" }).click();
    await expect(form(page).getByText(/Ese correo ya pertenece a otro cliente/)).toBeVisible();
    await expect(form(page).getByLabel(/^Correo/)).toBeFocused();
    await form(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(profile).toContainText(A.email);

    // Internal note.
    await profile.getByLabel("Nueva nota interna").fill("Prefiere que lo llamen después de las 4 p. m.");
    await profile.getByRole("button", { name: "Agregar nota" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Nota interna agregada." })).toBeVisible();
    await expect(profile.getByText("Prefiere que lo llamen después de las 4 p. m.")).toBeVisible();

    // API guards: stale stamp, missing CSRF, unknown and non-uuid ids.
    const id = (list.items[0] as { id: string }).id;
    const { csrfToken } = (await (await page.request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
    const stale = await page.request.patch(`/api/v1/customers/${id}`, {
      headers: { Origin: origin, "x-csrf-token": csrfToken },
      data: { name: "Nombre viejo", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" },
    });
    expect(stale.status()).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe("STALE_UPDATE");
    const noCsrf = await page.request.post(`/api/v1/customers/${id}/notes`, {
      headers: { Origin: origin },
      data: { body: "Sin CSRF" },
    });
    expect(noCsrf.status()).toBe(403);
    expect((await page.request.get("/api/v1/customers/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
    expect((await page.request.get("/api/v1/customers/not-a-uuid")).status()).toBe(404);

    // Audit entries for customers never carry contact data.
    const audit = await page.request.get(`/api/v1/admin/audit?entity=customer&entityId=${id}`);
    expect(audit.status()).toBe(200);
    const auditText = JSON.stringify(await audit.json());
    expect(auditText).toContain("customers.updated");
    expect(auditText).toContain("customers.note_added");
    expect(auditText).not.toContain("310 555 0101");
    expect(auditText).not.toContain("después de las 4");
    await context.close();
  });

  test("finance reads customers but cannot edit or add notes", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await openProfile(page, A.name);
    await expect(page.getByRole("button", { name: "Editar contacto" })).toHaveCount(0);
    await expect(page.getByLabel("Nueva nota interna")).toHaveCount(0);
    await expect(page.getByText("Prefiere que lo llamen después de las 4 p. m.")).toBeVisible();
    const statuses = await page.evaluate(async (email) => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const list = (await (await fetch(`/api/v1/customers?q=${encodeURIComponent(email)}`)).json()) as {
        items: { id: string; updatedAt: string }[];
      };
      const [item] = list.items;
      const headers = { "content-type": "application/json", "x-csrf-token": session.csrfToken };
      const patch = await fetch(`/api/v1/customers/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: "No permitido", expectedUpdatedAt: item.updatedAt }),
      });
      const note = await fetch(`/api/v1/customers/${item.id}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ body: "No permitido" }),
      });
      return { patch: patch.status, note: note.status };
    }, A.email);
    expect(statuses).toEqual({ patch: 403, note: 403 });
    await context.close();
  });
});
