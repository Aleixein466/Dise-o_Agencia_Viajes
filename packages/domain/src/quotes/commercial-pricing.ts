/**
 * Commercial pricing for the public catalog. Pure and deterministic, money in bigint cents.
 * Callers pass only approved, persisted rules (active, !isFictitious, inside the sale window). The engine either
 * prices every traveller with an explicit rule or returns REQUIRES_MANUAL_REVIEW with reason codes: no price is
 * ever derived from another one. Contract: docs/orchestration/contracts/pricing-rules.md
 */

/** Calendar date as YYYY-MM-DD (date-only, compared lexicographically). */
export type DateOnly = string;
export type TravelerCategoryCode = "ADULT" | "CHILD" | "INFANT" | "SENIOR";
export type AgeRuleScope = "PACKAGE" | "DESTINATION" | "GLOBAL";

export type AgeBand = {
  id: string;
  category: TravelerCategoryCode;
  basis: "AGE_YEARS" | "HEIGHT_CM";
  minValue: number | null;
  maxValue: number | null;
  scope: AgeRuleScope;
};

export type CommercialRule = {
  id: string;
  description: string;
  amountCents: bigint;
  ruleSetVersion: string;
  unit: "PER_PERSON" | "PER_BOOKING";
  priority: number;
  /** conditions.roomTypeId: the rule only applies to that accommodation. */
  roomTypeId?: string | null;
  /** Travel window: applies only when the travel date is inside [startsOn, endsOn]. */
  season?: { id: string; startsOn: DateOnly; endsOn: DateOnly } | null;
  /** Bound traveller category; null/undefined = adult rate. */
  ageRuleId?: string | null;
  /** People sharing the room; when set it must equal the party size. */
  occupancy?: number | null;
  minTravelers?: number | null;
  maxTravelers?: number | null;
};

export type PricedLineKind = "PACKAGE" | "TRANSPORT" | "TOUR" | "ADD_ON";
export type PricedItem = { kind: PricedLineKind; targetId: string; rules: CommercialRule[] };

export type PromotionOffer = {
  id: string;
  code: string;
  name: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  percentBps: number | null;
  amountOffCents: bigint | null;
};

export type CommercialQuoteInput = {
  adults: number;
  childAges: number[];
  travelDate?: DateOnly;
  roomTypeId?: string;
  roomMaxOccupancy?: number | null;
  /** Approved age bands visible to the package (any scope); the most specific non-empty scope is authoritative. */
  ageBands: AgeBand[];
  /** PACKAGE first (required), then the selected transport/tours/add-ons. */
  items: PricedItem[];
  promotion?: PromotionOffer;
  /** Non-blocking notices computed by the caller (e.g. an unknown promotion code). */
  notices?: string[];
};

export type CommercialLine = {
  kind: PricedLineKind | "PROMOTION";
  priceRuleId: string | null;
  promotionId: string | null;
  ageRuleId: string | null;
  seasonId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: bigint;
  totalCents: bigint;
  ruleSetVersion: string;
};

export type AppliedPromotion = PromotionOffer & { discountCents: bigint };

export type CommercialPricing = {
  state: "CALCULATED" | "REQUIRES_MANUAL_REVIEW";
  subtotalCents: bigint | null;
  totalCents: bigint | null;
  lines: CommercialLine[];
  reasons: string[];
  notices: string[];
  appliedPromotion: AppliedPromotion | null;
};

const MISSING_REASON: Record<PricedLineKind, (targetId: string) => string> = {
  PACKAGE: () => "BASE_RATE_REQUIRED",
  TRANSPORT: () => "TRANSPORT_PRICE_RULE_REQUIRED",
  TOUR: (id) => `OPTIONAL_PRICE_RULE_REQUIRED:${id}`,
  ADD_ON: (id) => `OPTIONAL_PRICE_RULE_REQUIRED:${id}`,
};

export type RuleSelection =
  { rule: CommercialRule } | { reason: "MISSING" | "TRAVEL_DATE_REQUIRED" | "PRICE_RULE_AMBIGUOUS" };

/**
 * Picks the single applicable rule for one traveller category. Filters: category, accommodation, party bounds and
 * travel window. Specificity (accommodation-bound + season-bound) wins, then priority; a remaining tie is ambiguous.
 * A season-bound candidate without a travel date cannot be evaluated, so the date is required.
 */
export function selectCommercialRule(
  rules: CommercialRule[],
  ctx: { ageRuleId: string | null; roomTypeId?: string; travelDate?: DateOnly; partySize: number },
): RuleSelection {
  const fits = rules.filter(
    (rule) =>
      (rule.ageRuleId ?? null) === ctx.ageRuleId &&
      (!rule.roomTypeId || rule.roomTypeId === ctx.roomTypeId) &&
      (rule.occupancy == null || rule.occupancy === ctx.partySize) &&
      (rule.minTravelers == null || ctx.partySize >= rule.minTravelers) &&
      (rule.maxTravelers == null || ctx.partySize <= rule.maxTravelers),
  );
  const date = ctx.travelDate;
  if (!date && fits.some((rule) => rule.season)) return { reason: "TRAVEL_DATE_REQUIRED" };
  const candidates = fits.filter(
    (rule) => !rule.season || (date !== undefined && rule.season.startsOn <= date && date <= rule.season.endsOn),
  );
  if (!candidates.length) return { reason: "MISSING" };
  const rank = (rule: CommercialRule) => (rule.roomTypeId ? 1 : 0) + (rule.season ? 1 : 0);
  const best = Math.max(...candidates.map(rank));
  const top = candidates.filter((rule) => rank(rule) === best);
  const priority = Math.max(...top.map((rule) => rule.priority));
  const winners = top.filter((rule) => rule.priority === priority);
  return winners.length === 1 ? { rule: winners[0]! } : { reason: "PRICE_RULE_AMBIGUOUS" };
}

/** Classifies a child age with the most specific scope that defines any band (package, then destination, then global). */
export function classifyAge(age: number, bands: AgeBand[]): { band: AgeBand } | { reason: string } {
  const scope = (["PACKAGE", "DESTINATION", "GLOBAL"] as const).find((tier) =>
    bands.some((band) => band.scope === tier),
  );
  const tier = bands.filter((band) => band.scope === scope);
  if (tier.some((band) => band.basis !== "AGE_YEARS")) return { reason: "AGE_RULE_BASIS_UNSUPPORTED" };
  const matches = tier.filter(
    (band) => (band.minValue == null || age >= band.minValue) && (band.maxValue == null || age <= band.maxValue),
  );
  if (matches.length > 1) return { reason: "AGE_RULE_AMBIGUOUS" };
  return matches.length ? { band: matches[0]! } : { reason: "CHILD_PRICE_RULE_REQUIRED" };
}

export type PromotionRejection = "PROMOTION_CODE_INVALID" | "PROMOTION_EXHAUSTED";

/** Eligibility of a promotion entered by code. Returns null when it can be applied. */
export function promotionRejection(
  promotion: {
    active: boolean;
    isFictitious: boolean;
    startsAt: Date;
    endsAt: Date;
    maxRedemptions: number | null;
    redemptionCount: number;
    packageId: string | null;
    destinationId: string | null;
  },
  ctx: { now: Date; packageId: string; destinationId: string },
): PromotionRejection | null {
  if (!promotion.active || promotion.isFictitious) return "PROMOTION_CODE_INVALID";
  if (ctx.now < promotion.startsAt || ctx.now > promotion.endsAt) return "PROMOTION_CODE_INVALID";
  if (promotion.packageId && promotion.packageId !== ctx.packageId) return "PROMOTION_CODE_INVALID";
  if (promotion.destinationId && promotion.destinationId !== ctx.destinationId) return "PROMOTION_CODE_INVALID";
  if (promotion.maxRedemptions != null && promotion.redemptionCount >= promotion.maxRedemptions)
    return "PROMOTION_EXHAUSTED";
  return null;
}

/** Discount for a subtotal: applied once, floor-rounded, never above the subtotal. */
export function promotionDiscount(offer: PromotionOffer, subtotalCents: bigint): bigint {
  let raw = 0n;
  if (offer.discountType === "PERCENT" && offer.percentBps && offer.percentBps > 0)
    raw = (subtotalCents * BigInt(Math.min(Math.trunc(offer.percentBps), 10_000))) / 10_000n;
  if (offer.discountType === "FIXED_AMOUNT" && offer.amountOffCents && offer.amountOffCents > 0n)
    raw = offer.amountOffCents;
  return raw > subtotalCents ? subtotalCents : raw;
}

export function calculateCommercialQuote(input: CommercialQuoteInput): CommercialPricing {
  const reasons = new Set<string>();
  const notices = new Set(input.notices ?? []);
  const lines: CommercialLine[] = [];
  const partySize = input.adults + input.childAges.length;
  if (!Number.isInteger(input.adults) || input.adults < 1) reasons.add("ADULT_COUNT_INVALID");
  const validAges = input.childAges.every((age) => Number.isInteger(age) && age >= 0 && age <= 17);
  if (!validAges) reasons.add("CHILD_AGE_INVALID");
  // Multi-room allocation is not supported: a party larger than the room goes to an advisor.
  if (input.roomMaxOccupancy != null && partySize > input.roomMaxOccupancy) reasons.add("OCCUPANCY_EXCEEDED");
  if (input.items[0]?.kind !== "PACKAGE") reasons.add("BASE_RATE_REQUIRED");

  const children = validAges ? input.childAges.map((age) => classifyAge(age, input.ageBands)) : [];
  const perBand = new Map<string, { band: AgeBand; count: number }>();
  // Classification only matters for per-person items; a per-booking rate already covers every traveller.
  const childReasons = new Set<string>();
  for (const child of children) {
    if ("reason" in child) childReasons.add(child.reason);
    else perBand.set(child.band.id, { band: child.band, count: (perBand.get(child.band.id)?.count ?? 0) + 1 });
  }

  const ctx = { roomTypeId: input.roomTypeId, travelDate: input.travelDate, partySize };
  const push = (kind: PricedLineKind, rule: CommercialRule, quantity: number, band: AgeBand | null) => {
    // Zero is an explicit, valid amount only for an infant category rule.
    if (rule.amountCents < 0n || (rule.amountCents === 0n && band?.category !== "INFANT")) {
      reasons.add(`PRICE_RULE_INVALID:${rule.id}`);
      return;
    }
    const billed = rule.unit === "PER_BOOKING" ? 1 : quantity;
    lines.push({
      kind,
      priceRuleId: rule.id,
      promotionId: null,
      ageRuleId: band?.id ?? null,
      seasonId: rule.season?.id ?? null,
      description: rule.description,
      quantity: billed,
      unitPriceCents: rule.amountCents,
      totalCents: rule.amountCents * BigInt(billed),
      ruleSetVersion: rule.ruleSetVersion,
    });
  };

  for (const item of input.items) {
    const adult = selectCommercialRule(item.rules, { ...ctx, ageRuleId: null });
    if ("reason" in adult) {
      reasons.add(adult.reason === "MISSING" ? MISSING_REASON[item.kind](item.targetId) : adult.reason);
      continue;
    }
    push(item.kind, adult.rule, input.adults, null);
    // A per-booking rate prices the complete party (its traveller bounds already count the children).
    if (adult.rule.unit === "PER_BOOKING") continue;
    for (const reason of childReasons) reasons.add(reason);
    for (const { band, count } of perBand.values()) {
      const child = selectCommercialRule(item.rules, { ...ctx, ageRuleId: band.id });
      if ("reason" in child) reasons.add(child.reason === "MISSING" ? "CHILD_PRICE_RULE_REQUIRED" : child.reason);
      else push(item.kind, child.rule, count, band);
    }
  }

  if (reasons.size) {
    if (input.promotion) notices.add("PROMOTION_REQUIRES_REVIEW");
    return {
      state: "REQUIRES_MANUAL_REVIEW",
      subtotalCents: null,
      totalCents: null,
      lines,
      reasons: [...reasons],
      notices: [...notices],
      appliedPromotion: null,
    };
  }
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0n);
  let appliedPromotion: AppliedPromotion | null = null;
  if (input.promotion) {
    const discountCents = promotionDiscount(input.promotion, subtotalCents);
    if (discountCents > 0n) {
      appliedPromotion = { ...input.promotion, discountCents };
      lines.push({
        kind: "PROMOTION",
        priceRuleId: null,
        promotionId: input.promotion.id,
        ageRuleId: null,
        seasonId: null,
        description: `Promoción ${input.promotion.name}`,
        quantity: 1,
        unitPriceCents: -discountCents,
        totalCents: -discountCents,
        ruleSetVersion: lines[0]?.ruleSetVersion ?? "promotion",
      });
    } else notices.add("PROMOTION_CODE_INVALID");
  }
  return {
    state: "CALCULATED",
    subtotalCents,
    totalCents: subtotalCents - (appliedPromotion?.discountCents ?? 0n),
    lines,
    reasons: [],
    notices: [...notices],
    appliedPromotion,
  };
}
