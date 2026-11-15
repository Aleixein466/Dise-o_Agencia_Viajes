import { expect, test } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Read-only audit log viewer against the isolated seeded instance. Named public-* so it runs after
// catalog-cartagena, which saves the MFA-complete admin and finance sessions and leaves price_rule audit rows behind.
// It never assumes a row position: it asks the API which price_rule event has a before/after snapshot and then finds
// that event in the UI through the entity and entity-id filters.
type Event = { id: string; action: string; entity: string; entityId: string; before: unknown; after: unknown };
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

test("ADMIN filters the audit log, expands a row and sees a redacted before/after", async ({ browser }) => {
  const context = await browser.newContext({ storageState: adminStatePath });
  const api = await context.request.get("/api/v1/admin/audit?entity=price_rule&pageSize=50");
  expect(api.status()).toBe(200);
  const text = await api.text();
  expect(text).not.toContain("ipHash");
  expect(text).not.toMatch(EMAIL);
  expect(text).not.toMatch(/"password[^"]*"\s*:\s*"(?!\[oculto\])/i);
  const body = JSON.parse(text) as { items: Event[]; total: number };
  expect(body.total).toBeGreaterThan(0);
  const target = body.items.find((item) => item.before && item.after) ?? body.items.find((item) => item.after);
  expect(target, "a price_rule audit event with a snapshot").toBeTruthy();
  if (!target) return;

  const facets = await context.request.get("/api/v1/admin/audit/facets");
  expect(facets.status()).toBe(200);
  expect(((await facets.json()) as { entities: string[] }).entities).toContain("price_rule");

  const page = await context.newPage();
  await page.goto("/admin/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoría", level: 1 })).toBeVisible();
  await expect(page.getByText("Módulo en construcción")).toHaveCount(0);

  await page.getByLabel("Entidad", { exact: true }).selectOption("price_rule");
  await page.getByLabel("ID de la entidad").fill(target.entityId);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("status").filter({ hasText: /\d+ eventos?/ })).toBeVisible();

  const table = page.getByRole("region", { name: "Tabla de eventos de auditoría" });
  const row = table.getByRole("row").filter({ hasText: target.action }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("price_rule");
  await expect(row).toContainText(target.entityId);

  const toggle = row.getByRole("button", { name: /^Ver detalle/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(row.getByRole("button", { name: /^Ocultar detalle/ })).toHaveAttribute("aria-expanded", "true");
  const diff = page.getByRole("table", { name: "Cambios del evento" });
  await expect(diff).toBeVisible();
  await expect(diff.getByRole("columnheader", { name: "Antes" })).toBeVisible();
  await expect(diff.getByRole("columnheader", { name: "Después" })).toBeVisible();
  await expect(diff.getByRole("row")).not.toHaveCount(1);

  // A filter with no match shows the empty state; an invalid one is rejected before any request.
  await page.getByLabel("ID de la entidad").fill("no-existe-e2e-audit");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("No hay eventos de auditoría para esos filtros.")).toBeVisible();
  await page.getByLabel("Actor (ID)").fill("no-es-uuid");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("Ingresa un identificador válido (UUID).")).toBeVisible();
  await context.close();
});

test("FINANCE gets 403 from the audit API and a Sin permiso page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: financeStatePath });
  expect((await context.request.get("/api/v1/admin/audit")).status()).toBe(403);
  expect((await context.request.get("/api/v1/admin/audit/facets")).status()).toBe(403);
  const page = await context.newPage();
  await page.goto("/admin/auditoria");
  await expect(page.getByRole("heading", { name: "Sin permiso", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toHaveCount(0);
  await context.close();
});
