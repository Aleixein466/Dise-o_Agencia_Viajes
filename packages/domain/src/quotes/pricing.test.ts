import { describe, expect, it } from "vitest";
import { calculateDraftQuote } from "./pricing";

const base = {
  id: "base",
  description: "Paquete",
  amountCents: 123_450_000n,
  ruleSetVersion: "draft-v1",
  isFictitious: true,
  unit: "PER_PERSON" as const,
};
describe("calculateDraftQuote", () => {
  it("uses bigint cents for explicit adult and optional rules", () => {
    const result = calculateDraftQuote({
      adults: 2,
      childAges: [],
      baseRule: base,
      optionalRules: [{ ...base, id: "tour", amountCents: 10_000_000n }],
      missingOptionalRuleIds: [],
      transportSelectedWithoutRule: false,
    });
    expect(result).toMatchObject({ state: "CALCULATED", totalCents: 266_900_000n });
    expect(result.lines).toHaveLength(2);
  });
  it("requires manual review instead of deriving a child price", () => {
    expect(
      calculateDraftQuote({
        adults: 1,
        childAges: [8],
        baseRule: base,
        optionalRules: [],
        missingOptionalRuleIds: [],
        transportSelectedWithoutRule: false,
      }),
    ).toMatchObject({ state: "REQUIRES_MANUAL_REVIEW", totalCents: null, reasons: ["CHILD_PRICE_RULE_REQUIRED"] });
  });
  it("does not invent a price for selected optional services", () => {
    expect(
      calculateDraftQuote({
        adults: 1,
        childAges: [],
        baseRule: base,
        optionalRules: [],
        missingOptionalRuleIds: ["tour-1"],
        transportSelectedWithoutRule: false,
      }).reasons,
    ).toContain("OPTIONAL_PRICE_RULE_REQUIRED:tour-1");
  });
  it("uses an explicit per-booking rule once for the complete group", () => {
    const result = calculateDraftQuote({
      adults: 4,
      childAges: [],
      baseRule: { ...base, id: "group", amountCents: 400_000_000n, unit: "PER_BOOKING" },
      optionalRules: [],
      missingOptionalRuleIds: [],
      transportSelectedWithoutRule: false,
    });
    expect(result).toMatchObject({ state: "CALCULATED", totalCents: 400_000_000n });
    expect(result.lines[0]).toMatchObject({ quantity: 1, totalCents: 400_000_000n });
  });
});
