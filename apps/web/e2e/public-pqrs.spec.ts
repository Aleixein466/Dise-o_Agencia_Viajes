import { expect, test } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// E2E — PQRS. Public intake + tracking (no session), staff answer in /admin/pqrs, FINANCE denied.
// Runs after catalog-cartagena.spec.ts (alphabetical order, 1 worker), reusing its staff sessions.

test("PQRS: public intake, staff answer with internal note, public tracking without notes", async ({ browser }) => {
  const anonymous = await browser.newContext();
  const pub = await anonymous.newPage();
  await pub.goto("/pqrs");
  await pub.getByLabel("Tipo de solicitud *").selectOption("COMPLAINT");
  await pub.getByLabel("Asunto *").fill("Demora en la confirmación (E2E)");
  await pub
    .getByLabel("Descripción *")
    .fill("Solicitud ficticia de prueba E2E: la confirmación tardó más de lo esperado.");
  await pub.getByLabel("Nombre completo *").fill("Solicitante PQRS E2E");
  await pub.getByLabel("Correo electrónico *").fill("pqrs@publico-e2e.ricaurte.test");
  await pub.getByRole("checkbox", { name: /Autorizo el tratamiento/ }).check();
  await pub.getByRole("button", { name: "Radicar PQRS" }).click();
  await expect(pub.getByRole("heading", { name: "Recibimos tu PQRS" })).toBeVisible();
  const codes = pub.locator(".wz-code");
  const reference = (await codes.nth(0).innerText()).trim();
  const trackingCode = (await codes.nth(1).innerText()).trim();
  expect(reference).toMatch(/^PQR-[0-9A-F]{12}$/);
  expect(trackingCode).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);

  // Wrong code: uniform 404, nothing disclosed.
  const wrong = await pub.request.post("/api/v1/public/pqrs/track", {
    data: { reference, trackingCode: "AAAA-AAAA-AAAA-AAAA" },
  });
  expect(wrong.status()).toBe(404);

  // Staff: answer publicly, add an internal note, mark as answered.
  const staffContext = await browser.newContext({ storageState: adminStatePath });
  const admin = await staffContext.newPage();
  await admin.goto("/admin/pqrs");
  await expect(admin.getByRole("heading", { name: "Bandeja de PQRS" })).toBeVisible();
  await admin.getByRole("button", { name: `Ver detalle de ${reference}` }).click();
  await expect(admin.getByRole("heading", { name: new RegExp(reference) })).toBeVisible();
  await admin.getByLabel("Cambiar estado a").selectOption("IN_REVIEW");
  await admin.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(admin.getByText("Estado actualizado.")).toBeVisible();

  await admin.getByLabel("Mensaje").fill("Hola, revisamos tu caso y la confirmación ya fue enviada.");
  await admin.getByRole("button", { name: "Enviar respuesta" }).click();
  await expect(admin.getByText("Respuesta enviada al solicitante.")).toBeVisible();
  await expect(admin.getByText("Hola, revisamos tu caso y la confirmación ya fue enviada.")).toBeVisible();

  await admin.getByLabel("Mensaje").fill("Nota interna E2E: no mostrar al solicitante.");
  await admin.getByRole("checkbox", { name: /Nota interna/ }).check();
  await admin.getByRole("button", { name: "Guardar nota interna" }).click();
  await expect(admin.getByText("Nota interna guardada.")).toBeVisible();
  await expect(admin.getByText("Nota interna E2E: no mostrar al solicitante.")).toBeVisible();

  await admin.getByLabel("Cambiar estado a").selectOption("ANSWERED");
  await admin.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(admin.locator(".admin-hint").filter({ hasText: "Respondida" }).first()).toBeVisible();

  // Stale version is refused (optimistic concurrency).
  const { csrfToken } = (await (await admin.request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
  const list = (await (await admin.request.get("/api/v1/pqrs?status=ANSWERED")).json()) as {
    items: Array<{ id: string; reference: string }>;
  };
  const ticketId = list.items.find((item) => item.reference === reference)?.id;
  expect(ticketId).toBeTruthy();
  const origin = new URL(admin.url()).origin;
  const stale = await admin.request.post(`/api/v1/pqrs/${ticketId}/status`, {
    headers: { "x-csrf-token": csrfToken, Origin: origin },
    data: { status: "CLOSED", expectedVersion: 0 },
  });
  expect(stale.status()).toBe(409);

  // FINANCE has no PQRS permissions.
  const financeContext = await browser.newContext({ storageState: financeStatePath });
  const denied = await financeContext.request.get(`/api/v1/pqrs/${ticketId}`);
  expect(denied.status()).toBe(403);

  // Public tracking shows the answer and status, never the internal note.
  await pub.goto("/pqrs");
  await pub.getByLabel("Referencia").fill(reference);
  await pub.getByLabel("Código de seguimiento").fill(trackingCode);
  await pub.getByRole("button", { name: "Consultar PQRS" }).click();
  await expect(pub.getByText("Hola, revisamos tu caso y la confirmación ya fue enviada.")).toBeVisible();
  await expect(pub.getByText("Respondida").first()).toBeVisible();
  await expect(pub.getByText("Nota interna E2E")).toHaveCount(0);
  const tracked = await pub.request.post("/api/v1/public/pqrs/track", { data: { reference, trackingCode } });
  expect(JSON.stringify(await tracked.json())).not.toContain("Nota interna E2E");

  await Promise.all([anonymous.close(), staffContext.close(), financeContext.close()]);
});
