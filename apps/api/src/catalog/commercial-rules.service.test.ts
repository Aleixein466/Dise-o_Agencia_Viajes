import { randomUUID } from "node:crypto";
import {
  calculateCommercialQuote,
  isApprovedPublicPriceRule,
  promotionRejection,
  type AgeBand,
  type CommercialRule,
} from "@ricaurte/domain";
import { describe, expect, it, vi } from "vitest";
import { CatalogAdminService } from "./catalog-admin.service";
import { CommercialRulesService, priceRulesMayTie, type TieShape } from "./commercial-rules.service";

// --- In-memory Prisma double: equality / not / in / equals+mode / AND / OR, the relations the services select. ---
type Row = Record<string, unknown> & { id: string };
const TABLES = [
  "season",
  "ageRule",
  "promotion",
  "priceRule",
  "tourPackage",
  "destination",
  "tour",
  "transportOption",
  "addOn",
  "roomType",
  "packageComponent",
  "auditLog",
  "quote",
] as const;
type Table = (typeof TABLES)[number];
const RELATIONS: Partial<Record<Table, Record<string, Table>>> = {
  priceRule: { season: "season", ageRule: "ageRule" },
  ageRule: { package: "tourPackage" },
};
const DEFAULTS: Partial<Record<Table, Record<string, unknown>>> = {
  season: { destinationId: null, packageId: null, notes: null },
  ageRule: { destinationId: null, packageId: null, tourId: null },
  promotion: { redemptionCount: 0, destinationId: null, packageId: null, description: null },
  priceRule: { departureId: null, roomTypeId: null, conditions: null },
};
let clock = Date.parse("2026-11-01T00:00:00.000Z");
const tick = () => new Date(++clock);
const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null);
function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (value === undefined) continue;
    if (key === "AND") {
      if (!(value as Record<string, unknown>[]).every((w) => matches(row, w))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(value as Record<string, unknown>[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const cell = row[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as Record<string, unknown>;
      if ("not" in op && same(cell, op.not)) return false;
      if ("in" in op && !(op.in as unknown[]).some((x) => same(cell, x))) return false;
      if ("equals" in op) {
        const ok =
          op.mode === "insensitive"
            ? String(cell).toLowerCase() === String(op.equals).toLowerCase()
            : same(cell, op.equals);
        if (!ok) return false;
      }
      if ("contains" in op) {
        const needle = String(op.contains);
        const hay = String(cell ?? "");
        const ok = op.mode === "insensitive" ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
        if (!ok) return false;
      }
      continue;
    }
    if (!same(cell, value)) return false;
  }
  return true;
}
function fakeDb(seed: Partial<Record<Table, Row[]>> = {}) {
  const store = Object.fromEntries(TABLES.map((t) => [t, (seed[t] ?? []).map((r) => ({ ...r }))])) as Record<
    Table,
    Row[]
  >;
  const project = (table: Table, row: Row, select?: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...row };
    for (const [key, target] of Object.entries(RELATIONS[table] ?? {}))
      if (select && key in select) {
        const rel = store[target].find((r) => r.id === row[`${key}Id`]);
        out[key] = rel ? { ...rel } : null;
      }
    return out;
  };
  type Args = { where?: Record<string, unknown>; select?: Record<string, unknown>; data?: Record<string, unknown> };
  const delegate = (table: Table) => {
    const find = async ({ where, select }: Args) => {
      const row = store[table].find((r) => matches(r, where));
      return row ? project(table, row, select) : null;
    };
    return {
      findUnique: find,
      findFirst: find,
      findUniqueOrThrow: async (args: Args) => {
        const row = await find(args);
        if (!row) throw new Error("not found");
        return row;
      },
      findMany: async ({ where, select }: Args = {}) =>
        store[table].filter((r) => matches(r, where)).map((r) => project(table, r, select)),
      count: async ({ where }: Args = {}) => store[table].filter((r) => matches(r, where)).length,
      create: async ({ data, select }: Args) => {
        const now = tick();
        const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...DEFAULTS[table], ...data } as Row;
        store[table].push(row);
        return project(table, row, select);
      },
      updateMany: async ({ where, data }: Args) => {
        const rows = store[table].filter((r) => matches(r, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: tick() });
        return { count: rows.length };
      },
    };
  };
  const client: Record<string, unknown> = Object.fromEntries(TABLES.map((t) => [t, delegate(t)]));
  client.$queryRaw = vi.fn(async () => [{ locked: 1 }]);
  client.$transaction = async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]);
  const db = { client: async () => client };
  return {
    store,
    client: client as { $queryRaw: ReturnType<typeof vi.fn> },
    rules: new CommercialRulesService(db as never),
    catalog: new CatalogAdminService(db as never),
  };
}

const D1 = "00000000-0000-4000-8000-0000000000d1";
const D2 = "00000000-0000-4000-8000-0000000000d2";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const H1 = "00000000-0000-4000-8000-0000000000b1";
const R1 = "00000000-0000-4000-8000-0000000000c1";
const R2 = "00000000-0000-4000-8000-0000000000c2";
const ACTOR = "00000000-0000-4000-8000-0000000000ff";
const snapshot = { reasonCodes: [], subtotalCents: "100", promotion: null };
function world() {
  return fakeDb({
    destination: [
      { id: D1, deletedAt: null },
      { id: D2, deletedAt: null },
    ],
    tourPackage: [{ id: P1, destinationId: D1, deletedAt: null }],
    roomType: [
      { id: R1, hotelId: H1, deletedAt: null },
      { id: R2, hotelId: "00000000-0000-4000-8000-0000000000b2", deletedAt: null },
    ],
    packageComponent: [{ id: randomUUID(), packageId: P1, hotelId: H1 }],
    quote: [{ id: randomUUID(), priceSnapshot: snapshot }],
  });
}
const season = (over: Record<string, unknown> = {}) => ({
  name: "Temporada alta",
  startsOn: "2026-12-15",
  endsOn: "2027-01-15",
  destinationId: D1,
  ...over,
});
const band = (over: Record<string, unknown> = {}) => ({
  name: "Niños",
  category: "CHILD" as const,
  minValue: 2,
  maxValue: 11,
  packageId: P1,
  ...over,
});
const promo = (over: Record<string, unknown> = {}) => ({
  code: "verano-26",
  name: "Verano",
  discountType: "PERCENT" as const,
  percentBps: 1000,
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2027-12-31T00:00:00.000Z"),
  packageId: P1,
  ...over,
});
const rule = (over: Record<string, unknown> = {}) => ({
  packageId: P1,
  name: "Adulto",
  unit: "PER_PERSON" as const,
  amountCents: 100_000n,
  ruleSetVersion: "tarifas-2026",
  ...over,
});
const stamp = (row: { updatedAt: Date }) => row.updatedAt;
const code = (value: string, status: number) =>
  expect.objectContaining({ status, response: expect.objectContaining({ code: value }) });

describe("seasons", () => {
  it("creates drafts, derives the destination of a package scope and audits the creation", async () => {
    const w = world();
    const created = await w.rules.createSeason(season({ destinationId: null, packageId: P1 }), ACTOR);
    expect(created).toMatchObject({ status: "draft", scope: "PACKAGE", destinationId: D1, startsOn: "2026-12-15" });
    expect(w.store.auditLog).toEqual([
      expect.objectContaining({ action: "seasons.created", entity: "season", entityId: created.id, actorId: ACTOR }),
    ]);
  });
  it("rejects inverted dates, unknown scopes and contradictory scopes with stable codes", async () => {
    const w = world();
    await expect(w.rules.createSeason(season({ startsOn: "2027-02-01" }), ACTOR)).rejects.toEqual(
      code("DATE_RANGE_INVALID", 400),
    );
    await expect(w.rules.createSeason(season({ destinationId: randomUUID() }), ACTOR)).rejects.toEqual(
      code("SCOPE_NOT_FOUND", 400),
    );
    await expect(w.rules.createSeason(season({ destinationId: D2, packageId: P1 }), ACTOR)).rejects.toEqual(
      code("SCOPE_INVALID", 400),
    );
  });
  it("returns 409 on a stale expectedUpdatedAt and refuses to edit an approved season", async () => {
    const w = world();
    const s = await w.rules.createSeason(season(), ACTOR);
    await expect(w.rules.updateSeason(s.id, { name: "X" }, new Date(0), ACTOR)).rejects.toEqual(
      code("STALE_UPDATE", 409),
    );
    const approved = await w.rules.approveSeason(s.id, stamp(s), ACTOR);
    await expect(w.rules.updateSeason(s.id, { name: "Otra" }, stamp(approved), ACTOR)).rejects.toEqual(
      code("NOT_DRAFT", 409),
    );
  });
  it("blocks overlapping approved seasons in the same scope, under an approval lock", async () => {
    const w = world();
    const a = await w.rules.createSeason(season(), ACTOR);
    await w.rules.approveSeason(a.id, stamp(a), ACTOR);
    expect(w.client.$queryRaw).toHaveBeenCalled();
    const clash = await w.rules.createSeason(season({ startsOn: "2027-01-15", endsOn: "2027-02-01" }), ACTOR);
    await expect(w.rules.approveSeason(clash.id, stamp(clash), ACTOR)).rejects.toEqual(code("SEASON_OVERLAP", 409));
    // Other destination, package scope and the day after are independent.
    for (const other of [
      season({ destinationId: D2 }),
      season({ destinationId: null, packageId: P1 }),
      season({ startsOn: "2027-01-16", endsOn: "2027-02-01" }),
    ]) {
      const s = await w.rules.createSeason(other, ACTOR);
      await expect(w.rules.approveSeason(s.id, stamp(s), ACTOR)).resolves.toMatchObject({ status: "approved" });
    }
  });
  it("deactivates without deleting, withdraws it from the engine and keeps the history", async () => {
    const w = world();
    const s = await w.rules.createSeason(season(), ACTOR);
    const approved = await w.rules.approveSeason(s.id, stamp(s), ACTOR);
    const off = await w.rules.deactivateSeason(s.id, stamp(approved), ACTOR);
    expect(off).toMatchObject({ status: "inactive", active: false, isFictitious: true });
    expect(w.store.season).toHaveLength(1);
    await expect(w.rules.deactivateSeason(s.id, stamp(off), ACTOR)).rejects.toEqual(code("ALREADY_INACTIVE", 409));
    const log = w.store.auditLog.filter((e) => e.entityId === s.id).map((e) => e.action);
    expect(log).toEqual(["seasons.created", "seasons.approved", "seasons.deactivated"]);
    const last = w.store.auditLog.at(-1)!;
    expect(last.before).toMatchObject({ status: "approved" });
    expect(last.after).toMatchObject({ status: "inactive" });
  });
  it("lists with status and scope filters", async () => {
    const w = world();
    const a = await w.rules.createSeason(season(), ACTOR);
    await w.rules.approveSeason(a.id, stamp(a), ACTOR);
    await w.rules.createSeason(season({ destinationId: null }), ACTOR);
    expect((await w.rules.seasons({ status: "approved" }, 1, 20)).items.map((s) => s.id)).toEqual([a.id]);
    expect((await w.rules.seasons({ scope: "GLOBAL" }, 1, 20)).total).toBe(1);
    expect(await w.rules.seasons({}, 1, 20)).toMatchObject({ total: 2, page: 1, pageSize: 20, pages: 1 });
  });
  it("searches by name, case-insensitive", async () => {
    const w = world();
    const a = await w.rules.createSeason(season({ name: "Temporada Alta Diciembre" }), ACTOR);
    await w.rules.createSeason(season({ name: "Semana Santa" }), ACTOR);
    expect((await w.rules.seasons({ q: "alta dic" }, 1, 20)).items.map((s) => s.id)).toEqual([a.id]);
    expect((await w.rules.seasons({ q: "nada" }, 1, 20)).total).toBe(0);
  });
});

describe("age rules", () => {
  it("validates the band, the basis, the category and the scope", async () => {
    const w = world();
    await expect(w.rules.createAgeRule(band({ minValue: 12, maxValue: 3 }), ACTOR)).rejects.toEqual(
      code("AGE_RANGE_INVALID", 400),
    );
    await expect(w.rules.createAgeRule(band({ maxValue: 18 }), ACTOR)).rejects.toEqual(code("AGE_RANGE_INVALID", 400));
    await expect(w.rules.createAgeRule(band({ basis: "HEIGHT_CM" }), ACTOR)).rejects.toEqual(
      code("AGE_RULE_BASIS_UNSUPPORTED", 400),
    );
    await expect(w.rules.createAgeRule(band({ category: "SENIOR" }), ACTOR)).rejects.toEqual(
      code("AGE_RULE_CATEGORY_INVALID", 400),
    );
    await expect(w.rules.createAgeRule(band({ destinationId: D1 }), ACTOR)).rejects.toEqual(code("SCOPE_INVALID", 400));
  });
  it("blocks overlapping approved bands in the same scope only", async () => {
    const w = world();
    const infants = await w.rules.createAgeRule(
      band({ name: "Infantes", category: "INFANT", minValue: 0, maxValue: 1 }),
      ACTOR,
    );
    await w.rules.approveAgeRule(infants.id, stamp(infants), ACTOR);
    const kids = await w.rules.createAgeRule(band(), ACTOR);
    await expect(w.rules.approveAgeRule(kids.id, stamp(kids), ACTOR)).resolves.toMatchObject({ status: "approved" });
    const clash = await w.rules.createAgeRule(band({ minValue: 10, maxValue: 12 }), ACTOR);
    await expect(w.rules.approveAgeRule(clash.id, stamp(clash), ACTOR)).rejects.toEqual(code("AGE_RULE_OVERLAP", 409));
    const global = await w.rules.createAgeRule(band({ packageId: null }), ACTOR);
    await expect(w.rules.approveAgeRule(global.id, stamp(global), ACTOR)).resolves.toMatchObject({ scope: "GLOBAL" });
  });
});

describe("promotions", () => {
  it("normalises the code, keeps amounts as strings and enforces one discount kind", async () => {
    const w = world();
    const created = await w.rules.createPromotion(promo(), ACTOR);
    expect(created).toMatchObject({ code: "VERANO-26", status: "draft", amountOffCents: null });
    const fixed = await w.rules.createPromotion(
      promo({ code: "FIJO", discountType: "FIXED_AMOUNT", percentBps: null, amountOffCents: 50_000n }),
      ACTOR,
    );
    expect(fixed.amountOffCents).toBe("50000");
    for (const bad of [
      { percentBps: 0 },
      { percentBps: 10_001 },
      { amountOffCents: 100n },
      { discountType: "FIXED_AMOUNT", percentBps: null, amountOffCents: 0n },
    ])
      await expect(w.rules.createPromotion(promo({ code: "X1", ...bad }), ACTOR)).rejects.toEqual(
        code("DISCOUNT_INVALID", 400),
      );
  });
  it("rejects a bad code, a taken code (any case), inverted dates and a cap below the redemptions", async () => {
    const w = world();
    await w.rules.createPromotion(promo(), ACTOR);
    await expect(w.rules.createPromotion(promo({ code: "con espacio" }), ACTOR)).rejects.toEqual(
      code("PROMOTION_CODE_INVALID", 400),
    );
    await expect(w.rules.createPromotion(promo({ code: "Verano-26" }), ACTOR)).rejects.toEqual(
      code("PROMOTION_CODE_TAKEN", 409),
    );
    await expect(
      w.rules.createPromotion(promo({ code: "B", endsAt: new Date("2025-01-01T00:00:00.000Z") }), ACTOR),
    ).rejects.toEqual(code("DATE_RANGE_INVALID", 400));
    const draft = await w.rules.createPromotion(promo({ code: "TOPE" }), ACTOR);
    w.store.promotion.find((p) => p.id === draft.id)!.redemptionCount = 3;
    await expect(w.rules.updatePromotion(draft.id, { maxRedemptions: 2 }, stamp(draft), ACTOR)).rejects.toEqual(
      code("MAX_REDEMPTIONS_INVALID", 400),
    );
    await expect(w.rules.updatePromotion(draft.id, { maxRedemptions: 3 }, stamp(draft), ACTOR)).resolves.toMatchObject({
      maxRedemptions: 3,
    });
  });
  it("approves and deactivates with optimistic concurrency", async () => {
    const w = world();
    const p = await w.rules.createPromotion(promo(), ACTOR);
    await expect(w.rules.approvePromotion(p.id, new Date(0), ACTOR)).rejects.toEqual(code("STALE_UPDATE", 409));
    const approved = await w.rules.approvePromotion(p.id, stamp(p), ACTOR);
    await expect(w.rules.updatePromotion(p.id, { name: "Otro" }, stamp(approved), ACTOR)).rejects.toEqual(
      code("NOT_DRAFT", 409),
    );
    await expect(w.rules.deactivatePromotion(p.id, stamp(approved), ACTOR)).resolves.toMatchObject({
      status: "inactive",
    });
    expect((await w.rules.history("promotion", p.id)).length).toBe(3);
  });
});

describe("price rules (commercial fields)", () => {
  it("creates a draft with season, age band and accommodation (stored in conditions.roomTypeId)", async () => {
    const w = world();
    const s = await w.rules.createSeason(season(), ACTOR);
    const b = await w.rules.createAgeRule(band(), ACTOR);
    const created = await w.catalog.createPriceRule(
      rule({ seasonId: s.id, ageRuleId: b.id, roomTypeId: R1, occupancy: 2, minTravelers: 1, maxTravelers: 4 }),
      ACTOR,
    );
    expect(created).toMatchObject({ status: "draft", amountCents: "100000", roomTypeId: R1, targetRoomTypeId: null });
    expect(w.store.priceRule[0]).toMatchObject({
      roomTypeId: null,
      conditions: { roomTypeId: R1 },
      isFictitious: true,
    });
    expect(w.store.auditLog.at(-1)).toMatchObject({ action: "pricing.draft_created", entity: "price_rule" });
  });
  it("validates targets, scopes, ranges and amounts with stable codes", async () => {
    const w = world();
    const other = await w.rules.createSeason(season({ destinationId: D2 }), ACTOR);
    const cases: [Record<string, unknown>, string][] = [
      [{ tourId: randomUUID() }, "TARGET_INVALID"],
      [{ packageId: randomUUID() }, "TARGET_INVALID"],
      [{ seasonId: other.id }, "SEASON_SCOPE_MISMATCH"],
      [{ seasonId: randomUUID() }, "SEASON_NOT_FOUND"],
      [{ ageRuleId: randomUUID() }, "AGE_RULE_NOT_FOUND"],
      [{ roomTypeId: R2 }, "ROOM_TYPE_SCOPE_MISMATCH"],
      [{ minTravelers: 4, maxTravelers: 2 }, "TRAVELERS_RANGE_INVALID"],
      [{ occupancy: 5, maxTravelers: 4 }, "TRAVELERS_RANGE_INVALID"],
      [{ amountCents: 0n }, "AMOUNT_INVALID"],
      [
        { validFrom: new Date("2027-01-01T00:00:00Z"), validTo: new Date("2026-01-01T00:00:00Z") },
        "DATE_RANGE_INVALID",
      ],
    ];
    for (const [over, expected] of cases)
      await expect(w.catalog.createPriceRule(rule(over), ACTOR)).rejects.toEqual(code(expected, 400));
    const infants = await w.rules.createAgeRule(band({ category: "INFANT", minValue: 0, maxValue: 1 }), ACTOR);
    await expect(
      w.catalog.createPriceRule(rule({ amountCents: 0n, ageRuleId: infants.id }), ACTOR),
    ).resolves.toMatchObject({ amountCents: "0" });
  });
  it("edits drafts only, with optimistic concurrency, and audits before/after", async () => {
    const w = world();
    const r = await w.catalog.createPriceRule(rule(), ACTOR);
    await expect(w.catalog.updatePriceRule(r.id, { priority: 5 }, new Date(0), ACTOR)).rejects.toEqual(
      code("STALE_UPDATE", 409),
    );
    const edited = await w.catalog.updatePriceRule(r.id, { priority: 5, roomTypeId: R1 }, stamp(r), ACTOR);
    expect(edited).toMatchObject({ priority: 5, roomTypeId: R1 });
    expect(w.store.auditLog.at(-1)).toMatchObject({
      action: "pricing.draft_updated",
      before: expect.objectContaining({ priority: 0, roomTypeId: null }),
      after: expect.objectContaining({ priority: 5, roomTypeId: R1 }),
    });
    const approved = await w.catalog.approvePriceRule(r.id, stamp(edited), ACTOR);
    await expect(w.catalog.updatePriceRule(r.id, { priority: 1 }, stamp(approved), ACTOR)).rejects.toEqual(
      code("NOT_DRAFT", 409),
    );
  });
  it("requires an approved season / band and refuses an approval that would tie", async () => {
    const w = world();
    const s = await w.rules.createSeason(season(), ACTOR);
    const seasonal = await w.catalog.createPriceRule(rule({ seasonId: s.id }), ACTOR);
    await expect(w.catalog.approvePriceRule(seasonal.id, stamp(seasonal), ACTOR)).rejects.toEqual(
      code("SEASON_NOT_APPROVED", 409),
    );
    const base = await w.catalog.createPriceRule(rule(), ACTOR);
    await w.catalog.approvePriceRule(base.id, stamp(base), ACTOR);
    expect(w.client.$queryRaw).toHaveBeenCalled();
    const twin = await w.catalog.createPriceRule(rule({ name: "Adulto bis" }), ACTOR);
    await expect(w.catalog.approvePriceRule(twin.id, stamp(twin), ACTOR)).rejects.toEqual(
      code("PRICE_RULE_AMBIGUOUS", 409),
    );
    const higher = await w.catalog.createPriceRule(rule({ priority: 1 }), ACTOR);
    await expect(w.catalog.approvePriceRule(higher.id, stamp(higher), ACTOR)).resolves.toMatchObject({ active: true });
    const later = await w.catalog.createPriceRule(rule({ validFrom: new Date("2030-01-01T00:00:00Z") }), ACTOR);
    // base has no sale window, so a later window still overlaps it.
    await expect(w.catalog.approvePriceRule(later.id, stamp(later), ACTOR)).rejects.toEqual(
      code("PRICE_RULE_AMBIGUOUS", 409),
    );
  });
});

describe("priceRulesMayTie", () => {
  const base: TieShape = {
    ageRuleId: null,
    roomTypeId: null,
    priority: 0,
    season: null,
    occupancy: null,
    minTravelers: null,
    maxTravelers: null,
    validFrom: null,
    validTo: null,
  };
  const high = { startsOn: "2026-12-15", endsOn: "2027-01-15" };
  it("detects equal rules and cross-ranked ties (room-bound vs season-bound)", () => {
    expect(priceRulesMayTie(base, { ...base })).toBe(true);
    expect(priceRulesMayTie({ ...base, roomTypeId: R1 }, { ...base, season: high })).toBe(true);
  });
  it("separates rules the engine can always tell apart", () => {
    expect(priceRulesMayTie(base, { ...base, priority: 1 })).toBe(false);
    expect(priceRulesMayTie(base, { ...base, season: high })).toBe(false);
    expect(priceRulesMayTie({ ...base, roomTypeId: R1 }, { ...base, roomTypeId: R2 })).toBe(false);
    expect(priceRulesMayTie({ ...base, occupancy: 2 }, { ...base, occupancy: 3 })).toBe(false);
    expect(priceRulesMayTie({ ...base, maxTravelers: 2 }, { ...base, minTravelers: 3 })).toBe(false);
    expect(
      priceRulesMayTie(
        { ...base, season: high },
        { ...base, season: { startsOn: "2027-02-01", endsOn: "2027-03-01" } },
      ),
    ).toBe(false);
    expect(
      priceRulesMayTie(
        { ...base, validTo: new Date("2026-12-31T00:00:00Z") },
        { ...base, validFrom: new Date("2027-01-01T00:00:00Z") },
      ),
    ).toBe(false);
    expect(priceRulesMayTie(base, { ...base, ageRuleId: randomUUID() })).toBe(false);
  });
});

describe("engine compatibility", () => {
  /** Mirrors the loaders of PublicCatalogService.pricing over the in-memory rows. */
  function quote(
    w: ReturnType<typeof world>,
    input: { childAges: number[]; travelDate?: string; promotionCode?: string },
  ) {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const seasons = new Map(w.store.season.map((s) => [s.id, s]));
    const bands = new Map(w.store.ageRule.map((a) => [a.id, a]));
    const usable = (r: Row) => {
      const s = r.seasonId ? seasons.get(r.seasonId as string) : undefined;
      const a = r.ageRuleId ? bands.get(r.ageRuleId as string) : undefined;
      return (
        isApprovedPublicPriceRule(r as never, now) &&
        (!r.seasonId || (!!s && !s.isFictitious && (!s.destinationId || s.destinationId === D1))) &&
        (!r.ageRuleId || (!!a && !a.isFictitious))
      );
    };
    const iso = (d: unknown) => (d as Date).toISOString().slice(0, 10);
    const rules: CommercialRule[] = w.store.priceRule.filter(usable).map((r) => {
      const s = r.seasonId ? seasons.get(r.seasonId as string) : undefined;
      return {
        id: r.id,
        description: r.name as string,
        amountCents: r.amountCents as bigint,
        ruleSetVersion: r.ruleSetVersion as string,
        unit: r.unit as "PER_PERSON",
        priority: r.priority as number,
        roomTypeId: ((r.conditions as { roomTypeId?: string } | null)?.roomTypeId ?? null) as string | null,
        season: s ? { id: s.id, startsOn: iso(s.startsOn), endsOn: iso(s.endsOn) } : null,
        ageRuleId: r.ageRuleId as string | null,
        occupancy: r.occupancy as number | null,
        minTravelers: r.minTravelers as number | null,
        maxTravelers: r.maxTravelers as number | null,
      };
    });
    const ageBands: AgeBand[] = w.store.ageRule
      .filter((a) => !a.isFictitious && !a.tourId)
      .map((a) => ({
        id: a.id,
        category: a.category as "CHILD",
        basis: a.basis as "AGE_YEARS",
        minValue: a.minValue as number,
        maxValue: a.maxValue as number,
        scope: a.packageId ? "PACKAGE" : a.destinationId ? "DESTINATION" : "GLOBAL",
      }));
    const row = w.store.promotion.find((p) => String(p.code).toLowerCase() === input.promotionCode?.toLowerCase());
    const offer =
      row && !promotionRejection(row as never, { now, packageId: P1, destinationId: D1 }) ? (row as never) : undefined;
    return calculateCommercialQuote({
      adults: 2,
      childAges: input.childAges,
      travelDate: input.travelDate,
      ageBands,
      items: [{ kind: "PACKAGE", targetId: P1, rules }],
      promotion: offer,
    });
  }

  it("honours approved seasons, bands and promotions, ignores drafts and inactive rows, never touches quotes", async () => {
    const w = world();
    const quotesBefore = structuredClone(w.store.quote);
    const s = await w.rules.createSeason(season(), ACTOR);
    const b = await w.rules.createAgeRule(band(), ACTOR);
    const p = await w.rules.createPromotion(promo(), ACTOR);
    const adult = await w.catalog.createPriceRule(rule({ seasonId: s.id, amountCents: 200_000n }), ACTOR);
    const child = await w.catalog.createPriceRule(
      rule({ seasonId: s.id, ageRuleId: b.id, amountCents: 80_000n }),
      ACTOR,
    );
    const trip = { childAges: [5], travelDate: "2026-12-20", promotionCode: "verano-26" };

    // Everything still draft: nothing is priced.
    expect(quote(w, trip)).toMatchObject({ state: "REQUIRES_MANUAL_REVIEW", reasons: ["BASE_RATE_REQUIRED"] });

    const sApproved = await w.rules.approveSeason(s.id, stamp(s), ACTOR);
    await w.catalog.approvePriceRule(adult.id, stamp(adult), ACTOR);
    // Draft band: the child cannot be classified, the draft promotion is not offered.
    expect(quote(w, trip).reasons).toEqual(["CHILD_PRICE_RULE_REQUIRED"]);

    await w.rules.approveAgeRule(b.id, stamp(b), ACTOR);
    await w.catalog.approvePriceRule(child.id, stamp(child), ACTOR);
    expect(quote(w, trip)).toMatchObject({ state: "CALCULATED", totalCents: 480_000n, appliedPromotion: null });

    await w.rules.approvePromotion(p.id, stamp(p), ACTOR);
    expect(quote(w, trip)).toMatchObject({ state: "CALCULATED", subtotalCents: 480_000n, totalCents: 432_000n });
    expect(quote(w, { ...trip, travelDate: undefined }).reasons).toEqual(["TRAVEL_DATE_REQUIRED"]);

    // Deactivating the season withdraws the rules bound to it.
    await w.rules.deactivateSeason(s.id, stamp(sApproved), ACTOR);
    expect(quote(w, trip).reasons).toContain("BASE_RATE_REQUIRED");
    expect(w.store.quote).toEqual(quotesBefore);
  });
});
