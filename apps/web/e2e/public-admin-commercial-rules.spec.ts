import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Admin screens for seasons, age bands and promotions against the isolated seeded instance. Every record is named
// "E2E-CR ..." with a timestamp, found by that name (never by position) and deactivated afterwards so the other specs
// (public-builder expects 1.000.000 for 2 adults without season or promotion) keep their prices. Nothing here is bound
// to the price rules of "Paquete Público E2E 3 días". Named public-* so it runs after catalog-cartagena, which saves
// the MFA-complete admin and finance sessions this spec reuses.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const DESTINATION = "Destino Público E2E";
const PREFIX = "E2E-CR";

const openForm = (page: Page) => page.locator("form.admin-commercial-form");
const rowFor = (page: Page, text: string): Locator => page.getByRole("row").filter({ hasText: text });
const notice = (page: Page, text: RegExp | string) => page.getByRole("status").filter({ hasText: text });
const badge = (row: Locator) => row.locator(".admin-badge");

async function openTab(page: Page, tab: string) {
  await page.goto(`/admin/tarifas?tab=${tab}`);
  await expect(page.getByRole("heading", { name: "Tarifas y temporadas", level: 1 })).toBeVisible();
}

async function confirmDialog(page: Page, action: "Aprobar" | "Desactivar", mentions: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(mentions);
  await dialog.getByRole("button", { name: action }).click();
  await expect(dialog).toBeHidden();
}

async function createSeason(page: Page, name: string, from: string, to: string) {
  await page.getByRole("button", { name: "Nueva temporada" }).click();
  const form = openForm(page);
  await form.getByLabel(/^Nombre/).fill(name);
  await form.getByLabel(/^Desde/).fill(from);
  await form.getByLabel(/^Hasta/).fill(to);
  await form.getByLabel(/^Alcance/).selectOption("DESTINATION");
  await form.getByLabel(/^Destino/).selectOption({ label: DESTINATION });
  await form.getByRole("button", { name: "Crear borrador" }).click();
  await expect(notice(page, "Temporada creada como borrador.")).toBeVisible();
}

// Deactivates anything this spec left approved, whatever failed.
async function cleanup(page: Page) {
  await page.goto("/admin/tarifas");
  await page.evaluate(async (prefix) => {
    const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
    for (const kind of ["seasons", "age-rules", "promotions"]) {
      // Collect every approved row first (all pages), then deactivate this spec's rows: deactivating while paging
      // would shift later pages.
      const mine: { id: string; updatedAt: string }[] = [];
      for (let page = 1; page <= 100; page++) {
        const list = (await (
          await fetch(`/api/v1/catalog/${kind}?status=approved&pageSize=50&page=${page}`)
        ).json()) as { items?: { id: string; name: string; updatedAt: string }[] };
        const items = list.items ?? [];
        mine.push(...items.filter((item) => item.name.startsWith(prefix)));
        if (items.length < 50) break;
      }
      for (const item of mine) {
        await fetch(`/api/v1/catalog/${kind}/${item.id}/deactivate`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
          body: JSON.stringify({ expectedUpdatedAt: item.updatedAt }),
        });
      }
    }
  }, PREFIX);
}

type Preview = {
  status: string;
  totalCents: string | null;
  notices: string[];
  promotion: { code: string; discountCents: string } | null;
};

test.describe("Admin commercial rules", () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    await cleanup(await context.newPage());
    await context.close();
  });

  test("seasons: validation, create, edit, approve, overlap, deactivate, history", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const first = `${PREFIX} temporada ${stamp}`;
    const renamed = `${first} editada`;
    const second = `${PREFIX} temporada solapada ${stamp}`;

    await openTab(page, "temporadas");
    await expect(page.getByRole("link", { name: "Temporadas", exact: true })).toHaveAttribute("aria-current", "page");

    // Inline validation: empty form shows field errors and focuses the first invalid field.
    await page.getByRole("button", { name: "Nueva temporada" }).click();
    await openForm(page).getByRole("button", { name: "Crear borrador" }).click();
    await expect(openForm(page).getByLabel(/^Nombre/)).toBeFocused();
    await expect(openForm(page).getByText("El nombre debe tener al menos 2 caracteres.")).toBeVisible();
    await expect(openForm(page).getByText("Ingresa la fecha inicial (AAAA-MM-DD).")).toBeVisible();
    await openForm(page).getByRole("button", { name: "Cancelar" }).click();

    await createSeason(page, first, "2031-06-01", "2031-06-15");
    let row = rowFor(page, first);
    await expect(badge(row)).toHaveText("Borrador");

    // Only drafts are editable.
    await row.getByRole("button", { name: /^Editar/ }).click();
    await expect(page.getByRole("heading", { name: /^Editar borrador:/ })).toBeVisible();
    await openForm(page)
      .getByLabel(/^Nombre/)
      .fill(renamed);
    await openForm(page)
      .getByLabel(/^Notas/)
      .fill("Notas E2E");
    await openForm(page).getByRole("button", { name: "Guardar borrador" }).click();
    await expect(notice(page, "Temporada guardada como borrador.")).toBeVisible();
    row = rowFor(page, renamed);
    await expect(row).toContainText("01/06/2031 al 15/06/2031");

    // Approval goes through the in-page dialog that says what becomes public.
    await row.getByRole("button", { name: /^Aprobar/ }).click();
    await confirmDialog(page, "Aprobar", renamed);
    await expect(notice(page, "Temporada aprobada.")).toBeVisible();
    await expect(badge(row)).toHaveText("Aprobada");
    await expect(row.getByRole("button", { name: /^Editar/ })).toHaveCount(0);
    await expect(row).toContainText("desactivar y crear nueva");

    // A second season that overlaps in the same scope cannot be approved.
    await createSeason(page, second, "2031-06-10", "2031-06-20");
    const overlapping = rowFor(page, second);
    await overlapping.getByRole("button", { name: /^Aprobar/ }).click();
    await confirmDialog(page, "Aprobar", second);
    await expect(page.getByRole("alert").filter({ hasText: /se cruza con otra temporada aprobada/ })).toBeVisible();
    await expect(badge(overlapping)).toHaveText("Borrador");

    // Deactivate the first one and read its history.
    await row.getByRole("button", { name: /^Desactivar/ }).click();
    await confirmDialog(page, "Desactivar", renamed);
    await expect(notice(page, "Temporada desactivada.")).toBeVisible();
    await expect(badge(row)).toHaveText("Inactiva");
    await row.getByRole("button", { name: /^Historial/ }).click();
    const history = page.getByRole("region", { name: new RegExp(`^Historial: ${renamed}`) });
    await expect(history).toContainText("Creada como borrador");
    await expect(history).toContainText("Borrador editado");
    await expect(history).toContainText("Aprobada");
    await expect(history).toContainText("Desactivada");
    await context.close();
  });

  test("age bands: create 2 to 11 years and approve", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const name = `${PREFIX} niños ${stamp}`;
    await openTab(page, "edades");

    await page.getByRole("button", { name: "Nueva banda de edad" }).click();
    const form = openForm(page);
    await form.getByLabel(/^Nombre/).fill(name);
    await form.getByLabel(/^Edad mínima/).fill("12");
    await form.getByLabel(/^Edad máxima/).fill("11");
    await form.getByLabel(/^Alcance/).selectOption("DESTINATION");
    await form.getByLabel(/^Destino/).selectOption({ label: DESTINATION });
    await form.getByRole("button", { name: "Crear borrador" }).click();
    await expect(form.getByText("La edad mínima no puede superar la máxima.")).toBeVisible();
    await form.getByLabel(/^Edad mínima/).fill("2");
    await form.getByRole("button", { name: "Crear borrador" }).click();
    await expect(notice(page, "Banda de edad creada como borrador.")).toBeVisible();

    const row = rowFor(page, name);
    await expect(row).toContainText("2 a 11 años");
    await expect(row).toContainText("Niño");
    await row.getByRole("button", { name: /^Aprobar/ }).click();
    await confirmDialog(page, "Aprobar", name);
    await expect(notice(page, "Banda de edad aprobada.")).toBeVisible();
    await expect(badge(row)).toHaveText("Aprobada");
    await context.close();
  });

  test("promotions: a code applies in the public quote only while approved", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const code = `CR${stamp}`;
    const name = `${PREFIX} promoción ${stamp}`;
    await openTab(page, "promociones");

    await page.getByRole("button", { name: "Nueva promoción" }).click();
    const form = openForm(page);
    await form.getByLabel(/^Código/).fill(code.toLowerCase());
    await form.getByLabel(/^Nombre/).fill(name);
    await form.getByLabel(/^Porcentaje/).fill("15");
    await form.getByLabel(/^Vigente desde/).fill("2024-01-01");
    await form.getByLabel(/^Vigente hasta/).fill("2035-12-31");
    await form.getByLabel(/^Alcance/).selectOption("DESTINATION");
    await form.getByLabel(/^Destino/).selectOption({ label: DESTINATION });
    await form.getByRole("button", { name: "Crear borrador" }).click();
    await expect(notice(page, "Promoción creada como borrador.")).toBeVisible();
    const row = rowFor(page, name);
    await expect(row).toContainText(code);
    await expect(row).toContainText("15 %");

    // Public context: ids from the public catalog, same endpoint the wizard uses.
    const destinations = (await (await page.request.get("/api/v1/public/destinations")).json()) as {
      name: string;
      packages: { id: string; name: string }[];
    }[];
    const pkg = destinations
      .find((item) => item.name === DESTINATION)
      ?.packages.find((item) => item.name.includes("3 días"));
    expect(pkg).toBeTruthy();
    const builder = (await (await page.request.get(`/api/v1/public/packages/${pkg!.id}/builder`)).json()) as {
      hotels: { id: string; name: string; roomTypes: { id: string; name: string }[] }[];
      transportOptions: { id: string }[];
    };
    const hotel = builder.hotels.find((item) => item.name.includes("Hotel Público E2E"));
    const room = hotel?.roomTypes.find((item) => item.name.includes("Doble Público E2E"));
    expect(room).toBeTruthy();
    const quote = async (patch: Record<string, unknown> = {}, withTransport = false) => {
      const response = await page.request.post("/api/v1/public/quote-preview", {
        data: {
          packageId: pkg!.id,
          hotelId: hotel!.id,
          roomTypeId: room!.id,
          adults: 2,
          childAges: [],
          ...(withTransport && builder.transportOptions[0]
            ? { transportOptionId: builder.transportOptions[0].id }
            : {}),
          ...patch,
        },
      });
      expect(response.status()).toBe(200);
      return (await response.json()) as Preview;
    };
    let withTransport = false;
    let base = await quote();
    if (base.status !== "PRICED") {
      withTransport = true;
      base = await quote({}, true);
    }
    expect(base.status).toBe("PRICED");
    const subtotal = BigInt(base.totalCents!);

    // Draft codes never apply.
    expect((await quote({ promotionCode: code }, withTransport)).promotion).toBeNull();

    await row.getByRole("button", { name: /^Aprobar/ }).click();
    await confirmDialog(page, "Aprobar", code);
    await expect(notice(page, "Promoción aprobada.")).toBeVisible();
    await expect(badge(row)).toHaveText("Aprobada");

    const applied = await quote({ promotionCode: code }, withTransport);
    const discount = (subtotal * BigInt(15)) / BigInt(100);
    expect(applied.promotion).toMatchObject({ code, discountCents: discount.toString() });
    expect(applied.totalCents).toBe((subtotal - discount).toString());

    await row.getByRole("button", { name: /^Desactivar/ }).click();
    await confirmDialog(page, "Desactivar", code);
    await expect(notice(page, "Promoción desactivada.")).toBeVisible();
    await expect(badge(row)).toHaveText("Inactiva");

    const after = await quote({ promotionCode: code }, withTransport);
    expect(after.promotion).toBeNull();
    expect(after.totalCents).toBe(subtotal.toString());
    await context.close();
  });

  test("finance cannot read or approve commercial rules", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await page.goto("/admin/tarifas?tab=promociones");
    await expect(page.getByRole("heading", { name: "Tarifas y temporadas" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Aprobar/ })).toHaveCount(0);
    const statuses = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const id = "00000000-0000-4000-8000-000000000000";
      const read = await fetch("/api/v1/catalog/promotions");
      const approve = await fetch(`/api/v1/catalog/seasons/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ expectedUpdatedAt: new Date().toISOString() }),
      });
      return { read: read.status, approve: approve.status };
    });
    expect(statuses).toEqual({ read: 403, approve: 403 });
    await context.close();
  });
});
