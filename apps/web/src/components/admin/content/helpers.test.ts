import { describe, expect, it } from "vitest";
import {
  APPROVAL_WARNING,
  availableActions,
  bannersPayload,
  blankBanner,
  blankFaq,
  blankPage,
  confirmText,
  describeContentError,
  faqPayload,
  heroPayload,
  historyActionLabel,
  isSafeHref,
  pagePayload,
  resolveContentTab,
  slugify,
  summarizeBlockChanges,
  summarizeChanges,
  validateBanners,
  validateFaq,
  validateFeatured,
  validateHero,
  validatePage,
  FAQ_FIELD_LABELS,
} from "./helpers";

describe("content tabs and statuses", () => {
  it("resolves unknown tabs to the FAQ", () => {
    expect(resolveContentTab(undefined)).toBe("faq");
    expect(resolveContentTab(["inicio", "paginas"])).toBe("inicio");
    expect(resolveContentTab("nope")).toBe("faq");
  });
  it("offers only valid status actions", () => {
    expect(availableActions("DRAFT")).toEqual(["publish", "archive"]);
    expect(availableActions("PUBLISHED")).toEqual(["unpublish", "archive"]);
    expect(availableActions("ARCHIVED")).toEqual(["restore"]);
  });
  it("warns about approval when publishing", () => {
    expect(confirmText("publish", "Pregunta")).toContain(APPROVAL_WARNING);
    expect(confirmText("unpublish", "Pregunta")).not.toContain("aprobados");
  });
});

describe("FAQ form", () => {
  it("validates lengths and order", () => {
    expect(validateFaq(blankFaq())).toMatchObject({ question: expect.any(String), answer: expect.any(String) });
    expect(validateFaq({ question: "¿Cómo pago?", answer: "Por transferencia", topic: "", sortOrder: "x" })).toEqual({
      sortOrder: "El orden es un número entero desde 0.",
    });
    expect(
      validateFaq({ question: "¿Cómo pago?", answer: "ok", topic: "t".repeat(81), sortOrder: "1" }).topic,
    ).toBeDefined();
  });
  it("builds a trimmed payload with null topic", () => {
    expect(faqPayload({ question: " ¿Cómo pago? ", answer: " Aquí ", topic: " ", sortOrder: "" })).toEqual({
      question: "¿Cómo pago?",
      answer: "Aquí",
      topic: null,
      sortOrder: 0,
    });
  });
});

describe("page form", () => {
  it("slugifies titles without accents", () => {
    expect(slugify("¿Cómo reservar tu viaje?")).toBe("como-reservar-tu-viaje");
    expect(slugify("  ---  ")).toBe("");
  });
  it("validates slug, title and body", () => {
    const errors = validatePage({ ...blankPage(), slug: "Mal Slug" });
    expect(errors.slug).toMatch(/minúsculas/);
    expect(errors.title).toBeDefined();
    expect(errors.body).toBeDefined();
    expect(validatePage({ ...blankPage(), slug: "ok-slug", title: "Título", body: "x" })).toEqual({});
  });
  it("builds a payload with nullable seo fields and the noindex flag", () => {
    expect(pagePayload({ ...blankPage(), slug: "a-b", title: " T ", body: " B ", noindex: "true" })).toMatchObject({
      slug: "a-b",
      title: "T",
      body: "B",
      excerpt: null,
      seoTitle: null,
      noindex: true,
    });
  });
});

describe("home blocks", () => {
  it("only accepts site paths and http(s) links", () => {
    for (const ok of ["/cotizar", "https://example.com/a", "http://example.com"]) expect(isSafeHref(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.example", "ftp://x.co", "https://u:p@x.co", "cotizar"])
      expect(isSafeHref(bad)).toBe(false);
  });
  it("hero needs a headline and both cta fields or none", () => {
    expect(
      validateHero({ headline: "", subheadline: "", ctaLabel: "", ctaHref: "", imageId: "" }).headline,
    ).toBeDefined();
    expect(
      validateHero({ headline: "Viaja", subheadline: "", ctaLabel: "Ir", ctaHref: "", imageId: "" }).ctaHref,
    ).toBeDefined();
    expect(
      validateHero({ headline: "Viaja", subheadline: "", ctaLabel: "", ctaHref: "/x", imageId: "" }).ctaLabel,
    ).toBeDefined();
    expect(
      validateHero({ headline: "Viaja", subheadline: "", ctaLabel: "", ctaHref: "javascript:x", imageId: "" }).ctaHref,
    ).toBeDefined();
    expect(
      validateHero({
        headline: "Viaja con calma",
        subheadline: "",
        ctaLabel: "Cotiza",
        ctaHref: "/cotizar",
        imageId: "",
      }),
    ).toEqual({});
    expect(heroPayload({ headline: " Hola ", subheadline: "", ctaLabel: "", ctaHref: "", imageId: "" })).toEqual({
      headline: "Hola",
      subheadline: null,
      ctaLabel: null,
      ctaHref: null,
      imageId: null,
    });
  });
  it("featured destinations need 1 to 6 picks", () => {
    expect(validateFeatured({ title: "", ids: [] }).ids).toBeDefined();
    expect(validateFeatured({ title: "", ids: ["a", "b", "c", "d", "e", "f", "g"] }).ids).toBeDefined();
    expect(validateFeatured({ title: "", ids: ["a"] })).toEqual({});
  });
  it("banners are validated per item with indexed keys", () => {
    expect(validateBanners([])).toEqual({ items: "Agrega al menos un aviso." });
    const errors = validateBanners([
      { ...blankBanner(), title: "Aviso importante" },
      { ...blankBanner(), title: "x", href: "javascript:x" },
    ]);
    expect(Object.keys(errors).sort()).toEqual(["items.1.href", "items.1.title"]);
    expect(bannersPayload([{ title: " Aviso ", text: "", href: "", imageId: "" }])).toEqual({
      items: [{ title: "Aviso", text: null, href: null, imageId: null }],
    });
  });
});

describe("errors and history", () => {
  it("translates content error codes and points at the field", () => {
    expect(describeContentError({ status: 409, data: { code: "SLUG_TAKEN" } })).toMatchObject({ field: "slug" });
    expect(describeContentError({ status: 400, data: { code: "APPROVAL_REQUIRED" } }).message).toMatch(/aprobado/);
    expect(describeContentError({ status: 403, data: null }).message).toMatch(/permiso/);
  });
  it("labels actions and summarises changes", () => {
    expect(historyActionLabel("content_blocks.draft_saved")).toBe("Borrador guardado");
    expect(historyActionLabel("content_faq.published")).toBe("Publicado");
    expect(
      summarizeChanges(
        { before: { status: "DRAFT", topic: null }, after: { status: "PUBLISHED", topic: null } },
        FAQ_FIELD_LABELS,
      ),
    ).toEqual(["Estado: Borrador → Publicado"]);
    expect(
      summarizeBlockChanges({
        before: { draft: { a: 1 }, published: null },
        after: { draft: { a: 1 }, published: { a: 1 } },
      }),
    ).toEqual(["Cambió la versión publicada."]);
  });
});
