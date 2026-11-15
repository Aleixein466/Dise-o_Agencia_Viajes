import { describe, expect, it, vi } from "vitest";
import { PublicCatalogService } from "./public-catalog.service";

const pkgId = "00000000-0000-4000-8000-000000000001";
const destId = "00000000-0000-4000-8000-000000000003";
const room = "00000000-0000-4000-8000-000000000010";
const bus = "00000000-0000-4000-8000-000000000020";
const hotel = "00000000-0000-4000-8000-000000000030";
const rule = (id: string, amountCents: bigint, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  amountCents,
  unit: "PER_PERSON",
  ruleSetVersion: "1",
  priority: 0,
  active: true,
  isFictitious: false,
  validFrom: null,
  validTo: null,
  conditions: null,
  transportOptionId: null,
  tourId: null,
  addOnId: null,
  seasonId: null,
  season: null,
  ageRuleId: null,
  ageRule: null,
  occupancy: null,
  minTravelers: null,
  maxTravelers: null,
  ...extra,
});
type Rule = ReturnType<typeof rule>;
const promo = (extra: Record<string, unknown> = {}) => ({
  id: "promo-1",
  code: "VERANO10",
  name: "Verano",
  discountType: "PERCENT",
  percentBps: 1000,
  amountOffCents: null,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 86_400_000),
  maxRedemptions: 5,
  redemptionCount: 0,
  packageId: null,
  destinationId: null,
  active: true,
  isFictitious: false,
  ...extra,
});
function service(
  packageRules: Rule[],
  opts: { targeted?: Rule[]; ageRules?: unknown[]; promotions?: unknown[]; maxOccupancy?: number } = {},
) {
  const promotionFind = vi.fn(async () => opts.promotions ?? []);
  const db = {
    client: vi.fn(async () => ({
      tourPackage: {
        findFirst: vi.fn(async () => ({
          id: pkgId,
          title: "Paquete",
          destinationId: destId,
          priceRules: packageRules,
          components: [
            {
              type: "HOTEL",
              included: true,
              hotelId: hotel,
              transportOptionId: null,
              tourId: null,
              addOnId: null,
              hotel: { roomTypes: [{ id: room, maxOccupancy: opts.maxOccupancy ?? 4 }] },
            },
            {
              type: "TRANSPORT",
              included: false,
              hotelId: null,
              transportOptionId: bus,
              tourId: null,
              addOnId: null,
              hotel: null,
            },
          ],
        })),
      },
      priceRule: { findMany: vi.fn(async () => opts.targeted ?? []) },
      ageRule: { findMany: vi.fn(async () => opts.ageRules ?? []) },
      promotion: { findMany: promotionFind },
    })),
  };
  return { value: new PublicCatalogService(db as never), promotionFind };
}
const base = {
  packageId: pkgId,
  hotelId: hotel,
  roomTypeId: room,
  adults: 2,
  childAges: [] as number[],
  optionalTourIds: [],
  addOnIds: [],
};

describe("PublicCatalogService pricing", () => {
  it("excludes draft and fictitious rules from a public preview", async () => {
    const preview = await service([
      rule("draft", 100n, { active: false }),
      rule("fake", 100n, { isFictitious: true }),
    ]).value.preview(base);
    expect(preview).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
    expect(preview.lines).toEqual([]);
  });

  it("uses the accommodation rate as base and charges approved transport", async () => {
    const selection = { ...base, transportOptionId: bus };
    const targeted = [rule("bus", 50n, { transportOptionId: bus })];
    const preview = await service([rule("generic", 100n), rule("double", 300n, { conditions: { roomTypeId: room } })], {
      targeted,
    }).value.preview(selection);
    expect(preview).toMatchObject({ status: "PRICED", totalCents: "700" });
    expect(preview.lines.map((l) => l.label)).toEqual(["double", "bus"]);
    // Two unbound package rates are ambiguous: never guess a base price.
    const ambiguous = await service([rule("a", 100n), rule("b", 200n)], { targeted }).value.preview(selection);
    expect(ambiguous).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
  });

  it("applies a real season only inside its window and asks for the travel date", async () => {
    const season = {
      id: "s1",
      startsOn: new Date("2026-12-15T00:00:00Z"),
      endsOn: new Date("2027-01-15T00:00:00Z"),
      isFictitious: false,
      active: true,
      destinationId: destId,
      packageId: null as string | null,
    };
    const rules = [rule("regular", 100n), rule("high", 150n, { seasonId: "s1", season })];
    const { value } = service(rules);
    expect(await value.preview({ ...base, travelDate: "2026-12-20" })).toMatchObject({
      status: "PRICED",
      totalCents: "300",
    });
    expect(await value.preview({ ...base, travelDate: "2027-02-01" })).toMatchObject({
      status: "PRICED",
      totalCents: "200",
    });
    expect(await value.preview(base)).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", travelDateRequired: true });
    // A fictitious season never makes its rule public.
    const fake = service([rule("high", 150n, { seasonId: "s1", season: { ...season, isFictitious: true } })]).value;
    expect(await fake.preview({ ...base, travelDate: "2026-12-20" })).toMatchObject({
      status: "REQUIRES_MANUAL_REVIEW",
      travelDateRequired: false,
    });
  });

  it("ignores deactivated seasons and seasons scoped to another package", async () => {
    const season = {
      id: "s1",
      startsOn: new Date("2026-12-15T00:00:00Z"),
      endsOn: new Date("2027-01-15T00:00:00Z"),
      isFictitious: false,
      active: true,
      destinationId: destId,
      packageId: null as string | null,
    };
    const priced = (s: typeof season) =>
      service([rule("regular", 100n), rule("high", 150n, { seasonId: "s1", season: s })]).value.preview({
        ...base,
        travelDate: "2026-12-20",
      });
    expect(await priced({ ...season, packageId: pkgId })).toMatchObject({ totalCents: "300" });
    expect(await priced({ ...season, active: false })).toMatchObject({ totalCents: "200" });
    expect(await priced({ ...season, packageId: "00000000-0000-4000-8000-000000000099" })).toMatchObject({
      totalCents: "200",
    });
  });

  it("prices children only with approved age rules and their bound rates", async () => {
    const ageRules = [
      {
        id: "infant",
        category: "INFANT",
        basis: "AGE_YEARS",
        minValue: 0,
        maxValue: 1,
        packageId: pkgId,
        destinationId: null,
      },
      {
        id: "child",
        category: "CHILD",
        basis: "AGE_YEARS",
        minValue: 2,
        maxValue: 11,
        packageId: pkgId,
        destinationId: null,
      },
    ];
    const rules = [
      rule("adult", 1000n),
      rule("kid", 600n, { ageRuleId: "child", ageRule: { id: "child", isFictitious: false, active: true } }),
      rule("baby", 0n, { ageRuleId: "infant", ageRule: { id: "infant", isFictitious: false, active: true } }),
    ];
    const priced = await service(rules, { ageRules }).value.preview({ ...base, childAges: [0, 6] });
    expect(priced).toMatchObject({ status: "PRICED", totalCents: "2600" });
    const missing = await service([rule("adult", 1000n)], { ageRules }).value.preview({ ...base, childAges: [6] });
    expect(missing).toMatchObject({
      status: "REQUIRES_MANUAL_REVIEW",
      reasons: ["Se requiere revisión manual para menores"],
    });
    // A rate bound to a deactivated age rule never prices a minor.
    const inactive = [
      rule("adult", 1000n),
      rule("kid", 600n, { ageRuleId: "child", ageRule: { id: "child", isFictitious: false, active: false } }),
    ];
    expect(await service(inactive, { ageRules }).value.preview({ ...base, childAges: [6] })).toMatchObject({
      status: "REQUIRES_MANUAL_REVIEW",
    });
  });

  it("sends a party larger than the room to review", async () => {
    const preview = await service([rule("base", 100n)], { maxOccupancy: 2 }).value.preview({ ...base, adults: 3 });
    expect(preview).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
  });

  it("applies a valid promotion code once as a negative line", async () => {
    const { value } = service([rule("base", 1000n)], { promotions: [promo()] });
    const preview = await value.preview({ ...base, promotionCode: " verano10 " });
    expect(preview).toMatchObject({
      status: "PRICED",
      totalCents: "1800",
      notices: [],
      promotion: { code: "VERANO10", discountCents: "200" },
    });
    expect(preview.lines.at(-1)).toMatchObject({ totalCents: "-200", quantity: 1 });
  });

  it("ignores invalid, expired, out-of-scope or exhausted codes with a notice", async () => {
    const cases = [
      [],
      [promo({ endsAt: new Date(Date.now() - 1000) })],
      [promo({ packageId: "00000000-0000-4000-8000-000000000099" })],
      [promo({ isFictitious: true })],
      [promo({ redemptionCount: 5 })],
    ];
    for (const promotions of cases) {
      const preview = await service([rule("base", 1000n)], { promotions }).value.preview({
        ...base,
        promotionCode: "VERANO10",
      });
      expect(preview).toMatchObject({ status: "PRICED", totalCents: "2000", promotion: null });
      expect(preview.notices).toHaveLength(1);
    }
    const { value, promotionFind } = service([rule("base", 1000n)]);
    expect((await value.preview({ ...base, promotionCode: "no válido!" })).notices).toHaveLength(1);
    expect(promotionFind).not.toHaveBeenCalled();
  });
});
