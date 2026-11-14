export type DraftPriceRule = {
  id: string;
  description: string;
  amountCents: bigint;
  ruleSetVersion: string;
  isFictitious: boolean;
};
export type DraftSelection = {
  adults: number;
  childAges: number[];
  baseRule?: DraftPriceRule;
  optionalRules: DraftPriceRule[];
  missingOptionalRuleIds: string[];
  transportSelectedWithoutRule: boolean;
};
export type DraftPriceLine = {
  priceRuleId: string;
  description: string;
  quantity: number;
  unitPriceCents: bigint;
  totalCents: bigint;
  ruleSetVersion: string;
  isFictitious: boolean;
};
export type DraftPricing = {
  state: "CALCULATED" | "REQUIRES_MANUAL_REVIEW";
  totalCents: bigint | null;
  lines: DraftPriceLine[];
  reasons: string[];
};

/**
 * Administrative draft pricing intentionally only prices explicit, persisted rules.
 * It never derives child, transport, or optional-tour prices from a base adult rule.
 */
export function calculateDraftQuote(input: DraftSelection): DraftPricing {
  const reasons: string[] = [];
  const lines: DraftPriceLine[] = [];
  if (!Number.isInteger(input.adults) || input.adults < 1) reasons.push("ADULT_COUNT_INVALID");
  if (input.childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) reasons.push("CHILD_AGE_INVALID");
  if (input.childAges.length) reasons.push("CHILD_PRICE_RULE_REQUIRED");
  if (!input.baseRule) reasons.push("BASE_RATE_REQUIRED");
  if (input.transportSelectedWithoutRule) reasons.push("TRANSPORT_PRICE_RULE_REQUIRED");
  for (const id of input.missingOptionalRuleIds) reasons.push(`OPTIONAL_PRICE_RULE_REQUIRED:${id}`);

  const add = (rule: DraftPriceRule, quantity: number) => {
    if (rule.amountCents <= 0n) {
      reasons.push(`PRICE_RULE_INVALID:${rule.id}`);
      return;
    }
    lines.push({
      priceRuleId: rule.id,
      description: rule.description,
      quantity,
      unitPriceCents: rule.amountCents,
      totalCents: rule.amountCents * BigInt(quantity),
      ruleSetVersion: rule.ruleSetVersion,
      isFictitious: rule.isFictitious,
    });
  };
  if (input.baseRule && input.adults > 0) add(input.baseRule, input.adults);
  for (const rule of input.optionalRules) add(rule, input.adults);

  if (reasons.length) return { state: "REQUIRES_MANUAL_REVIEW", totalCents: null, lines, reasons };
  return {
    state: "CALCULATED",
    totalCents: lines.reduce((total, line) => total + line.totalCents, 0n),
    lines,
    reasons: [],
  };
}
