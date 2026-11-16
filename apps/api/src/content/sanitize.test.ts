import { describe, expect, it } from "vitest";
import { blockSchemas } from "./blocks";
import { isHttpUrl, isSafeHref, sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("strips tags, scripts, comments and nested reassembly attempts", () => {
    expect(sanitizeText("Hola <b>mundo</b>")).toBe("Hola mundo");
    expect(sanitizeText("a<script>alert(1)</script>b")).toBe("ab");
    expect(sanitizeText("a<!-- x -->b")).toBe("ab");
    expect(sanitizeText("<scr<script></script>ipt>alert(1)</scr<script></script>ipt>")).not.toMatch(/<\s*script/i);
    expect(sanitizeText('<img src=x onerror="alert(1)">texto')).toBe("texto");
  });
  it("neutralises dangerous markdown link targets and control characters", () => {
    expect(sanitizeText("[clic](javascript:alert(1))")).toBe("[clic](#)");
    expect(sanitizeText("[x](data:text/html;base64,AAA)")).toBe("[x](#)");
    expect(sanitizeText("[ok](https://example.com)")).toBe("[ok](https://example.com)");
    expect(sanitizeText("a\u0000b\r\nc")).toBe("ab\nc");
  });
  it("keeps plain comparisons and markdown", () => {
    expect(sanitizeText("2 < 3 y 5 > 4\n\n- punto")).toBe("2 < 3 y 5 > 4\n\n- punto");
  });
});

describe("href validation", () => {
  it("accepts site paths and http(s) URLs only", () => {
    for (const ok of ["/destinos", "https://ricaurte.example/a?b=1", "http://example.com"]) {
      expect(isSafeHref(ok)).toBe(true);
    }
    for (const bad of [
      "javascript:alert(1)",
      "//evil.example",
      "/\\evil",
      "ftp://x.co",
      "https://u:p@x.co",
      "a b",
      "destinos",
    ])
      expect(isSafeHref(bad)).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
  });
});

describe("home block schemas", () => {
  it("normalises the hero and requires both cta fields or none", () => {
    const parsed = blockSchemas.hero.parse({
      headline: " Viaja <i>con calma</i> ",
      ctaLabel: "Cotiza",
      ctaHref: "/cotizar",
    });
    expect(parsed).toMatchObject({ headline: "Viaja con calma", subheadline: null, imageId: null });
    expect(blockSchemas.hero.safeParse({ headline: "Hola mundo", ctaLabel: "Cotiza" }).success).toBe(false);
    expect(
      blockSchemas.hero.safeParse({ headline: "Hola mundo", ctaLabel: "Ir", ctaHref: "javascript:x" }).success,
    ).toBe(false);
    expect(blockSchemas.hero.safeParse({ headline: "Hola mundo", discount: "50%" }).success).toBe(false);
    expect(blockSchemas.hero.safeParse({ headline: "Hola mundo", imageId: "http://x/y.png" }).success).toBe(false);
  });
  it("bounds featured destinations and banners", () => {
    const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    expect(
      blockSchemas.featuredDestinations.safeParse({ items: [{ destinationId: id(1) }, { destinationId: id(1) }] })
        .success,
    ).toBe(false);
    expect(blockSchemas.featuredDestinations.safeParse({ items: [] }).success).toBe(false);
    expect(
      blockSchemas.banners.safeParse({ items: Array.from({ length: 6 }, () => ({ title: "Aviso" })) }).success,
    ).toBe(false);
    expect(blockSchemas.banners.safeParse({ items: [{ title: "Aviso importante" }] }).success).toBe(true);
  });
});
