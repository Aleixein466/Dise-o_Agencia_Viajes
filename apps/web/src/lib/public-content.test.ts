import { describe, expect, it } from "vitest";
import { faqItemsFor, mailHref, safeHref, telHref, whatsappHref, type PublicContent } from "./public-content";

const withFaq = (faq: PublicContent["faq"]): PublicContent => ({
  faq,
  home: { hero: null, featuredDestinations: null, banners: null },
});
const staticFaq = [{ q: "Pregunta estática", a: "Respuesta estática" }];

describe("home FAQ selection", () => {
  it("keeps the static copy without content, with an empty publication or with no API", () => {
    expect(faqItemsFor(null, staticFaq)).toBe(staticFaq);
    expect(faqItemsFor(withFaq([]), staticFaq)).toBe(staticFaq);
  });

  it("shows only the published rows once there is at least one", () => {
    const published = withFaq([{ id: "1", question: "¿Publicada?", answer: "Sí." }]);
    expect(faqItemsFor(published, staticFaq)).toEqual([{ q: "¿Publicada?", a: "Sí." }]);
  });
});

describe("public content link helpers", () => {
  it("allows same-site paths and http(s) only", () => {
    expect(safeHref("/destinos")).toBe("/destinos");
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("/\\evil")).toBeNull();
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  it("builds contact links only from valid values", () => {
    expect(whatsappHref("+57 300 123 4567")).toBe("https://wa.me/573001234567");
    expect(whatsappHref("12")).toBeNull();
    expect(whatsappHref(null)).toBeNull();
    expect(telHref("+57 (300) 123-4567")).toBe("tel:+573001234567");
    expect(telHref("abc")).toBeNull();
    expect(mailHref("info@ejemplo.co")).toBe("mailto:info@ejemplo.co");
    expect(mailHref("no es correo")).toBeNull();
  });
});
