import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Admin screen for transport options against the isolated seeded instance. Every record is named "E2E-TR ..." with a
// timestamp and found by name across pages (never by position). Options are never attached to any package, and every
// one is left inactive afterwards so the public builder keeps offering no transport. Named public-* so it runs after
// catalog-cartagena, which saves the MFA-complete admin and finance sessions this spec reuses.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const DESTINATION = "Destino Público E2E";
const PREFIX = "E2E-TR";

const form = (page: Page) => page.locator("form.admin-commercial-form");
const notice = (page: Page, text: RegExp | string) => page.getByRole("status").filter({ hasText: text });

// The list is paginated and sorted by name: walk the pages until the row with this name shows up.
async function findRow(page: Page, name: string): Promise<Locator> {
  const row = () => page.getByRole("row").filter({ hasText: name });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await row().count()) return row();
    const next = page.getByRole("button", { name: "Siguiente" });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(row()).toBeVisible();
  return row();
}

async function openPage(page: Page) {
  await page.goto("/admin/transporte");
  await expect(page.getByRole("heading", { name: "Transporte", level: 1 })).toBeVisible();
}

async function fillAndSubmit(page: Page, name: string, submit: string) {
  await form(page)
    .getByLabel(/^Nombre/)
    .fill(name);
  await form(page).getByRole("button", { name: submit }).click();
}

// Deactivates anything this spec left active, whatever failed.
async function cleanup(page: Page) {
  await page.goto("/admin/transporte");
  await page.evaluate(async (prefix) => {
    const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
    const mine: { id: string; updatedAt: string }[] = [];
    for (let current = 1; current <= 100; current++) {
      const list = (await (
        await fetch(`/api/v1/catalog/transport-options?status=active&pageSize=50&page=${current}`)
      ).json()) as {
        items?: { id: string; name: string; updatedAt: string }[];
      };
      const items = list.items ?? [];
      mine.push(...items.filter((item) => item.name.startsWith(prefix)));
      if (items.length < 50) break;
    }
    for (const item of mine)
      await fetch(`/api/v1/catalog/transport-options/${item.id}/deactivate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ expectedUpdatedAt: item.updatedAt }),
      });
  }, PREFIX);
}

test.describe("Admin transport options", () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    await cleanup(await context.newPage());
    await context.close();
  });

  test("create, duplicate name, edit, deactivate and history", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const name = `${PREFIX} lancha ${stamp}`;
    const renamed = `${name} editada`;

    await openPage(page);

    // Inline validation: the empty form shows field errors and focuses the first invalid field.
    await page.getByRole("button", { name: "Nueva opción" }).click();
    await form(page).getByRole("button", { name: "Crear opción" }).click();
    await expect(form(page).getByLabel(/^Destino/)).toBeFocused();
    await expect(form(page).getByText("Elige un destino.")).toBeVisible();
    await expect(form(page).getByText("El nombre debe tener al menos 2 caracteres.")).toBeVisible();

    // Create.
    await form(page)
      .getByLabel(/^Destino/)
      .selectOption({ label: DESTINATION });
    await form(page)
      .getByLabel(/^Modo de transporte/)
      .selectOption("SEA");
    await form(page)
      .getByLabel(/^Descripción/)
      .fill("Traslado en lancha E2E");
    await fillAndSubmit(page, name, "Crear opción");
    await expect(notice(page, "Opción de transporte creada.")).toBeVisible();
    let row = await findRow(page, name);
    await expect(row).toContainText(DESTINATION);
    await expect(row).toContainText("Marítimo");
    await expect(row.locator(".admin-badge")).toHaveText("Activa");

    // Same destination, mode and name again is rejected inline and the form stays open.
    await page.getByRole("button", { name: "Nueva opción" }).click();
    await form(page)
      .getByLabel(/^Destino/)
      .selectOption({ label: DESTINATION });
    await form(page)
      .getByLabel(/^Modo de transporte/)
      .selectOption("SEA");
    await fillAndSubmit(page, name, "Crear opción");
    await expect(form(page).getByText(/Ya existe una opción con ese nombre/)).toBeVisible();
    await expect(form(page).getByLabel(/^Nombre/)).toBeFocused();
    await form(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(form(page)).toHaveCount(0);

    // Edit.
    row = await findRow(page, name);
    await row.getByRole("button", { name: /^Editar/ }).click();
    await expect(page.getByRole("heading", { name: /^Editar opción:/ })).toBeVisible();
    await fillAndSubmit(page, renamed, "Guardar cambios");
    await expect(notice(page, "Opción de transporte guardada.")).toBeVisible();
    row = await findRow(page, renamed);

    // Deactivate through the in-page dialog; nothing is deleted.
    await row.getByRole("button", { name: /^Desactivar/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(renamed);
    await dialog.getByRole("button", { name: "Desactivar" }).click();
    await expect(dialog).toBeHidden();
    await expect(notice(page, "Opción de transporte desactivada.")).toBeVisible();
    row = await findRow(page, renamed);
    await expect(row.locator(".admin-badge")).toHaveText("Inactiva");
    await expect(row.getByRole("button", { name: /^Activar/ })).toBeVisible();

    // History shows every mutation with its changes.
    await row.getByRole("button", { name: /^Historial de/ }).click();
    const history = page.locator("section").filter({
      has: page.getByRole("heading", { name: `Historial: ${renamed}` }),
    });
    await expect(history).toContainText("Creada");
    await expect(history).toContainText("Editada");
    await expect(history).toContainText("Desactivada");
    await expect(history).toContainText(`Nombre: ${name} → ${renamed}`);
    await expect(history).toContainText("Estado: Activa → Inactiva");
    await context.close();
  });

  test("finance has no access to transport options", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await page.goto("/admin/transporte");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva opción" })).toHaveCount(0);
    const statuses = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const read = await fetch("/api/v1/catalog/transport-options");
      const create = await fetch("/api/v1/catalog/transport-options", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({
          destinationId: "00000000-0000-4000-8000-000000000000",
          mode: "AIR",
          name: "No permitido",
        }),
      });
      return { read: read.status, create: create.status };
    });
    expect(statuses).toEqual({ read: 403, create: 403 });
    await context.close();
  });
});
