import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminStatePath, financeStatePath } from "./e2e-state";

// Admin content module (FAQ, pages, home blocks) against the isolated seeded instance. Every record is named
// "E2E-CT ..." with a timestamp. FAQ items and pages cannot be deleted, so cleanup archives them; home blocks are
// unpublished and their drafts discarded. Named public-* so it runs after catalog-cartagena, which saves the
// MFA-complete admin and finance sessions this spec reuses.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const PREFIX = "E2E-CT";

const form = (page: Page) => page.locator("form.admin-commercial-form");
const notice = (page: Page, text: RegExp | string) => page.getByRole("status").filter({ hasText: text });

async function findRow(page: Page, text: string): Promise<Locator> {
  const row = () => page.getByRole("row").filter({ hasText: text });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await row().count()) return row();
    const next = page.getByRole("button", { name: "Siguiente" });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(row()).toBeVisible();
  return row();
}

type PublicContent = {
  faq: { question: string; answer: string }[];
  home: { hero: { headline: string; ctaHref: string } | null; banners: unknown };
};
const publicContent = (page: Page) =>
  page.evaluate(async () => (await (await fetch("/api/v1/public/content")).json()) as PublicContent);

async function cleanup(page: Page) {
  await page.goto("/admin/contenido");
  await page.evaluate(async (prefix) => {
    const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
    const post = (path: string, body: unknown) =>
      fetch(`/api/v1/content/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify(body),
      });
    for (const kind of ["faq", "pages"]) {
      for (let current = 1; current <= 100; current++) {
        const list = (await (await fetch(`/api/v1/content/${kind}?pageSize=50&page=${current}`)).json()) as {
          items?: { id: string; question?: string; title?: string; status: string; updatedAt: string }[];
        };
        const items = list.items ?? [];
        for (const item of items)
          if ((item.question ?? item.title ?? "").startsWith(prefix) && item.status !== "ARCHIVED")
            await post(`${kind}/${item.id}/archive`, { expectedUpdatedAt: item.updatedAt });
        if (items.length < 50) break;
      }
    }
    type Block = { block: string; draft: unknown; published: unknown; updatedAt: string | null };
    const blocks = async () => (await (await fetch("/api/v1/content/blocks")).json()) as Block[];
    for (const step of ["unpublish", "discard"] as const)
      for (const block of await blocks()) {
        const needed = step === "unpublish" ? block.published : block.draft;
        if (needed && block.updatedAt)
          await post(`blocks/${block.block}/${step}`, { expectedUpdatedAt: block.updatedAt });
      }
  }, PREFIX);
}

test.describe("Admin content", () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    await cleanup(await context.newPage());
    await context.close();
  });

  test("FAQ: draft, approval-gated publish, public visibility, edit lock and history", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const question = `${PREFIX} ¿Cómo reservo ${stamp}?`;
    await page.goto("/admin/contenido");
    await expect(page.getByRole("heading", { name: "Contenido y SEO", level: 1 })).toBeVisible();
    await expect(page.getByText(/deben estar aprobados por la agencia/).first()).toBeVisible();

    // Inline validation focuses the first invalid field.
    await page.getByRole("button", { name: "Nueva pregunta" }).click();
    await form(page).getByRole("button", { name: "Crear pregunta" }).click();
    await expect(form(page).getByLabel(/^Pregunta/)).toBeFocused();
    await expect(form(page).getByText("La pregunta debe tener al menos 5 caracteres.")).toBeVisible();

    await form(page)
      .getByLabel(/^Pregunta/)
      .fill(question);
    await form(page)
      .getByLabel(/^Respuesta/)
      .fill("Solicita una cotización y un asesor te contacta. <script>alert(1)</script>");
    await form(page).getByRole("button", { name: "Crear pregunta" }).click();
    await expect(notice(page, "Se creó la pregunta como borrador.")).toBeVisible();
    let row = await findRow(page, question);
    await expect(row.locator(".admin-badge")).toHaveText("Borrador");
    await expect(row).not.toContainText("<script>");

    // A draft is not public.
    expect(JSON.stringify((await publicContent(page)).faq)).not.toContain(question);

    // Publishing asks for explicit approval in the dialog.
    await row.getByRole("button", { name: /^Publicar/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("deben estar aprobados");
    await dialog.getByRole("button", { name: "Publicar" }).click();
    await expect(dialog).toBeHidden();
    await expect(notice(page, /publicado la pregunta/)).toBeVisible();
    row = await findRow(page, question);
    await expect(row.locator(".admin-badge")).toHaveText("Publicado");
    await expect(row.getByRole("button", { name: /^Editar/ })).toHaveCount(0);
    const live = (await publicContent(page)).faq;
    const entry = live.find((item) => item.question === question);
    expect(entry).toBeDefined();
    expect(entry!.answer).not.toContain("<script");

    // Unpublish returns it to draft and hides it again.
    await row.getByRole("button", { name: /^Despublicar/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Despublicar" }).click();
    await expect(notice(page, /vuelto a borrador/)).toBeVisible();
    expect(JSON.stringify((await publicContent(page)).faq)).not.toContain(question);

    // Edit while draft, then history shows the lifecycle.
    row = await findRow(page, question);
    await row.getByRole("button", { name: /^Editar/ }).click();
    await form(page).getByLabel(/^Tema/).fill("Reservas");
    await form(page).getByRole("button", { name: "Guardar cambios" }).click();
    await expect(notice(page, "Se guardó la pregunta.")).toBeVisible();
    row = await findRow(page, question);
    await row.getByRole("button", { name: /^Historial de/ }).click();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Historial:/ }) });
    await expect(history).toContainText("Creado");
    await expect(history).toContainText("Publicado");
    await expect(history).toContainText("Despublicado");
    await expect(history).toContainText("Tema: sin valor → Reservas");
    await context.close();
  });

  test("pages: slug, HTML stripped, public page only when published", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const title = `${PREFIX} Guía ${stamp}`;
    const slug = `e2e-ct-guia-${stamp}`;
    await page.goto("/admin/contenido?tab=paginas");
    await page.getByRole("button", { name: "Nueva página" }).click();
    await form(page)
      .getByLabel(/^Título(?: \*)?$/)
      .fill(title);
    await expect(form(page).getByLabel(/^Enlace/)).toHaveValue(/^e2e-ct-guia-/);
    await form(page)
      .getByLabel(/^Enlace/)
      .fill(slug);
    await form(page)
      .getByLabel(/^Contenido/)
      .fill("Texto E2E <b>hola</b> <script>alert(1)</script>[clic](javascript:alert(1))");
    await form(page).getByRole("button", { name: "Crear página" }).click();
    await expect(notice(page, "Se creó la página como borrador.")).toBeVisible();

    // Duplicate slug is rejected inline.
    await page.getByRole("button", { name: "Nueva página" }).click();
    await form(page)
      .getByLabel(/^Título(?: \*)?$/)
      .fill(`${title} copia`);
    await form(page)
      .getByLabel(/^Enlace/)
      .fill(slug);
    await form(page)
      .getByLabel(/^Contenido/)
      .fill("Otro");
    await form(page).getByRole("button", { name: "Crear página" }).click();
    await expect(form(page).getByText(/Ya existe una página con ese enlace/)).toBeVisible();
    await form(page).getByRole("button", { name: "Cancelar" }).click();

    const status = () => page.evaluate(async (s) => (await fetch(`/api/v1/public/content/pages/${s}`)).status, slug);
    expect(await status()).toBe(404);

    const row = await findRow(page, title);
    await row.getByRole("button", { name: /^Publicar/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publicar" }).click();
    await expect(notice(page, /publicado la página/)).toBeVisible();
    const body = await page.evaluate(
      async (s) => ((await (await fetch(`/api/v1/public/content/pages/${s}`)).json()) as { body: string }).body,
      slug,
    );
    expect(await status()).toBe(200);
    expect(body).toContain("Texto E2E hola");
    expect(body).not.toMatch(/<\s*\/?(b|script)/i);
    expect(body).not.toContain("javascript:");
    await context.close();
  });

  test("home blocks: draft never goes live until published, then can be retired", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminStatePath });
    const page = await context.newPage();
    const headline = `${PREFIX} Viaja con calma ${stamp}`;
    await page.goto("/admin/contenido?tab=inicio");
    const hero = page.locator("section").filter({ has: page.getByRole("heading", { name: "Portada del inicio" }) });
    await expect(hero).toBeVisible();
    await expect(page.getByText(/deben estar aprobados por la agencia/).first()).toBeVisible();

    // Validation: a hero needs a headline; a button label needs a link.
    await hero.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(hero.getByText("El titular debe tener al menos 3 caracteres.")).toBeVisible();
    await hero.getByLabel(/^Titular/).fill(headline);
    await hero.getByLabel(/^Texto del botón/).fill("Cotizar");
    await hero.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(hero.getByText("Escribe el enlace del botón.")).toBeVisible();
    await hero.getByLabel(/^Enlace del botón/).fill("javascript:alert(1)");
    await hero.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(hero.getByText(/Usa una ruta del sitio/)).toBeVisible();
    await hero.getByLabel(/^Enlace del botón/).fill("/cotizar");

    await hero.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(hero.getByRole("status").filter({ hasText: "Borrador guardado" })).toBeVisible();
    expect(JSON.stringify((await publicContent(page)).home.hero)).not.toContain(headline);

    // Publish copies the draft to the live copy, after the approval dialog.
    await hero.getByRole("button", { name: /^Publicar Portada/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("deben estar aprobados");
    await dialog.getByRole("button", { name: "Publicar" }).click();
    await expect(hero.getByRole("status").filter({ hasText: "Publicado: ya se muestra" })).toBeVisible();
    expect((await publicContent(page)).home.hero).toMatchObject({ headline, ctaHref: "/cotizar" });

    // A later draft stays private.
    await hero.getByLabel(/^Titular/).fill(`${headline} SIN APROBAR`);
    await expect(hero.getByRole("button", { name: /^Publicar Portada/ })).toBeDisabled();
    await hero.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(hero.getByRole("status").filter({ hasText: "Borrador guardado" })).toBeVisible();
    const home = (await publicContent(page)).home;
    expect(home.hero?.headline).toBe(headline);
    expect(JSON.stringify(home)).not.toContain("SIN APROBAR");

    // Banner list: add, validate and save a draft (never published here).
    const banners = page.locator("section").filter({ has: page.getByRole("heading", { name: "Avisos y banners" }) });
    await banners.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(banners.getByText("Agrega al menos un aviso.")).toBeVisible();
    await banners.getByRole("button", { name: "Agregar aviso" }).click();
    await banners.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(banners.getByText("El título debe tener al menos 2 caracteres.")).toBeVisible();
    await banners.getByLabel(/^Título(?: \*)?$/).fill(`${PREFIX} Aviso ${stamp}`);
    await banners.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(banners.getByRole("status").filter({ hasText: "Borrador guardado" })).toBeVisible();
    expect((await publicContent(page)).home.banners).toBeNull();

    // Retire the hero: the site stops showing it; history lists the lifecycle.
    await hero.getByRole("button", { name: /^Retirar Portada/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Retirar" }).click();
    await expect(hero.getByRole("status").filter({ hasText: "Retirado del sitio" })).toBeVisible();
    expect((await publicContent(page)).home.hero).toBeNull();
    await hero.getByRole("button", { name: /^Historial de Portada/ }).click();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Historial: Portada/ }) });
    await expect(history).toContainText("Borrador guardado");
    await expect(history).toContainText("Publicado");
    await context.close();
  });

  test("finance has no access to content", async ({ browser }) => {
    const context = await browser.newContext({ storageState: financeStatePath });
    const page = await context.newPage();
    await page.goto("/admin/contenido");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    const statuses = await page.evaluate(async () => {
      const session = (await (await fetch("/api/v1/auth/session")).json()) as { csrfToken: string };
      const read = await fetch("/api/v1/content/faq");
      const create = await fetch("/api/v1/content/faq", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ question: "No permitido ¿sí?", answer: "No" }),
      });
      const publicRead = await fetch("/api/v1/public/content");
      return { read: read.status, create: create.status, publicRead: publicRead.status };
    });
    expect(statuses).toEqual({ read: 403, create: 403, publicRead: 200 });
    await context.close();
  });
});
