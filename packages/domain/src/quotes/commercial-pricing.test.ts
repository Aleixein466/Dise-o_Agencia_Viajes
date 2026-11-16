import { describe, expect, it } from "vitest";
import {
  calculateCommercialQuote,
  classifyAge,
  promotionDiscount,
  promotionRejection,
  type AgeBand,
  type CommercialQuoteInput,
  type CommercialRule,
  type PromotionOffer,
} from "./commercial-pricing";

const rule = (id: string, amountCents: bigint, extra: Partial<CommercialRule> = {}): CommercialRule => ({
  id,
  description: id,
  amountCents,
  ruleSetVersion: "v1",
  unit: "PER_PERSON",
  priority: 0,
  ...extra,
});
const band = (
  id: string,
  category: AgeBand["category"],
  min: number | null,
  max: number | null,
  extra: Partial<AgeBand> = {},
): AgeBand => ({
  id,
  category,
  basis: "AGE_YEARS",
  minValue: min,
  maxValue: max,
  scope: "PACKAGE",
  ...extra,
});
const quote = (rules: CommercialRule[], extra: Partial<CommercialQuoteInput> = {}) =>
  calculateCommercialQuote({
    adults: 2,
    childAges: [],
    ageBands: [],
    items: [{ kind: "PACKAGE", targetId: "pkg", rules }],
    ...extra,
  });
const high = { id: "high", startsOn: "2026-12-15", endsOn: "2027-01-15" };

describe("calculateCommercialQuote: base selection", () => {
  it("prices adults with the single approved rule", () => {
    expect(quote([rule("base", 100n)])).toMatchObject({ state: "CALCULATED", totalCents: 200n, reasons: [] });
  });
  it("prefers the accommodation-bound rule and resolves ties by priority", () => {
    const rules = [rule("generic", 100n), rule("double", 300n, { roomTypeId: "room" })];
    expect(quote(rules, { roomTypeId: "room" }).lines[0]?.priceRuleId).toBe("double");
    expect(quote([rule("a", 100n), rule("b", 200n, { priority: 5 })]).lines[0]?.priceRuleId).toBe("b");
  });
  it("sends equal-priority candidates to review", () => {
    expect(quote([rule("a", 100n), rule("b", 200n)])).toMatchObject({
      state: "REQUIRES_MANUAL_REVIEW",
      totalCents: null,
      reasons: ["PRICE_RULE_AMBIGUOUS"],
    });
  });
  it("requires review when there is no rule", () => {
    expect(quote([]).reasons).toEqual(["BASE_RATE_REQUIRED"]);
  });
});

describe("calculateCommercialQuote: seasons", () => {
  const rules = [rule("regular", 100n), rule("highSeason", 150n, { season: high })];
  it("uses the season rule only inside the inclusive travel window", () => {
    expect(quote(rules, { travelDate: "2026-12-15" }).lines[0]?.priceRuleId).toBe("highSeason");
    expect(quote(rules, { travelDate: "2027-01-15" }).lines[0]?.seasonId).toBe("high");
    expect(quote(rules, { travelDate: "2027-01-16" }).lines[0]?.priceRuleId).toBe("regular");
  });
  it("requires a travel date whenever a season rule could apply", () => {
    expect(quote(rules).reasons).toEqual(["TRAVEL_DATE_REQUIRED"]);
    expect(quote([rule("highSeason", 150n, { season: high })]).reasons).toEqual(["TRAVEL_DATE_REQUIRED"]);
  });
  it("does not price a date outside every season when only season rules exist", () => {
    expect(quote([rule("highSeason", 150n, { season: high })], { travelDate: "2027-03-01" }).reasons).toEqual([
      "BASE_RATE_REQUIRED",
    ]);
  });
  it("treats two overlapping season rules of equal priority as ambiguous", () => {
    const other = { id: "fest", startsOn: "2026-12-20", endsOn: "2026-12-31" };
    const both = [rule("a", 150n, { season: high }), rule("b", 170n, { season: other })];
    expect(quote(both, { travelDate: "2026-12-24" }).reasons).toEqual(["PRICE_RULE_AMBIGUOUS"]);
    expect(
      quote([...both, rule("c", 180n, { season: other, priority: 1 })], { travelDate: "2026-12-24" }).lines[0]
        ?.priceRuleId,
    ).toBe("c");
  });
});

describe("calculateCommercialQuote: occupancy", () => {
  it("applies an occupancy rule only to that party size", () => {
    const rules = [rule("double", 300n, { occupancy: 2 }), rule("triple", 250n, { occupancy: 3 })];
    expect(quote(rules).lines[0]?.priceRuleId).toBe("double");
    expect(quote(rules, { adults: 3 }).lines[0]).toMatchObject({ priceRuleId: "triple", totalCents: 750n });
    expect(quote(rules, { adults: 1 }).reasons).toEqual(["BASE_RATE_REQUIRED"]);
  });
  it("bounds the party with min/max travellers", () => {
    const rules = [rule("group", 80n, { minTravelers: 4, maxTravelers: 8 })];
    expect(quote(rules, { adults: 4 }).state).toBe("CALCULATED");
    expect(quote(rules, { adults: 9 }).reasons).toEqual(["BASE_RATE_REQUIRED"]);
  });
  it("sends a party larger than the room to review", () => {
    expect(quote([rule("base", 100n)], { adults: 3, roomMaxOccupancy: 2 }).reasons).toEqual(["OCCUPANCY_EXCEEDED"]);
    expect(quote([rule("base", 100n)], { adults: 1, childAges: [5, 6], roomMaxOccupancy: 2 }).reasons).toContain(
      "OCCUPANCY_EXCEEDED",
    );
  });
});

describe("calculateCommercialQuote: children", () => {
  const bands = [band("infant", "INFANT", 0, 1), band("child", "CHILD", 2, 11)];
  const rules = [
    rule("adult", 1000n),
    rule("childRate", 600n, { ageRuleId: "child" }),
    rule("infantRate", 0n, { ageRuleId: "infant" }),
  ];
  it("prices each child with the rule bound to its age category, including an explicit zero infant rule", () => {
    const result = quote(rules, { childAges: [0, 5, 7], ageBands: bands });
    expect(result).toMatchObject({ state: "CALCULATED", totalCents: 2000n + 1200n });
    expect(result.lines.map((line) => [line.priceRuleId, line.quantity, line.ageRuleId])).toEqual([
      ["adult", 2, null],
      ["infantRate", 1, "infant"],
      ["childRate", 2, "child"],
    ]);
  });
  it("never derives a child price from the adult rate", () => {
    expect(quote([rule("adult", 1000n)], { childAges: [5], ageBands: bands }).reasons).toEqual([
      "CHILD_PRICE_RULE_REQUIRED",
    ]);
    expect(quote(rules, { childAges: [5] }).reasons).toEqual(["CHILD_PRICE_RULE_REQUIRED"]);
    expect(quote(rules, { childAges: [14], ageBands: bands }).reasons).toEqual(["CHILD_PRICE_RULE_REQUIRED"]);
  });
  it("rejects a zero amount outside the infant category", () => {
    const zeroChild = [rule("adult", 1000n), rule("free", 0n, { ageRuleId: "child" })];
    expect(quote(zeroChild, { childAges: [5], ageBands: bands }).reasons).toEqual(["PRICE_RULE_INVALID:free"]);
    expect(quote([rule("adult", 0n)]).reasons).toEqual(["PRICE_RULE_INVALID:adult"]);
  });
  it("reviews overlapping and height-based age rules", () => {
    expect(quote(rules, { childAges: [1], ageBands: [...bands, band("toddler", "CHILD", 1, 3)] }).reasons).toEqual([
      "AGE_RULE_AMBIGUOUS",
    ]);
    expect(quote(rules, { childAges: [5], ageBands: [{ ...bands[1]!, basis: "HEIGHT_CM" }] }).reasons).toEqual([
      "AGE_RULE_BASIS_UNSUPPORTED",
    ]);
  });
  it("respects season and accommodation constraints for child rules too", () => {
    const seasonal = [rule("adult", 1000n), rule("childHigh", 700n, { ageRuleId: "child", season: high })];
    expect(quote(seasonal, { childAges: [5], ageBands: bands, travelDate: "2027-02-01" }).reasons).toEqual([
      "CHILD_PRICE_RULE_REQUIRED",
    ]);
    expect(quote(seasonal, { childAges: [5], ageBands: bands, travelDate: "2026-12-20" }).totalCents).toBe(2700n);
  });
  it("lets a per-booking rate cover the whole party", () => {
    const group = [rule("group", 5000n, { unit: "PER_BOOKING", maxTravelers: 4 })];
    expect(quote(group, { childAges: [5, 8] })).toMatchObject({ state: "CALCULATED", totalCents: 5000n });
    expect(quote(group, { childAges: [5, 8, 9] }).reasons).toEqual(["BASE_RATE_REQUIRED"]);
  });
  it("prices optional items per category and asks for a child rule when missing", () => {
    const items = [
      { kind: "PACKAGE" as const, targetId: "pkg", rules },
      { kind: "TOUR" as const, targetId: "tour", rules: [rule("tour", 50n)] },
    ];
    expect(calculateCommercialQuote({ adults: 1, childAges: [5], ageBands: bands, items }).reasons).toEqual([
      "CHILD_PRICE_RULE_REQUIRED",
    ]);
  });
});

describe("classifyAge", () => {
  it("uses the most specific scope that defines bands", () => {
    const pkgBand = band("pkg", "CHILD", 2, 11);
    const global = band("global", "CHILD", 0, 17, { scope: "GLOBAL" });
    expect(classifyAge(5, [global, pkgBand])).toEqual({ band: pkgBand });
    expect(classifyAge(14, [global, pkgBand])).toEqual({ reason: "CHILD_PRICE_RULE_REQUIRED" });
    expect(classifyAge(14, [global, { ...pkgBand, scope: "DESTINATION" as const, id: "dest" }])).toEqual({
      reason: "CHILD_PRICE_RULE_REQUIRED",
    });
    expect(classifyAge(14, [global])).toEqual({ band: global });
  });
});

describe("promotions", () => {
  const offer: PromotionOffer = {
    id: "p",
    code: "VERANO",
    name: "Verano",
    discountType: "PERCENT",
    percentBps: 1000,
    amountOffCents: null,
  };
  const now = new Date("2026-11-14T12:00:00Z");
  const promo = {
    active: true,
    isFictitious: false,
    startsAt: new Date("2026-11-01T00:00:00Z"),
    endsAt: new Date("2026-11-30T00:00:00Z"),
    maxRedemptions: 10,
    redemptionCount: 3,
    packageId: null,
    destinationId: null,
  };
  const ctx = { now, packageId: "pkg", destinationId: "dest" };
  it("applies a percentage once on the subtotal as a negative line", () => {
    const result = quote([rule("base", 1005n)], { promotion: offer });
    expect(result).toMatchObject({ state: "CALCULATED", subtotalCents: 2010n, totalCents: 1809n });
    expect(result.lines.at(-1)).toMatchObject({ kind: "PROMOTION", promotionId: "p", quantity: 1, totalCents: -201n });
    expect(result.appliedPromotion?.discountCents).toBe(201n);
  });
  it("caps a fixed amount at the subtotal", () => {
    const fixed = { ...offer, discountType: "FIXED_AMOUNT" as const, percentBps: null, amountOffCents: 5000n };
    expect(promotionDiscount(fixed, 300n)).toBe(300n);
    expect(quote([rule("base", 100n)], { promotion: fixed }).totalCents).toBe(0n);
  });
  it("is not applied while the quote needs review", () => {
    const result = quote([], { promotion: offer });
    expect(result).toMatchObject({ appliedPromotion: null, notices: ["PROMOTION_REQUIRES_REVIEW"] });
    expect(result.lines).toEqual([]);
  });
  it("keeps caller notices without blocking the quote", () => {
    const result = quote([rule("base", 100n)], { notices: ["PROMOTION_CODE_INVALID"] });
    expect(result).toMatchObject({ state: "CALCULATED", reasons: [], notices: ["PROMOTION_CODE_INVALID"] });
  });
  it("checks status, window, scope and redemption cap", () => {
    expect(promotionRejection(promo, ctx)).toBeNull();
    expect(promotionRejection({ ...promo, active: false }, ctx)).toBe("PROMOTION_CODE_INVALID");
    expect(promotionRejection({ ...promo, isFictitious: true }, ctx)).toBe("PROMOTION_CODE_INVALID");
    expect(promotionRejection({ ...promo, endsAt: new Date("2026-11-13T00:00:00Z") }, ctx)).toBe(
      "PROMOTION_CODE_INVALID",
    );
    expect(promotionRejection({ ...promo, startsAt: new Date("2026-11-15T00:00:00Z") }, ctx)).toBe(
      "PROMOTION_CODE_INVALID",
    );
    expect(promotionRejection({ ...promo, packageId: "other" }, ctx)).toBe("PROMOTION_CODE_INVALID");
    expect(promotionRejection({ ...promo, destinationId: "other" }, ctx)).toBe("PROMOTION_CODE_INVALID");
    expect(promotionRejection({ ...promo, packageId: "pkg", destinationId: "dest" }, ctx)).toBeNull();
    expect(promotionRejection({ ...promo, redemptionCount: 10 }, ctx)).toBe("PROMOTION_EXHAUSTED");
    expect(promotionRejection({ ...promo, maxRedemptions: null, redemptionCount: 999 }, ctx)).toBeNull();
  });
});
