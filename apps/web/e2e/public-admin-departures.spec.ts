import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Manual cupos against the isolated seeded instance. Each run creates one departure on a timestamp-derived date of the
// "Destino Público E2E" package (unpublished, no price: public pricing never reads departures), holds, races, releases
// and checks the history. All held seats are released before the test ends. Named public-* so it runs after
// catalog-cartagena, which saves the MFA-complete admin and finance sessions this spec reuses.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const start = new Date(Date.UTC(2031, 0, 1) + (Math.floor(stamp / 1000) % 3650) * 86_400_000);
const end = new Date(start.getTime() + 3 * 86_400_000);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shown = (date: Date) => iso(date).split("-").reverse().join("/");
const LABEL = `${shown(start)} – ${shown(end)}`;
const form = (page: Page) => page.locator("form.admin-commercial-form");
const notice = (page: Page, text: RegExp | string) => page.getByRole("status").filter({ hasText: text });

async function packageId(page: Page) {
  const destinations = (await (await page.request.get("/api/v1/public/destinations")).json()) as Array<{
    name: string;
    packages: Array<{ id: string }>;
  }>;
  const id = destinations.find((d) => d.name === "Destino Público E2E")?.packages[0]?.id;
  expect(id).toBeTruthy();
  return id as string;
}

async function findRow(page: Page): Promise<Locator> {
  const row = () => page.getByRole("row").filter({ hasText: LABEL });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await row().count()) return row();
    const next = page.getByRole("button", { name: "Siguiente" });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(row()).toBeVisible();
  return row();
}

async function changeSeats(page: Page, action: "Retener" | "Liberar", seats: string, reason: string) {
  const row = await findRow(page);
  await row.getByRole("button", { name: `${action} cupos de la salida ${LABEL}` }).click();
  await form(page)
    .getByLabel(/^Cupos/)
    .fill(seats);
  await form(page)
    .getByLabel(/^Motivo/)
    .fill(reason);
  await form(page)
    .getByRole("button", { name: `${action} cupos` })
    .click();
}

test.describe("Admin cupos", () => {
  test("create, hold, overbooking race, capacity floor, release and history", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3201").origin;
    const pkg = await packageId(page);

    await page.goto("/admin/cupos");
    await expect(page.getByRole("heading", { name: "Cupos", level: 1 })).toBeVisible();
    await expect(page.getByText(/La capacidad es manual/)).toBeVisible();
    await page.getByLabel("Paquete", { exact: true }).selectOption(pkg);

    // Inline validation, then create with a manual capacity of 4.
    await page.getByRole("button", { name: "Nueva salida" }).click();
    await form(page).getByRole("button", { name: "Crear salida" }).click();
    await expect(form(page).getByLabel(/^Fecha de salida/)).toBeFocused();
    await expect(form(page).getByText("Elige la fecha de salida.")).toBeVisible();
    await form(page)
      .getByLabel(/^Fecha de salida/)
      .fill(iso(start));
    await form(page)
      .getByLabel(/^Fecha de regreso/)
      .fill(iso(end));
    await form(page)
      .getByLabel(/^Capacidad/)
      .fill("4");
    await form(page)
      .getByLabel(/^Disponibilidad/)
      .selectOption("AVAILABLE");
    await form(page).getByRole("button", { name: "Crear salida" }).click();
    await expect(notice(page, "Salida creada.")).toBeVisible();
    let row = await findRow(page);
    await expect(row).toContainText("Disponible");

    // Same package and date again is refused.
    await page.getByRole("button", { name: "Nueva salida" }).click();
    await form(page)
      .getByLabel(/^Fecha de salida/)
      .fill(iso(start));
    await form(page)
      .getByLabel(/^Fecha de regreso/)
      .fill(iso(end));
    await form(page)
      .getByLabel(/^Capacidad/)
      .fill("2");
    await form(page).getByRole("button", { name: "Crear salida" }).click();
    await expect(
      form(page)
        .getByText(/Ya existe una salida de este paquete en esa fecha/)
        .first(),
    ).toBeVisible();
    await form(page).getByRole("button", { name: "Cancelar" }).click();

    // Hold 3 of 4.
    await changeSeats(page, "Retener", "3", "Grupo colegio E2E");
    await expect(notice(page, `3 cupos retenidos en la salida ${LABEL}.`)).toBeVisible();
    row = await findRow(page);
    const cells = row.getByRole("cell");
    await expect(cells.nth(2)).toHaveText("3");
    await expect(cells.nth(4)).toHaveText("1");

    // Two simultaneous holds of the last seat: exactly one wins, the other is 409 OVERBOOKING.
    const departures = (await (
      await page.request.get(`/api/v1/catalog/departures?packageId=${pkg}&pageSize=50`)
    ).json()) as {
      items: { id: string; startsAt: string }[];
    };
    let id = departures.items.find((item) => item.startsAt.startsWith(iso(start)))?.id;
    for (let current = 2; !id && current <= 100; current++) {
      const more = (await (
        await page.request.get(`/api/v1/catalog/departures?packageId=${pkg}&pageSize=50&page=${current}`)
      ).json()) as { items: { id: string; startsAt: string }[] };
      if (!more.items.length) break;
      id = more.items.find((item) => item.startsAt.startsWith(iso(start)))?.id;
    }
    expect(id).toBeTruthy();
    const { csrfToken } = (await (await page.request.get("/api/v1/auth/session")).json()) as { csrfToken: string };
    const headers = { Origin: origin, "x-csrf-token": csrfToken };
    const race = await Promise.all(
      [1, 2].map(() =>
        page.request.post(`/api/v1/catalog/departures/${id}/hold`, {
          headers,
          data: { seats: 1, reason: "Carrera E2E" },
        }),
      ),
    );
    expect(race.map((response) => response.status()).sort()).toEqual([201, 409]);
    const loser = race.find((response) => response.status() === 409)!;
    expect(((await loser.json()) as { code: string }).code).toBe("OVERBOOKING");

    // Capacity can never go below held + sold (4): client-side and server-side.
    await page.reload();
    await page.getByLabel("Paquete", { exact: true }).selectOption(pkg);
    row = await findRow(page);
    await row.getByRole("button", { name: `Editar salida ${LABEL}` }).click();
    await form(page)
      .getByLabel(/^Capacidad/)
      .fill("3");
    await form(page).getByRole("button", { name: "Guardar salida" }).click();
    await expect(form(page).getByText("No puede ser menor que los cupos retenidos y vendidos (4).")).toBeVisible();
    await form(page).getByRole("button", { name: "Cancelar" }).click();
    const current = (await (await page.request.get(`/api/v1/catalog/departures/${id}`)).json()) as {
      updatedAt: string;
    };
    const below = await page.request.patch(`/api/v1/catalog/departures/${id}`, {
      headers,
      data: { capacity: 2, reason: "Prueba E2E", expectedUpdatedAt: current.updatedAt },
    });
    expect(below.status()).toBe(409);
    expect(((await below.json()) as { code: string }).code).toBe("CAPACITY_BELOW_COMMITTED");

    // Raise the capacity with a reason, then release every held seat.
    row = await findRow(page);
    await row.getByRole("button", { name: `Editar salida ${LABEL}` }).click();
    await form(page)
      .getByLabel(/^Capacidad/)
      .fill("6");
    await form(page).getByRole("button", { name: "Guardar salida" }).click();
    await expect(form(page).getByText(/Indica el motivo del cambio de capacidad/)).toBeVisible();
    await form(page)
      .getByLabel(/^Motivo del cambio/)
      .fill("Bus más grande E2E");
    await form(page).getByRole("button", { name: "Guardar salida" }).click();
    await expect(notice(page, "Salida guardada.")).toBeVisible();
    await changeSeats(page, "Liberar", "4", "Grupo canceló E2E");
    await expect(notice(page, `4 cupos liberados en la salida ${LABEL}.`)).toBeVisible();

    // History lists every seat change with actor, delta and reason.
    row = await findRow(page);
    await row.getByRole("button", { name: `Historial de la salida ${LABEL}` }).click();
    const history = page.locator("section").filter({
      has: page.getByRole("heading", { name: `Historial de cupos: ${LABEL}` }),
    });
    await expect(history).toContainText("Salida creada");
    await expect(history).toContainText("Capacidad inicial 4");
    await expect(history).toContainText("Cupos retenidos");
    await expect(history).toContainText("Motivo: Grupo colegio E2E");
    await expect(history).toContainText("Motivo: Carrera E2E");
    await expect(history).toContainText("Capacidad modificada");
    await expect(history).toContainText("Motivo: Bus más grande E2E");
    await expect(history).toContainText("Cupos liberados");
    await expect(history).toContainText("−4 cupos");
    await expect(history).toContainText("Capacidad 6 · retenidos 0 · vendidos 0 · libres 6");
    await context.close();
  });

  test("finance has no access to cupos", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await page.goto("/admin/cupos");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva salida" })).toHaveCount(0);
    const statuses = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const id = "00000000-0000-4000-8000-000000000000";
      const read = await fetch(`/api/v1/catalog/departures?packageId=${id}`);
      const hold = await fetch(`/api/v1/catalog/departures/${id}/hold`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ seats: 1, reason: "No permitido" }),
      });
      return { read: read.status, hold: hold.status };
    });
    expect(statuses).toEqual({ read: 403, hold: 403 });
    await context.close();
  });
});
