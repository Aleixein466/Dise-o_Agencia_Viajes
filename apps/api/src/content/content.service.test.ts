import { describe, expect, it } from "vitest";
import { ContentService } from "./content.service";
import { fakeDb } from "./test-db";

const ACTOR = "00000000-0000-4000-8000-0000000000ff";
const faq = (over = {}) => ({ question: "¿Cómo reservo?", answer: "Cotiza y un asesor te contacta.", ...over });
const page = (over = {}) => ({
  slug: "como-reservar",
  kind: "GUIDE" as const,
  title: "Cómo reservar",
  body: "Texto",
  ...over,
});

function setup() {
  const { db, tables } = fakeDb();
  return { service: new ContentService(db), tables };
}

describe("ContentService FAQ", () => {
  it("creates drafts with an audit row and never publishes on create", async () => {
    const { service, tables } = setup();
    const row = await service.createFaq(faq({ topic: "Pagos" }), ACTOR);
    expect(row).toMatchObject({ status: "DRAFT", topic: "Pagos", sortOrder: 0 });
    expect(tables.auditLog!.rows).toMatchObject([
      { action: "content_faq.created", entity: "faq_item", actorId: ACTOR },
    ]);
  });
  it("publishes with audit, blocks edits while published and allows them after unpublish", async () => {
    const { service, tables } = setup();
    const row = (await service.createFaq(faq(), ACTOR)) as { id: string; updatedAt: Date };
    const published = (await service.faqStatus(row.id, "publish", row.updatedAt, ACTOR)) as typeof row & {
      status: string;
    };
    expect(published.status).toBe("PUBLISHED");
    expect(tables.auditLog!.rows.at(-1)).toMatchObject({
      action: "content_faq.published",
      details: { approvalConfirmed: true },
    });
    await expect(service.updateFaq(row.id, { answer: "Otro" }, published.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "NOT_EDITABLE" },
    });
    await expect(service.faqStatus(row.id, "publish", published.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "INVALID_TRANSITION" },
    });
    const draft = (await service.faqStatus(row.id, "unpublish", published.updatedAt, ACTOR)) as typeof row;
    const edited = await service.updateFaq(row.id, { answer: "Otro" }, draft.updatedAt, ACTOR);
    expect(edited).toMatchObject({ answer: "Otro", status: "DRAFT" });
  });
  it("detects stale stamps and supports archive and restore", async () => {
    const { service } = setup();
    const row = (await service.createFaq(faq(), ACTOR)) as { id: string; updatedAt: Date };
    await expect(service.updateFaq(row.id, { topic: "x" }, new Date(0), ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    const archived = (await service.faqStatus(row.id, "archive", row.updatedAt, ACTOR)) as typeof row & {
      status: string;
    };
    expect(archived.status).toBe("ARCHIVED");
    const restored = await service.faqStatus(row.id, "restore", archived.updatedAt, ACTOR);
    expect(restored).toMatchObject({ status: "DRAFT" });
    await expect(service.getFaq("00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ status: 404 });
  });
  it("filters the list by status", async () => {
    const { service } = setup();
    const a = (await service.createFaq(faq(), ACTOR)) as { id: string; updatedAt: Date };
    await service.createFaq(faq({ question: "Otra pregunta" }), ACTOR);
    await service.faqStatus(a.id, "publish", a.updatedAt, ACTOR);
    expect((await service.listFaq({ status: "PUBLISHED" }, 1, 10)).total).toBe(1);
    expect((await service.listFaq({}, 1, 10)).total).toBe(2);
  });
});

describe("ContentService pages", () => {
  it("creates a draft page, rejects a taken slug and stamps publishedAt on publish only", async () => {
    const { service } = setup();
    const row = (await service.createPage(page(), ACTOR)) as { id: string; updatedAt: Date; publishedAt: Date | null };
    expect(row).toMatchObject({ status: "DRAFT", noindex: false });
    await expect(service.createPage(page({ title: "Otra" }), ACTOR)).rejects.toMatchObject({
      response: { code: "SLUG_TAKEN" },
    });
    const live = (await service.pageStatus(row.id, "publish", row.updatedAt, ACTOR)) as typeof row;
    expect(live.publishedAt).toBeInstanceOf(Date);
    const back = (await service.pageStatus(row.id, "unpublish", live.updatedAt, ACTOR)) as typeof row;
    expect(back.publishedAt).toBeNull();
  });
  it("edits drafts with before/after audit and refuses a slug owned by another page", async () => {
    const { service, tables } = setup();
    const a = (await service.createPage(page(), ACTOR)) as { id: string; updatedAt: Date };
    const b = (await service.createPage(page({ slug: "otra" }), ACTOR)) as { id: string; updatedAt: Date };
    await expect(service.updatePage(b.id, { slug: "como-reservar" }, b.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "SLUG_TAKEN" },
    });
    await service.updatePage(a.id, { title: "Nuevo título", seoTitle: null }, a.updatedAt, ACTOR);
    const last = tables.auditLog!.rows.at(-1)!;
    expect(last).toMatchObject({ action: "content_pages.updated" });
    expect((last.before as { title: string }).title).toBe("Cómo reservar");
    expect((last.after as { title: string }).title).toBe("Nuevo título");
  });
  it("hides soft-deleted pages", async () => {
    const { service, tables } = setup();
    const a = (await service.createPage(page(), ACTOR)) as { id: string };
    tables.contentPage!.rows[0]!.deletedAt = new Date();
    await expect(service.getPage(a.id)).rejects.toMatchObject({ status: 404 });
    expect((await service.listPages({}, 1, 10)).total).toBe(0);
  });
  it("redacts sensitive keys in history", async () => {
    const { service, tables } = setup();
    const a = (await service.createFaq(faq(), ACTOR)) as { id: string };
    tables.auditLog!.rows.push({
      id: "x",
      entity: "faq_item",
      entityId: a.id,
      before: null,
      after: { contactEmail: "a@b.co" },
    });
    expect(JSON.stringify(await service.history("faq_item", a.id))).not.toContain("a@b.co");
  });
});
