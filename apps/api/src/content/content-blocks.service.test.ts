import { describe, expect, it } from "vitest";
import { ContentBlocksService } from "./content-blocks.service";
import { PublicContentService } from "./public-content.service";
import { fakeDb } from "./test-db";

const ACTOR = "00000000-0000-4000-8000-0000000000ff";
const MEDIA = "00000000-0000-4000-8000-0000000000a1";
const DEST = "00000000-0000-4000-8000-0000000000d1";
const hero = (over = {}) => ({
  headline: "Viaja con calma",
  subheadline: null,
  ctaLabel: null,
  ctaHref: null,
  imageId: null,
  ...over,
});

function setup() {
  const seeded = fakeDb({
    mediaAsset: [
      {
        id: MEDIA,
        altText: "Playa",
        mimeType: "image/webp",
        objectKey: "a.webp",
        visibility: "PUBLIC",
        deletedAt: null,
      },
      {
        id: "00000000-0000-4000-8000-0000000000a2",
        altText: "Recibo",
        mimeType: "image/webp",
        objectKey: "receipts/r.webp",
        visibility: "PUBLIC",
        deletedAt: null,
      },
    ],
    destination: [{ id: DEST, slug: "cartagena", name: "Cartagena", status: "PUBLISHED", deletedAt: null }],
  });
  return { ...seeded, blocks: new ContentBlocksService(seeded.db), publicApi: new PublicContentService(seeded.db) };
}

describe("ContentBlocksService", () => {
  it("lists every block empty at first", async () => {
    const { blocks } = setup();
    const list = await blocks.list();
    expect(list.map((b) => b.block)).toEqual(["hero", "featuredDestinations", "banners"]);
    expect(list.every((b) => b.draft === null && b.published === null && b.updatedAt === null)).toBe(true);
  });
  it("saves a draft without publishing it and audits the change", async () => {
    const { blocks, tables, publicApi } = setup();
    const saved = await blocks.saveDraft("hero", hero(), null, ACTOR);
    expect(saved).toMatchObject({
      draft: { headline: "Viaja con calma" },
      published: null,
      hasUnpublishedChanges: true,
    });
    expect(tables.auditLog!.rows).toMatchObject([
      { action: "content_blocks.draft_saved", entityId: "content.home.hero" },
    ]);
    expect((await publicApi.content()).home.hero).toBeNull();
  });
  it("requires a stamp once the row exists and rejects stale ones", async () => {
    const { blocks } = setup();
    const first = await blocks.saveDraft("hero", hero(), null, ACTOR);
    await expect(blocks.saveDraft("hero", hero(), null, ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    await expect(blocks.saveDraft("hero", hero(), new Date(0), ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    await expect(
      blocks.saveDraft(
        "banners",
        { items: [{ title: "Aviso", text: null, href: null, imageId: null }] },
        new Date(5),
        ACTOR,
      ),
    ).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    await expect(
      blocks.saveDraft("hero", hero({ headline: "Otro titular" }), new Date(first.updatedAt!), ACTOR),
    ).resolves.toBeDefined();
  });
  it("publishes draft to published with audit, and the public API shows only the published copy", async () => {
    const { blocks, tables, publicApi } = setup();
    const saved = await blocks.saveDraft("hero", hero({ imageId: MEDIA }), null, ACTOR);
    const live = await blocks.publish("hero", new Date(saved.updatedAt!), ACTOR);
    expect(live).toMatchObject({ published: { headline: "Viaja con calma" }, hasUnpublishedChanges: false });
    expect(tables.auditLog!.rows.at(-1)).toMatchObject({
      action: "content_blocks.published",
      details: { approvalConfirmed: true },
    });
    const edited = await blocks.saveDraft(
      "hero",
      hero({ headline: "Titular sin aprobar" }),
      new Date(live.updatedAt!),
      ACTOR,
    );
    const home = (await publicApi.content()).home;
    expect(home.hero).toMatchObject({ headline: "Viaja con calma", image: { id: MEDIA, alt: "Playa" } });
    expect(JSON.stringify(home)).not.toContain("sin aprobar");
    await blocks.discardDraft("hero", new Date(edited.updatedAt!), ACTOR);
  });
  it("unpublishes and refuses publish without a draft", async () => {
    const { blocks, publicApi } = setup();
    const saved = await blocks.saveDraft(
      "banners",
      { items: [{ title: "Aviso importante", text: null, href: null, imageId: null }] },
      null,
      ACTOR,
    );
    const live = await blocks.publish("banners", new Date(saved.updatedAt!), ACTOR);
    expect((await publicApi.content()).home.banners).not.toBeNull();
    const off = await blocks.unpublish("banners", new Date(live.updatedAt!), ACTOR);
    expect(off.published).toBeNull();
    expect((await publicApi.content()).home.banners).toBeNull();
    await expect(blocks.unpublish("banners", new Date(off.updatedAt!), ACTOR)).rejects.toMatchObject({
      response: { code: "NOT_PUBLISHED" },
    });
    await expect(blocks.publish("hero", new Date(), ACTOR)).rejects.toMatchObject({ status: 404 });
  });
  it("only references existing public media and existing destinations", async () => {
    const { blocks } = setup();
    const missing = "00000000-0000-4000-8000-0000000000b9";
    await expect(blocks.saveDraft("hero", hero({ imageId: missing }), null, ACTOR)).rejects.toMatchObject({
      response: { code: "MEDIA_NOT_FOUND" },
    });
    await expect(
      blocks.saveDraft("hero", hero({ imageId: "00000000-0000-4000-8000-0000000000a2" }), null, ACTOR),
    ).rejects.toMatchObject({
      response: { code: "MEDIA_NOT_FOUND" },
    });
    await expect(
      blocks.saveDraft("featuredDestinations", { title: null, items: [{ destinationId: missing }] }, null, ACTOR),
    ).rejects.toMatchObject({
      response: { code: "DESTINATION_NOT_FOUND" },
    });
    await expect(
      blocks.saveDraft("featuredDestinations", { title: null, items: [{ destinationId: DEST }] }, null, ACTOR),
    ).resolves.toBeDefined();
    expect((await blocks.media()).map((m) => m.id)).toEqual([MEDIA]);
  });
});

describe("PublicContentService", () => {
  it("returns only published FAQ items and pages, without drafts or archived rows", async () => {
    const { tables: client, publicApi } = setup();
    const row = (status: string, slug: string) => ({
      id: slug,
      slug,
      kind: "PAGE",
      title: slug,
      excerpt: null,
      body: "x",
      status,
      deletedAt: null,
    });
    client.contentPage!.rows.push(row("PUBLISHED", "visible"), row("DRAFT", "borrador"), row("ARCHIVED", "archivada"), {
      ...row("PUBLISHED", "borrada"),
      deletedAt: new Date(),
    });
    client.faqItem!.rows.push(
      { id: "1", question: "Visible", answer: "a", status: "PUBLISHED" },
      { id: "2", question: "Borrador", answer: "b", status: "DRAFT" },
    );
    const all = await publicApi.content();
    expect(all.pages.map((p) => p.slug)).toEqual(["visible"]);
    expect(all.faq.map((f) => f.question)).toEqual(["Visible"]);
    expect(all.pages[0]).not.toHaveProperty("body");
    await expect(publicApi.page("visible")).resolves.toMatchObject({ slug: "visible", body: "x" });
    for (const slug of ["borrador", "archivada", "borrada", "no-existe"])
      await expect(publicApi.page(slug)).rejects.toMatchObject({ status: 404 });
  });
});
