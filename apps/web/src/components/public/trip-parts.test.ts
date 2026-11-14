import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuotePreview } from "./api";
import { ChildAgeFields, PriceSummary } from "./trip-parts";
import { INITIAL_STATE, activeSteps, nextStep, resizeChildAges, toSelection } from "./wizard-state";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("child age inputs", () => {
  it("renders exactly one select per child", () => {
    for (const count of [0, 1, 3, 20]) {
      const ages = resizeChildAges([], count);
      const html = render(createElement(ChildAgeFields, { ages, onChange: () => undefined }));
      expect(html.match(/<select/g)?.length ?? 0).toBe(count);
    }
  });

  it("keeps existing ages when the count changes and rejects incomplete ages in the selection", () => {
    expect(resizeChildAges(["3", "7"], 3)).toEqual(["3", "7", ""]);
    expect(resizeChildAges(["3", "7"], 1)).toEqual(["3"]);
    expect(toSelection({ ...INITIAL_STATE, packageId: "p", childAges: ["3", ""] })).toBeNull();
    expect(toSelection({ ...INITIAL_STATE, packageId: "p", childAges: ["3", "0"] })?.childAges).toEqual([3, 0]);
  });
  it("sends the travel date and promotion code only when present", () => {
    const empty = toSelection({ ...INITIAL_STATE, packageId: "p", travelDate: "2026-1", promotionCode: "  " });
    expect(empty).not.toHaveProperty("travelDate");
    expect(empty).not.toHaveProperty("promotionCode");
    expect(
      toSelection({ ...INITIAL_STATE, packageId: "p", travelDate: "2026-12-20", promotionCode: " verano " }),
    ).toMatchObject({
      travelDate: "2026-12-20",
      promotionCode: "verano",
    });
  });
});

describe("price summary", () => {
  it("shows the COP total from a cents string when priced", () => {
    const preview: QuotePreview = {
      status: "PRICED",
      currency: "COP",
      totalCents: "250000000",
      lines: [{ label: "Adultos", quantity: 2, unitAmountCents: "125000000", totalCents: "250000000" }],
      reasons: [],
    };
    const html = render(createElement(PriceSummary, { preview })).replace(/&nbsp;| /g, " ");
    expect(html).toContain("$ 2.500.000");
    expect(html).toContain("Total estimado");
  });

  it("shows reasons and no price when manual review is required", () => {
    const preview: QuotePreview = {
      status: "REQUIRES_MANUAL_REVIEW",
      currency: "COP",
      totalCents: null,
      lines: [{ label: "Adultos", quantity: 2, unitAmountCents: "125000000", totalCents: "250000000" }],
      reasons: ["No hay tarifa aprobada para el hotel elegido."],
    };
    const html = render(createElement(PriceSummary, { preview }));
    expect(html).toContain("Un asesor confirmará el valor");
    expect(html).toContain("No hay tarifa aprobada para el hotel elegido.");
    expect(html).not.toContain("$");
    expect(html).not.toContain("Total estimado");
  });

  it("treats a PRICED status without a total as manual review", () => {
    const html = render(
      createElement(PriceSummary, {
        preview: { status: "PRICED", currency: "COP", totalCents: null, lines: [], reasons: [] },
      }),
    );
    expect(html).toContain("Un asesor confirmará el valor");
  });
});

describe("step flow", () => {
  it("skips transport when the package has none", () => {
    const builder = {
      package: {
        id: "p",
        slug: "p",
        name: "P",
        destinationName: "D",
        durationDays: 3,
        durationNights: 2,
        inclusions: [],
        exclusions: [],
      },
      hotels: [],
      transportOptions: [],
      optionalTours: [],
      addOns: [],
      pricingAvailable: false,
    };
    expect(activeSteps(builder)).not.toContain("transporte");
    expect(nextStep("hotel", builder, 1)).toBe("viajeros");
    expect(nextStep("viajeros", builder, -1)).toBe("hotel");
  });
});
