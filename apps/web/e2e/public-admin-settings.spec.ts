import { expect, test, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Admin agency settings against the isolated seeded instance. The singleton is restored to what it held before
// the spec ran. Named public-* so it runs after catalog-cartagena, which saves the MFA-complete admin and finance
// sessions this spec reuses.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
type Snapshot = Record<string, string | null> & { updatedAt: string | null };
const FIELDS = [
  "tradeName",
  "legalName",
  "nit",
  "rnt",
  "rntValidUntil",
  "address",
  "city",
  "phone",
  "whatsapp",
  "contactEmail",
  "bookingsEmail",
  "businessHours",
  "facebookUrl",
  "instagramUrl",
  "tiktokUrl",
  "youtubeUrl",
];

let original: Snapshot | null = null;

const read = (page: Page) =>
  page.evaluate(async () => (await (await fetch("/api/v1/settings/agency")).json()) as Snapshot);

async function restore(page: Page) {
  if (!original) return;
  await page.goto("/admin/configuracion");
  await page.evaluate(
    async ({ snapshot, fields }) => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const current = (await (await fetch("/api/v1/settings/agency")).json()) as { updatedAt: string | null };
      const body: Record<string, string | null> = {};
      for (const field of fields) body[field] = snapshot[field] ?? null;
      await fetch("/api/v1/settings/agency", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ ...body, expectedUpdatedAt: current.updatedAt }),
      });
      // This writes through the API directly, so refresh the cached public pages the way the admin UI does.
      await fetch("/api/revalidate-content", { method: "POST", headers: { "x-csrf-token": session.csrfToken } });
    },
    { snapshot: original, fields: FIELDS },
  );
}

test.describe("Admin agency settings", () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    await restore(await context.newPage());
    await context.close();
  });

  test("validate, save, persist, public profile without internal data, history and secrets refusal", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
    await expect(page.getByText(/variables de entorno/).first()).toBeVisible();
    const form = page.locator("form.admin-commercial-form");
    await expect(form).toBeVisible();
    original = await read(page);

    // Invalid values are reported inline and focus moves to the first invalid field.
    await form.getByLabel(/^Correo de contacto/).fill("no-es-correo");
    await form.getByLabel(/^Facebook/).fill("javascript:alert(1)");
    await form.getByLabel(/^Teléfono/).fill("abc");
    await form.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(form.getByText("Escribe un correo válido, por ejemplo nombre@dominio.com.")).toBeVisible();
    await expect(form.getByText("Escribe una dirección que empiece por http:// o https://.")).toBeVisible();
    await expect(form.getByText(/Usa solo dígitos y un \+ inicial opcional/)).toBeVisible();
    await expect(form.getByLabel(/^Teléfono/)).toBeFocused();

    // Valid save.
    const name = `E2E-ST Agencia ${stamp}`;
    await form.getByLabel(/^Nombre comercial/).fill(name);
    await form.getByLabel(/^Teléfono/).fill("+57 (300) 123-4567");
    await form.getByLabel(/^Correo de contacto/).fill("Info@Example.com");
    await form.getByLabel(/^Correo de reservas/).fill("reservas-interno@example.com");
    await form.getByLabel(/^Facebook/).fill("https://facebook.com/agencia-e2e");
    await form.getByLabel(/^WhatsApp/).fill("+57 301 555 0100");
    await form.getByLabel(/^Horario de atención/).fill("Lunes a viernes E2E");
    await form.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Configuración guardada." })).toBeVisible();
    await expect(form.getByLabel(/^Teléfono/)).toHaveValue("+573001234567");
    await expect(form.getByLabel(/^Correo de contacto/)).toHaveValue("info@example.com");

    // Persisted after a reload.
    await page.reload();
    await expect(page.locator("form.admin-commercial-form").getByLabel(/^Nombre comercial/)).toHaveValue(name);

    // The public profile exposes business data only, never the internal mailbox.
    const profile = await page.evaluate(
      async () => (await (await fetch("/api/v1/public/agency")).json()) as Record<string, unknown>,
    );
    expect(profile).toMatchObject({ tradeName: name, phone: "+573001234567", contactEmail: "info@example.com" });
    expect(JSON.stringify(profile)).not.toContain("reservas-interno@example.com");
    expect(profile).not.toHaveProperty("bookingsEmail");

    // The public site shows the saved channels (the cache is refreshed on save) and never the internal mailbox.
    const visitor = await (await browser.newContext()).newPage();
    await expect
      .poll(
        async () => {
          await visitor.goto("/contacto");
          return visitor.locator('a[href="https://wa.me/573015550100"]').count();
        },
        { timeout: 60_000, intervals: [3_000] },
      )
      .toBeGreaterThan(0);
    await expect(visitor.locator('a[href="mailto:info@example.com"]').first()).toBeVisible();
    await expect(visitor.locator('a[href="tel:+573001234567"]').first()).toBeVisible();
    await expect(visitor.getByText("Lunes a viernes E2E").first()).toBeVisible();
    await expect(visitor.locator("footer").locator('a[href="https://facebook.com/agencia-e2e"]')).toBeVisible();
    expect(await visitor.content()).not.toContain("reservas-interno@example.com");
    await visitor.context().close();

    // History lists which fields changed, without exposing contact values.
    await page.getByRole("button", { name: "Historial" }).click();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Historial:/ }) });
    await expect(history).toContainText("Campos modificados:");
    await expect(history).toContainText("Nombre comercial");
    await expect(history).not.toContainText("reservas-interno@example.com");

    // The API refuses anything that looks like a secret.
    const secret = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const current = (await (await fetch("/api/v1/settings/agency")).json()) as { updatedAt: string | null };
      const response = await fetch("/api/v1/settings/agency", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ tradeName: "No", smtpPassword: "x", expectedUpdatedAt: current.updatedAt }),
      });
      return { status: response.status, body: (await response.json()) as { code?: string } };
    });
    expect(secret.status).toBe(400);
    expect(secret.body.code).toBe("SECRETS_NOT_ALLOWED");
    expect((await read(page)).tradeName).toBe(name);
    await context.close();
  });

  test("a stale save is rejected and the form reloads", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    await page.goto("/admin/configuracion");
    const form = page.locator("form.admin-commercial-form");
    await expect(form).toBeVisible();
    // Another session saves first.
    await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const current = (await (await fetch("/api/v1/settings/agency")).json()) as { updatedAt: string | null };
      await fetch("/api/v1/settings/agency", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ city: "Ciudad E2E", expectedUpdatedAt: current.updatedAt }),
      });
    });
    await form.getByLabel(/^Dirección/).fill("Calle E2E 1");
    await form.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByText(/Otra persona modificó la configuración/)).toBeVisible();
    await expect(page.locator("form.admin-commercial-form").getByLabel(/^Ciudad/)).toHaveValue("Ciudad E2E");
    await context.close();
  });

  test("finance has no access to settings", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    const statuses = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const read = await fetch("/api/v1/settings/agency");
      const write = await fetch("/api/v1/settings/agency", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ tradeName: "No permitido", expectedUpdatedAt: null }),
      });
      return { read: read.status, write: write.status };
    });
    expect(statuses).toEqual({ read: 403, write: 403 });
    await context.close();
  });
});
