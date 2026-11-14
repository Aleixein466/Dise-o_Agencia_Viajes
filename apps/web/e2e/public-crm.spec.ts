import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminStatePath } from "./e2e-state";

// E2E 4 — CRM. Runs after catalog-cartagena.spec.ts (alphabetical order, 1 worker), reusing its admin session.
test.use({ storageState: adminStatePath });

test("CRM: staff receives, assigns, annotates and advances a public request", async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3201").origin;

  // A fresh public request, created exactly as the wizard does.
  const destinations = (await (await page.request.get("/api/v1/public/destinations")).json()) as Array<{
    name: string;
    packages: Array<{ id: string }>;
  }>;
  const packageId = destinations.find((d) => d.name === "Destino Público E2E")?.packages[0]?.id;
  expect(packageId).toBeTruthy();
  const builder = (await (await page.request.get(`/api/v1/public/packages/${packageId}/builder`)).json()) as {
    hotels: Array<{ id: string; roomTypes: Array<{ id: string }> }>;
  };
  const created = await page.request.post("/api/v1/public/quote-requests", {
    headers: { Origin: origin },
    data: {
      packageId,
      hotelId: builder.hotels[0].id,
      roomTypeId: builder.hotels[0].roomTypes[0].id,
      adults: 2,
      childAges: [],
      optionalTourIds: [],
      addOnIds: [],
      contact: { name: "Cliente CRM E2E", email: "crm@publico-e2e.ricaurte.test", phone: "3000000001" },
      dataConsent: true,
      idempotencyKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const { reference } = (await created.json()) as { reference: string };

  // Inbox: search, open detail with contact (admin has customers:read).
  await page.goto("/admin/solicitudes");
  await page.getByPlaceholder("Buscar por referencia").fill(reference);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("button", { name: `Ver solicitud ${reference}` }).click();
  await expect(page.getByRole("heading", { name: `Solicitud ${reference}` })).toBeVisible();
  await expect(page.getByText(/Cliente CRM E2E · crm@publico-e2e\.ricaurte\.test/)).toBeVisible();

  // Assign → status moves to ASSIGNED.
  await page.getByRole("combobox", { name: "Asesor", exact: true }).selectOption({ label: "Operador Temporal" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByText("Asesor actual: Operador Temporal")).toBeVisible();

  // Internal note.
  await page.getByLabel("Nota interna").fill("Llamar en la tarde para confirmar fechas.");
  await page.getByRole("button", { name: "Agregar nota" }).click();
  await expect(page.getByText("Llamar en la tarde para confirmar fechas.")).toBeVisible();

  // Advance status.
  await page.getByRole("combobox", { name: "Nuevo estado" }).selectOption("PROPOSAL_SENT");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.locator(".admin-users .admin-role").first()).toHaveText("Propuesta enviada");

  // Server state, optimistic concurrency and audit trail.
  const list = (await (await page.request.get(`/api/v1/crm/requests?q=${reference}`)).json()) as {
    items: Array<{ id: string }>;
  };
  const id = list.items[0].id;
  const detail = (await (await page.request.get(`/api/v1/crm/requests/${id}`)).json()) as {
    status: string;
    revision: number;
    assignee: { name: string } | null;
    crmNotes: unknown[];
    history: Array<{ action: string }>;
  };
  expect(detail).toMatchObject({ status: "PROPOSAL_SENT", assignee: { name: "Operador Temporal" } });
  expect(detail.crmNotes).toHaveLength(1);
  const actions = detail.history.map((h) => h.action);
  expect(actions).toEqual(expect.arrayContaining(["crm.assigned", "crm.note_added", "crm.status_changed"]));

  const { csrfToken: csrf } = (await (await page.request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
  expect(csrf).toBeTruthy();
  const stale = await page.request.post(`/api/v1/crm/requests/${id}/status`, {
    headers: { Origin: origin, "x-csrf-token": csrf },
    data: { status: "ACCEPTED", expectedRevision: detail.revision - 1 },
  });
  expect(stale.status()).toBe(409);
  const noCsrf = await page.request.post(`/api/v1/crm/requests/${id}/status`, {
    headers: { Origin: origin },
    data: { status: "ACCEPTED", expectedRevision: detail.revision },
  });
  expect(noCsrf.status()).toBe(403);
});
