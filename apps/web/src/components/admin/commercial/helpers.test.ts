import { describe, expect, it } from "vitest";
import {
  actionLabel,
  ageRulePayload,
  ageRuleValues,
  blankAgeRule,
  blankPriceRule,
  blankPromotion,
  blankSeason,
  bpsToPercent,
  centsToPesosInput,
  dayEndInstant,
  dayStartInstant,
  describeError,
  errorField,
  formatCop,
  formatDate,
  instantToDate,
  isValidDate,
  parsePercentToBps,
  parsePesos,
  priceRuleCreatePayload,
  priceRulePatchPayload,
  priceRuleValues,
  promotionPayload,
  promotionValues,
  seasonPayload,
  statusLabel,
  summarizeChanges,
  validateAgeRule,
  validatePriceRule,
  validatePromotion,
  validateSeason,
} from "./helpers";
import { resolveTab } from "./tabs";

describe("money", () => {
  it("formats cents as grouped COP without Number math", () => {
    expect(formatCop("100000000")).toBe("$ 1.000.000");
    expect(formatCop("123460000")).toBe("$ 1.234.600");
    expect(formatCop("9007199254740993123")).toBe("$ 90.071.992.547.409.931,23");
    expect(formatCop("50")).toBe("$ 0,50");
    expect(formatCop("0")).toBe("$ 0");
    expect(formatCop(null)).toBe("—");
    expect(formatCop("abc")).toBe("—");
  });
  it("parses pesos typed by people into cents", () => {
    expect(parsePesos("500000")).toEqual({ ok: true, cents: "50000000" });
    expect(parsePesos("$ 1.500.000")).toEqual({ ok: true, cents: "150000000" });
    expect(parsePesos("99,5")).toEqual({ ok: true, cents: "9950" });
    expect(parsePesos("1000.50").ok).toBe(false);
    expect(parsePesos("1,2,3").ok).toBe(false);
    expect(parsePesos("12,345").ok).toBe(false);
    expect(parsePesos("").ok).toBe(false);
    expect(parsePesos("-5").ok).toBe(false);
    expect(parsePesos("99999999999999").ok).toBe(false);
  });
  it("round-trips cents to the editable text", () => {
    expect(centsToPesosInput("50000000")).toBe("500000");
    expect(centsToPesosInput("9950")).toBe("99,50");
    expect(parsePesos(centsToPesosInput("9950"))).toEqual({ ok: true, cents: "9950" });
    expect(centsToPesosInput(null)).toBe("");
  });
  it("converts percentages to basis points and back", () => {
    expect(parsePercentToBps("10")).toBe(1000);
    expect(parsePercentToBps("12,5")).toBe(1250);
    expect(parsePercentToBps("12.25 %")).toBe(1225);
    expect(parsePercentToBps("100")).toBe(10000);
    expect(parsePercentToBps("100,01")).toBeNull();
    expect(parsePercentToBps("0")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(bpsToPercent(1000)).toBe("10");
    expect(bpsToPercent(1250)).toBe("12,5");
    expect(bpsToPercent(1225)).toBe("12,25");
    expect(bpsToPercent(null)).toBe("");
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDate("2026-12-31")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("31/12/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
  it("pins days to Colombian time and back", () => {
    expect(dayStartInstant("2026-12-01")).toBe("2026-12-01T05:00:00Z");
    expect(dayEndInstant("2026-12-31")).toBe("2027-01-01T04:59:59Z");
    expect(instantToDate("2026-12-01T05:00:00Z")).toBe("2026-12-01");
    expect(instantToDate("2027-01-01T04:59:59.000Z")).toBe("2026-12-31");
    expect(instantToDate(null)).toBe("");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("season form", () => {
  const valid = { ...blankSeason(), name: "Temporada alta", startsOn: "2026-12-01", endsOn: "2027-01-15" };
  it("accepts a valid season and builds the payload with scope", () => {
    expect(validateSeason(valid)).toEqual({});
    expect(seasonPayload(valid)).toEqual({
      name: "Temporada alta",
      startsOn: "2026-12-01",
      endsOn: "2027-01-15",
      notes: null,
      destinationId: null,
      packageId: null,
    });
    expect(seasonPayload({ ...valid, scope: "PACKAGE", packageId: "p1", destinationId: "d1" })).toMatchObject({
      packageId: "p1",
      destinationId: null,
    });
  });
  it("reports field errors", () => {
    const errors = validateSeason({ ...valid, name: "A", startsOn: "2027-02-01", scope: "DESTINATION" });
    expect(errors.name).toBeDefined();
    expect(errors.endsOn).toMatch(/anterior/);
    expect(errors.destinationId).toBeDefined();
    expect(validateSeason(blankSeason()).startsOn).toBeDefined();
  });
});

describe("age rule form", () => {
  const valid = { ...blankAgeRule(), name: "Niños 2 a 11", minValue: "2", maxValue: "11" };
  it("builds the years-based payload", () => {
    expect(validateAgeRule(valid)).toEqual({});
    expect(ageRulePayload(valid)).toMatchObject({ category: "CHILD", basis: "AGE_YEARS", minValue: 2, maxValue: 11 });
    expect(ageRuleValues({ name: "x", category: "INFANT", minValue: 0, maxValue: 1, scope: "GLOBAL" })).toMatchObject({
      minValue: "0",
      maxValue: "1",
    });
  });
  it("rejects out-of-range and inverted bands", () => {
    expect(validateAgeRule({ ...valid, maxValue: "18" }).maxValue).toBeDefined();
    expect(validateAgeRule({ ...valid, minValue: "12" }).minValue).toMatch(/superar/);
    expect(validateAgeRule({ ...valid, minValue: "" }).minValue).toBeDefined();
    expect(validateAgeRule({ ...valid, minValue: "1.5" }).minValue).toBeDefined();
  });
});

describe("promotion form", () => {
  const valid = {
    ...blankPromotion(),
    code: " verano26 ",
    name: "Verano",
    percent: "10",
    startsOn: "2026-12-01",
    endsOn: "2026-12-31",
  };
  it("normalizes the code and sends percent as basis points", () => {
    expect(validatePromotion(valid)).toEqual({});
    expect(promotionPayload(valid)).toMatchObject({
      code: "VERANO26",
      discountType: "PERCENT",
      percentBps: 1000,
      amountOffCents: null,
      startsAt: "2026-12-01T05:00:00Z",
      endsAt: "2027-01-01T04:59:59Z",
      maxRedemptions: null,
    });
  });
  it("sends fixed amounts as cents strings", () => {
    const fixed = { ...valid, discountType: "FIXED_AMOUNT", amount: "50.000", maxRedemptions: "20" };
    expect(validatePromotion(fixed)).toEqual({});
    expect(promotionPayload(fixed)).toMatchObject({ percentBps: null, amountOffCents: "5000000", maxRedemptions: 20 });
  });
  it("reports discount, code and limit errors", () => {
    expect(validatePromotion({ ...valid, code: "con espacio" }).code).toBeDefined();
    expect(validatePromotion({ ...valid, percent: "" }).percent).toBeDefined();
    expect(validatePromotion({ ...valid, discountType: "FIXED_AMOUNT", amount: "0" }).amount).toBeDefined();
    expect(validatePromotion({ ...valid, endsOn: "2026-11-01" }).endsOn).toBeDefined();
    expect(validatePromotion({ ...valid, maxRedemptions: "3" }, 5).maxRedemptions).toMatch(/5 usos/);
    expect(validatePromotion({ ...valid, maxRedemptions: "0" }).maxRedemptions).toBeDefined();
  });
  it("loads an existing promotion back into the form", () => {
    const values = promotionValues({
      code: "X",
      name: "n",
      discountType: "FIXED_AMOUNT",
      percentBps: null,
      amountOffCents: "5000000",
      startsAt: "2026-12-01T05:00:00.000Z",
      endsAt: "2027-01-01T04:59:59.000Z",
      maxRedemptions: null,
      scope: "GLOBAL",
    });
    expect(values).toMatchObject({ amount: "50000", startsOn: "2026-12-01", endsOn: "2026-12-31", maxRedemptions: "" });
  });
});

describe("price rule conditions", () => {
  const valid = { ...blankPriceRule(), name: "Doble temporada alta", amount: "500000", ruleSetVersion: "2026-1" };
  it("validates numeric and range fields", () => {
    expect(validatePriceRule(valid, "create")).toEqual({});
    expect(validatePriceRule({ ...valid, ruleSetVersion: "" }, "create").ruleSetVersion).toBeDefined();
    expect(validatePriceRule({ ...valid, ruleSetVersion: "" }, "edit")).toEqual({});
    expect(validatePriceRule({ ...valid, amount: "abc" }, "edit").amount).toBeDefined();
    expect(validatePriceRule({ ...valid, occupancy: "51" }, "edit").occupancy).toBeDefined();
    expect(validatePriceRule({ ...valid, minTravelers: "5", maxTravelers: "2" }, "edit").minTravelers).toBeDefined();
    expect(validatePriceRule({ ...valid, priority: "2000" }, "edit").priority).toBeDefined();
    expect(validatePriceRule({ ...valid, priority: "-5" }, "edit")).toEqual({});
    expect(
      validatePriceRule({ ...valid, validFrom: "2026-05-01", validTo: "2026-04-01" }, "edit").validTo,
    ).toBeDefined();
  });
  it("create sends only required and filled optional fields", () => {
    expect(priceRuleCreatePayload(valid, "pkg")).toEqual({
      packageId: "pkg",
      ruleSetVersion: "2026-1",
      name: "Doble temporada alta",
      unit: "PER_PERSON",
      amountCents: "50000000",
    });
    expect(
      priceRuleCreatePayload(
        { ...valid, seasonId: "s1", occupancy: "2", priority: "5", validFrom: "2026-05-01" },
        "pkg",
      ),
    ).toMatchObject({ seasonId: "s1", occupancy: 2, priority: 5, validFrom: "2026-05-01T05:00:00Z" });
  });
  it("edit sends only what changed, with null to clear", () => {
    const initial = priceRuleValues({
      name: "Base",
      unit: "PER_PERSON",
      amountCents: "50000000",
      seasonId: "s1",
      occupancy: 2,
      conditions: { roomTypeId: "room" },
    });
    expect(initial).toMatchObject({ amount: "500000", seasonId: "s1", occupancy: "2", roomTypeId: "room" });
    expect(priceRulePatchPayload(initial, initial)).toEqual({});
    expect(priceRulePatchPayload({ ...initial, seasonId: "", amount: "600000" }, initial)).toEqual({
      seasonId: null,
      amountCents: "60000000",
    });
  });
});

describe("error mapping", () => {
  it("maps API codes to Spanish and field names", () => {
    expect(describeError({ status: 409, data: { code: "SEASON_OVERLAP" } }).message).toMatch(/se cruza/);
    expect(describeError({ status: 409, data: { code: "PROMOTION_CODE_TAKEN" } }).field).toBe("code");
    expect(describeError({ status: 400, data: { code: "DATE_RANGE_INVALID" } }).field).toBe("endsOn");
    expect(describeError({ status: 409, data: { code: "PRICE_RULE_AMBIGUOUS", conflictId: "abc" } }).message).toContain(
      "abc",
    );
    expect(errorField("DISCOUNT_INVALID", { discountType: "FIXED_AMOUNT" })).toBe("amount");
    expect(errorField("DISCOUNT_INVALID", { discountType: "PERCENT" })).toBe("percent");
  });
  it("falls back by HTTP status", () => {
    expect(describeError({ status: 403, data: null }).message).toMatch(/permiso/);
    expect(describeError({ status: 0, data: null }).message).toMatch(/conexión/);
    expect(describeError({ status: 500, data: { code: "WHATEVER" } }).message).toMatch(/No se pudo/);
  });
});

describe("labels and history", () => {
  it("labels lifecycle states and audit actions", () => {
    expect(statusLabel("draft")).toBe("Borrador");
    expect(statusLabel("approved")).toBe("Aprobada");
    expect(statusLabel("inactive")).toBe("Inactiva");
    expect(actionLabel("seasons.approved")).toBe("Aprobada");
    expect(actionLabel("pricing.draft_created")).toBe("Creada como borrador");
  });
  it("summarizes changed fields with COP formatting", () => {
    const lines = summarizeChanges({
      before: { amountCents: "100000000", status: "draft", name: "A", updatedAt: "x" },
      after: { amountCents: "120000000", status: "approved", name: "A", updatedAt: "y" },
    });
    expect(lines).toContain("Valor: $ 1.000.000 → $ 1.200.000");
    expect(lines).toContain("Estado: Borrador → Aprobada");
    expect(lines.some((line) => line.startsWith("Nombre"))).toBe(false);
    expect(summarizeChanges({ before: null, after: { name: "A" } })).toEqual([]);
  });
});

describe("tabs", () => {
  it("defaults to the price rules for unknown values", () => {
    expect(resolveTab(undefined)).toBe("reglas");
    expect(resolveTab("temporadas")).toBe("temporadas");
    expect(resolveTab(["promociones", "edades"])).toBe("promociones");
    expect(resolveTab("nope")).toBe("reglas");
  });
});
