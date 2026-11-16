import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@ricaurte/db";
import { DbService } from "../db/db.service";

/**
 * Staff CRUD for the commercial conditions the public pricing engine reads (seasons, age bands, promotions).
 * Lifecycle: draft (active && isFictitious) -> approved (active && !isFictitious) -> inactive (!active). Approved rows
 * are never edited in place and no row is ever deleted. Contract: docs/orchestration/contracts/commercial-rules-admin.md
 */

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type LifecycleStatus = "draft" | "approved" | "inactive";
export type ScopeFilter = "GLOBAL" | "DESTINATION" | "PACKAGE";
export type ListFilter = {
  status?: LifecycleStatus;
  scope?: ScopeFilter;
  destinationId?: string;
  packageId?: string;
  /** Case-insensitive name search. */
  q?: string;
};

export const badRequest = (code: string, message: string) =>
  new BadRequestException({ statusCode: 400, code, message });
export const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new ConflictException({ statusCode: 409, code, message, ...extra });
export const notFound = () => new NotFoundException({ statusCode: 404, code: "NOT_FOUND", message: "No encontrado" });
export const stale = () => conflict("STALE_UPDATE", "El registro fue modificado por otro usuario");

export function lifecycleStatus(row: { active: boolean; isFictitious: boolean }): LifecycleStatus {
  if (!row.active) return "inactive";
  return row.isFictitious ? "draft" : "approved";
}
const statusWhere: Record<LifecycleStatus, { active: boolean; isFictitious?: boolean }> = {
  draft: { active: true, isFictitious: true },
  approved: { active: true, isFictitious: false },
  inactive: { active: false },
};
function scopeWhere(filter: ListFilter) {
  return [
    ...(filter.status ? [statusWhere[filter.status]] : []),
    ...(filter.q ? [{ name: { contains: filter.q, mode: "insensitive" as const } }] : []),
    ...(filter.destinationId ? [{ destinationId: filter.destinationId }] : []),
    ...(filter.packageId ? [{ packageId: filter.packageId }] : []),
    ...(filter.scope === "GLOBAL" ? [{ destinationId: null, packageId: null }] : []),
    ...(filter.scope === "DESTINATION" ? [{ destinationId: { not: null }, packageId: null }] : []),
    ...(filter.scope === "PACKAGE" ? [{ packageId: { not: null } }] : []),
  ];
}
function scopeOf(row: { destinationId: string | null; packageId: string | null }): ScopeFilter {
  if (row.packageId) return "PACKAGE";
  return row.destinationId ? "DESTINATION" : "GLOBAL";
}
function page(total: number, value: number, size: number) {
  return { total, page: value, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) };
}
export const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Serialises approvals of one kind: two concurrent approvals cannot both pass the overlap check. */
export async function lockApprovals(tx: Tx, kind: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`commercial_rules:${kind}`}))`;
}

export function dateRangesOverlap(a: { startsOn: string; endsOn: string }, b: { startsOn: string; endsOn: string }) {
  return a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
}
export function ageBandsOverlap(
  a: { minValue: number | null; maxValue: number | null },
  b: { minValue: number | null; maxValue: number | null },
) {
  return (a.minValue ?? 0) <= (b.maxValue ?? 17) && (b.minValue ?? 0) <= (a.maxValue ?? 17);
}

export type TieShape = {
  ageRuleId: string | null;
  roomTypeId: string | null;
  priority: number;
  season: { startsOn: string; endsOn: string } | null;
  occupancy: number | null;
  minTravelers: number | null;
  maxTravelers: number | null;
  validFrom: Date | null;
  validTo: Date | null;
};
/**
 * True when some quote context exists in which `selectCommercialRule` would see both rules as equally specific with the
 * same priority (a PRICE_RULE_AMBIGUOUS tie). Callers compare only rules of the same priced item (same target).
 */
export function priceRulesMayTie(a: TieShape, b: TieShape): boolean {
  if ((a.ageRuleId ?? null) !== (b.ageRuleId ?? null) || a.priority !== b.priority) return false;
  if (a.roomTypeId && b.roomTypeId && a.roomTypeId !== b.roomTypeId) return false;
  const rank = (rule: TieShape) => (rule.roomTypeId ? 1 : 0) + (rule.season ? 1 : 0);
  if (rank(a) !== rank(b)) return false;
  if (a.season && b.season && !dateRangesOverlap(a.season, b.season)) return false;
  if (a.occupancy != null && b.occupancy != null && a.occupancy !== b.occupancy) return false;
  let low = Math.max(1, a.minTravelers ?? 1, b.minTravelers ?? 1);
  let high = Math.min(a.maxTravelers ?? Infinity, b.maxTravelers ?? Infinity);
  const fixed = a.occupancy ?? b.occupancy;
  if (fixed != null) {
    low = Math.max(low, fixed);
    high = Math.min(high, fixed);
  }
  if (low > high) return false;
  const starts = [a.validFrom, b.validFrom].filter((d): d is Date => !!d).map((d) => d.getTime());
  const ends = [a.validTo, b.validTo].filter((d): d is Date => !!d).map((d) => d.getTime());
  return !starts.length || !ends.length || Math.max(...starts) <= Math.min(...ends);
}

async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  before: object | null,
  after: object | null,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      ...(before ? { before: JSON.parse(JSON.stringify(before)) } : {}),
      ...(after ? { after: JSON.parse(JSON.stringify(after)) } : {}),
    },
  });
}
function assertStamp(row: { updatedAt: Date }, expectedUpdatedAt: Date) {
  if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
}
function assertDraft(row: { active: boolean; isFictitious: boolean }) {
  if (lifecycleStatus(row) !== "draft")
    throw conflict("NOT_DRAFT", "Solo un borrador se puede editar o aprobar; desactívalo y crea uno nuevo");
}

// ---------------------------------------------------------------------------------------------------------------------

export type SeasonInput = {
  name: string;
  startsOn: string;
  endsOn: string;
  notes?: string | null;
  destinationId?: string | null;
  packageId?: string | null;
};
export type AgeRuleInput = {
  name: string;
  category: "ADULT" | "CHILD" | "INFANT" | "SENIOR";
  basis?: "AGE_YEARS" | "HEIGHT_CM";
  minValue: number;
  maxValue: number;
  destinationId?: string | null;
  packageId?: string | null;
};
export type PromotionInput = {
  code: string;
  name: string;
  description?: string | null;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  percentBps?: number | null;
  amountOffCents?: bigint | null;
  startsAt: Date;
  endsAt: Date;
  maxRedemptions?: number | null;
  destinationId?: string | null;
  packageId?: string | null;
};

const seasonSelect = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
  notes: true,
  destinationId: true,
  packageId: true,
  active: true,
  isFictitious: true,
  createdAt: true,
  updatedAt: true,
} as const;
const ageRuleSelect = {
  id: true,
  name: true,
  category: true,
  basis: true,
  minValue: true,
  maxValue: true,
  destinationId: true,
  packageId: true,
  tourId: true,
  active: true,
  isFictitious: true,
  createdAt: true,
  updatedAt: true,
} as const;
const promotionSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  discountType: true,
  percentBps: true,
  amountOffCents: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  redemptionCount: true,
  destinationId: true,
  packageId: true,
  active: true,
  isFictitious: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SeasonRow = {
  id: string;
  startsOn: Date;
  endsOn: Date;
  destinationId: string | null;
  packageId: string | null;
  active: boolean;
  isFictitious: boolean;
};
const presentSeason = <T extends SeasonRow>(row: T) => ({
  ...row,
  startsOn: dateOnly(row.startsOn),
  endsOn: dateOnly(row.endsOn),
  scope: scopeOf(row),
  status: lifecycleStatus(row),
});
const presentAgeRule = <
  T extends { destinationId: string | null; packageId: string | null; active: boolean; isFictitious: boolean },
>(
  row: T,
) => ({ ...row, scope: scopeOf(row), status: lifecycleStatus(row) });
const presentPromotion = <
  T extends {
    amountOffCents: bigint | null;
    destinationId: string | null;
    packageId: string | null;
    active: boolean;
    isFictitious: boolean;
  },
>(
  row: T,
) => ({
  ...row,
  amountOffCents: row.amountOffCents?.toString() ?? null,
  scope: scopeOf(row),
  status: lifecycleStatus(row),
});

const PROMOTION_CODE = /^[A-Z0-9_-]{1,40}$/;

@Injectable()
export class CommercialRulesService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async history(entity: "season" | "age_rule" | "promotion" | "price_rule", id: string) {
    const client = await this.db.client();
    return client.auditLog.findMany({
      where: { entity, entityId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
  }

  /** Scope shared by every kind: package wins (its destination is implied), then destination, else global. */
  private async scope(
    tx: Tx,
    input: { destinationId?: string | null; packageId?: string | null },
    options: { deriveDestination: boolean },
  ) {
    const packageId = input.packageId ?? null;
    const destinationId = input.destinationId ?? null;
    if (packageId) {
      const pkg = await tx.tourPackage.findFirst({
        where: { id: packageId, deletedAt: null },
        select: { id: true, destinationId: true },
      });
      if (!pkg) throw badRequest("SCOPE_NOT_FOUND", "El paquete no existe");
      if (destinationId && destinationId !== pkg.destinationId)
        throw badRequest("SCOPE_INVALID", "El paquete no pertenece a ese destino");
      if (destinationId && !options.deriveDestination)
        throw badRequest("SCOPE_INVALID", "Indica un paquete o un destino, no ambos");
      return { packageId, destinationId: options.deriveDestination ? pkg.destinationId : null };
    }
    if (destinationId) {
      const destination = await tx.destination.findFirst({
        where: { id: destinationId, deletedAt: null },
        select: { id: true },
      });
      if (!destination) throw badRequest("SCOPE_NOT_FOUND", "El destino no existe");
    }
    return { packageId: null, destinationId };
  }

  // Seasons --------------------------------------------------------------------------------------------------------

  async seasons(filter: ListFilter, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = { AND: scopeWhere(filter) };
    const [total, rows] = await client.$transaction([
      client.season.count({ where }),
      client.season.findMany({
        where,
        select: seasonSelect,
        orderBy: [{ startsOn: "asc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(presentSeason), ...page(total, current, pageSize) };
  }
  async season(id: string) {
    const client = await this.db.client();
    const row = await client.season.findUnique({ where: { id }, select: seasonSelect });
    if (!row) throw notFound();
    return presentSeason(row);
  }
  private seasonData(input: SeasonInput) {
    if (input.startsOn > input.endsOn)
      throw badRequest("DATE_RANGE_INVALID", "La fecha inicial debe ser anterior o igual a la final");
    return {
      name: input.name,
      startsOn: asDate(input.startsOn),
      endsOn: asDate(input.endsOn),
      notes: input.notes ?? null,
    };
  }
  async createSeason(input: SeasonInput, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const data = { ...this.seasonData(input), ...(await this.scope(tx, input, { deriveDestination: true })) };
      const row = await tx.season.create({ data: { ...data, active: true, isFictitious: true }, select: seasonSelect });
      const after = presentSeason(row);
      await audit(tx, actorId, "seasons.created", "season", row.id, null, after);
      return after;
    });
  }
  async updateSeason(id: string, patch: Partial<SeasonInput>, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await tx.season.findUnique({ where: { id }, select: seasonSelect });
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt);
      assertDraft(old);
      const before = presentSeason(old);
      const merged = {
        name: patch.name ?? old.name,
        startsOn: patch.startsOn ?? before.startsOn,
        endsOn: patch.endsOn ?? before.endsOn,
        notes: patch.notes !== undefined ? patch.notes : old.notes,
      };
      // Sending either scope key replaces the whole scope.
      const scopeChanged = patch.destinationId !== undefined || patch.packageId !== undefined;
      const scope = scopeChanged
        ? await this.scope(tx, patch, { deriveDestination: true })
        : { destinationId: old.destinationId, packageId: old.packageId };
      const changed = await tx.season.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, active: true, isFictitious: true },
        data: { ...this.seasonData(merged), ...scope },
      });
      if (changed.count !== 1) throw stale();
      const after = presentSeason(await tx.season.findUniqueOrThrow({ where: { id }, select: seasonSelect }));
      await audit(tx, actorId, "seasons.updated", "season", id, before, after);
      return after;
    });
  }
  async approveSeason(id: string, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      await lockApprovals(tx, "season");
      const row = await tx.season.findUnique({ where: { id }, select: seasonSelect });
      if (!row) throw notFound();
      assertStamp(row, expectedUpdatedAt);
      assertDraft(row);
      const before = presentSeason(row);
      // Same scope only: the same package, or the same destination (package-free), or both global.
      const peers = await tx.season.findMany({
        where: {
          id: { not: id },
          active: true,
          isFictitious: false,
          packageId: row.packageId,
          ...(row.packageId ? {} : { destinationId: row.destinationId }),
        },
        select: seasonSelect,
      });
      const clash = peers.map(presentSeason).find((peer) => dateRangesOverlap(peer, before));
      if (clash)
        throw conflict("SEASON_OVERLAP", `Se cruza con la temporada aprobada "${clash.name}"`, {
          conflictId: clash.id,
        });
      const changed = await tx.season.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: { isFictitious: false },
      });
      if (changed.count !== 1) throw stale();
      const after = presentSeason(await tx.season.findUniqueOrThrow({ where: { id }, select: seasonSelect }));
      await audit(tx, actorId, "seasons.approved", "season", id, before, after);
      return after;
    });
  }
  async deactivateSeason(id: string, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const row = await tx.season.findUnique({ where: { id }, select: seasonSelect });
      if (!row) throw notFound();
      assertStamp(row, expectedUpdatedAt);
      if (!row.active) throw conflict("ALREADY_INACTIVE", "Ya está desactivada");
      // isFictitious = true as well: the public loader excludes fictitious seasons (and the rules bound to them).
      const changed = await tx.season.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: { active: false, isFictitious: true },
      });
      if (changed.count !== 1) throw stale();
      const after = presentSeason(await tx.season.findUniqueOrThrow({ where: { id }, select: seasonSelect }));
      await audit(tx, actorId, "seasons.deactivated", "season", id, presentSeason(row), after);
      return after;
    });
  }

  // Age rules ------------------------------------------------------------------------------------------------------

  async ageRules(filter: ListFilter, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = { AND: [...scopeWhere(filter), { tourId: null }] };
    const [total, rows] = await client.$transaction([
      client.ageRule.count({ where }),
      client.ageRule.findMany({
        where,
        select: ageRuleSelect,
        orderBy: [{ minValue: "asc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(presentAgeRule), ...page(total, current, pageSize) };
  }
  async ageRule(id: string) {
    const client = await this.db.client();
    const row = await client.ageRule.findFirst({ where: { id, tourId: null }, select: ageRuleSelect });
    if (!row) throw notFound();
    return presentAgeRule(row);
  }
  private ageRuleData(input: AgeRuleInput) {
    if (input.category === "SENIOR")
      throw badRequest("AGE_RULE_CATEGORY_INVALID", "Las bandas de edad son para menores de 18 años");
    if ((input.basis ?? "AGE_YEARS") !== "AGE_YEARS")
      throw badRequest("AGE_RULE_BASIS_UNSUPPORTED", "La cotización pública solo admite bandas por edad en años");
    if (input.minValue < 0 || input.maxValue > 17 || input.minValue > input.maxValue)
      throw badRequest(
        "AGE_RANGE_INVALID",
        "La banda debe estar entre 0 y 17 años y el mínimo no puede superar el máximo",
      );
    return {
      name: input.name,
      category: input.category,
      basis: "AGE_YEARS" as const,
      minValue: input.minValue,
      maxValue: input.maxValue,
    };
  }
  async createAgeRule(input: AgeRuleInput, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const data = { ...this.ageRuleData(input), ...(await this.scope(tx, input, { deriveDestination: false })) };
      const row = await tx.ageRule.create({
        data: { ...data, active: true, isFictitious: true },
        select: ageRuleSelect,
      });
      const after = presentAgeRule(row);
      await audit(tx, actorId, "age_rules.created", "age_rule", row.id, null, after);
      return after;
    });
  }
  async updateAgeRule(id: string, patch: Partial<AgeRuleInput>, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await tx.ageRule.findFirst({ where: { id, tourId: null }, select: ageRuleSelect });
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt);
      assertDraft(old);
      const merged: AgeRuleInput = {
        name: patch.name ?? old.name,
        category: patch.category ?? old.category,
        basis: patch.basis ?? old.basis,
        minValue: patch.minValue ?? old.minValue ?? 0,
        maxValue: patch.maxValue ?? old.maxValue ?? 17,
      };
      const scopeChanged = patch.destinationId !== undefined || patch.packageId !== undefined;
      const scope = scopeChanged
        ? await this.scope(tx, patch, { deriveDestination: false })
        : { destinationId: old.destinationId, packageId: old.packageId };
      const changed = await tx.ageRule.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, active: true, isFictitious: true },
        data: { ...this.ageRuleData(merged), ...scope },
      });
      if (changed.count !== 1) throw stale();
      const after = presentAgeRule(await tx.ageRule.findUniqueOrThrow({ where: { id }, select: ageRuleSelect }));
      await audit(tx, actorId, "age_rules.updated", "age_rule", id, presentAgeRule(old), after);
      return after;
    });
  }
  async approveAgeRule(id: string, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      await lockApprovals(tx, "age_rule");
      const row = await tx.ageRule.findFirst({ where: { id, tourId: null }, select: ageRuleSelect });
      if (!row) throw notFound();
      assertStamp(row, expectedUpdatedAt);
      assertDraft(row);
      if (row.basis !== "AGE_YEARS")
        throw badRequest("AGE_RULE_BASIS_UNSUPPORTED", "La cotización pública solo admite bandas por edad en años");
      const peers = await tx.ageRule.findMany({
        where: {
          id: { not: id },
          active: true,
          isFictitious: false,
          tourId: null,
          packageId: row.packageId,
          ...(row.packageId ? {} : { destinationId: row.destinationId }),
        },
        select: ageRuleSelect,
      });
      const clash = peers.find((peer) => ageBandsOverlap(peer, row));
      if (clash)
        throw conflict("AGE_RULE_OVERLAP", `Se cruza con la banda aprobada "${clash.name}"`, { conflictId: clash.id });
      const changed = await tx.ageRule.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: { isFictitious: false },
      });
      if (changed.count !== 1) throw stale();
      const after = presentAgeRule(await tx.ageRule.findUniqueOrThrow({ where: { id }, select: ageRuleSelect }));
      await audit(tx, actorId, "age_rules.approved", "age_rule", id, presentAgeRule(row), after);
      return after;
    });
  }
  async deactivateAgeRule(id: string, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const row = await tx.ageRule.findFirst({ where: { id, tourId: null }, select: ageRuleSelect });
      if (!row) throw notFound();
      assertStamp(row, expectedUpdatedAt);
      if (!row.active) throw conflict("ALREADY_INACTIVE", "Ya está desactivada");
      // isFictitious = true as well: the public loader only reads real age rules.
      const changed = await tx.ageRule.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: { active: false, isFictitious: true },
      });
      if (changed.count !== 1) throw stale();
      const after = presentAgeRule(await tx.ageRule.findUniqueOrThrow({ where: { id }, select: ageRuleSelect }));
      await audit(tx, actorId, "age_rules.deactivated", "age_rule", id, presentAgeRule(row), after);
      return after;
    });
  }

  // Promotions -----------------------------------------------------------------------------------------------------

  async promotions(filter: ListFilter, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = { AND: scopeWhere(filter) };
    const [total, rows] = await client.$transaction([
      client.promotion.count({ where }),
      client.promotion.findMany({
        where,
        select: promotionSelect,
        orderBy: [{ startsAt: "desc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(presentPromotion), ...page(total, current, pageSize) };
  }
  async promotion(id: string) {
    const client = await this.db.client();
    const row = await client.promotion.findUnique({ where: { id }, select: promotionSelect });
    if (!row) throw notFound();
    return presentPromotion(row);
  }
  private promotionData(input: PromotionInput, redemptionCount: number) {
    const code = input.code.trim().toUpperCase();
    if (!PROMOTION_CODE.test(code))
      throw badRequest("PROMOTION_CODE_INVALID", "El código solo admite A-Z, 0-9, guion y guion bajo (máx. 40)");
    if (input.startsAt.getTime() >= input.endsAt.getTime())
      throw badRequest("DATE_RANGE_INVALID", "La promoción debe empezar antes de terminar");
    const percent = input.percentBps ?? null;
    const amount = input.amountOffCents ?? null;
    const valid =
      input.discountType === "PERCENT"
        ? percent !== null && Number.isInteger(percent) && percent >= 1 && percent <= 10_000 && amount === null
        : amount !== null && amount > 0n && amount <= 999_999_999_999n && percent === null;
    if (!valid)
      throw badRequest(
        "DISCOUNT_INVALID",
        "Porcentaje: percentBps entre 1 y 10000 sin monto. Monto fijo: amountOffCents > 0 sin porcentaje",
      );
    const max = input.maxRedemptions ?? null;
    if (max !== null && (!Number.isInteger(max) || max < 1 || max < redemptionCount))
      throw badRequest("MAX_REDEMPTIONS_INVALID", "El tope de usos no puede ser menor que los usos ya registrados");
    return {
      code,
      name: input.name,
      description: input.description ?? null,
      discountType: input.discountType,
      percentBps: percent,
      amountOffCents: amount,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      maxRedemptions: max,
    };
  }
  /** Codes are matched case-insensitively by the public quote, so uniqueness is case-insensitive too. */
  private async assertCodeFree(tx: Tx, code: string, selfId?: string) {
    const taken = await tx.promotion.findFirst({
      where: { code: { equals: code, mode: "insensitive" }, ...(selfId ? { id: { not: selfId } } : {}) },
      select: { id: true },
    });
    if (taken) throw conflict("PROMOTION_CODE_TAKEN", "Ese código ya existe (los códigos no se reutilizan)");
  }
  private async uniqueCode<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002")
        throw conflict("PROMOTION_CODE_TAKEN", "Ese código ya existe (los códigos no se reutilizan)");
      throw error;
    }
  }
  async createPromotion(input: PromotionInput, actorId: string) {
    const client = await this.db.client();
    return this.uniqueCode(() =>
      client.$transaction(async (tx) => {
        const data = {
          ...this.promotionData(input, 0),
          ...(await this.scope(tx, input, { deriveDestination: false })),
        };
        await this.assertCodeFree(tx, data.code);
        const row = await tx.promotion.create({
          data: { ...data, active: true, isFictitious: true },
          select: promotionSelect,
        });
        const after = presentPromotion(row);
        await audit(tx, actorId, "promotions.created", "promotion", row.id, null, after);
        return after;
      }),
    );
  }
  async updatePromotion(id: string, patch: Partial<PromotionInput>, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return this.uniqueCode(() =>
      client.$transaction(async (tx) => {
        const old = await tx.promotion.findUnique({ where: { id }, select: promotionSelect });
        if (!old) throw notFound();
        assertStamp(old, expectedUpdatedAt);
        assertDraft(old);
        const discountType = patch.discountType ?? old.discountType;
        const switched = discountType !== old.discountType;
        const merged: PromotionInput = {
          code: patch.code ?? old.code ?? "",
          name: patch.name ?? old.name,
          description: patch.description !== undefined ? patch.description : old.description,
          discountType,
          // Switching the discount type drops the value of the other type unless it is sent again.
          percentBps: patch.percentBps !== undefined ? patch.percentBps : switched ? null : old.percentBps,
          amountOffCents:
            patch.amountOffCents !== undefined ? patch.amountOffCents : switched ? null : old.amountOffCents,
          startsAt: patch.startsAt ?? old.startsAt,
          endsAt: patch.endsAt ?? old.endsAt,
          maxRedemptions: patch.maxRedemptions !== undefined ? patch.maxRedemptions : old.maxRedemptions,
        };
        const data = this.promotionData(merged, old.redemptionCount);
        await this.assertCodeFree(tx, data.code, id);
        const scopeChanged = patch.destinationId !== undefined || patch.packageId !== undefined;
        const scope = scopeChanged
          ? await this.scope(tx, patch, { deriveDestination: false })
          : { destinationId: old.destinationId, packageId: old.packageId };
        const changed = await tx.promotion.updateMany({
          where: { id, updatedAt: expectedUpdatedAt, active: true, isFictitious: true },
          data: { ...data, ...scope },
        });
        if (changed.count !== 1) throw stale();
        const after = presentPromotion(
          await tx.promotion.findUniqueOrThrow({ where: { id }, select: promotionSelect }),
        );
        await audit(tx, actorId, "promotions.updated", "promotion", id, presentPromotion(old), after);
        return after;
      }),
    );
  }
  private async transitionPromotion(id: string, expectedUpdatedAt: Date, actorId: string, approve: boolean) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const row = await tx.promotion.findUnique({ where: { id }, select: promotionSelect });
      if (!row) throw notFound();
      assertStamp(row, expectedUpdatedAt);
      if (approve) assertDraft(row);
      else if (!row.active) throw conflict("ALREADY_INACTIVE", "Ya está desactivada");
      const changed = await tx.promotion.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data: approve ? { isFictitious: false } : { active: false },
      });
      if (changed.count !== 1) throw stale();
      const after = presentPromotion(await tx.promotion.findUniqueOrThrow({ where: { id }, select: promotionSelect }));
      await audit(
        tx,
        actorId,
        approve ? "promotions.approved" : "promotions.deactivated",
        "promotion",
        id,
        presentPromotion(row),
        after,
      );
      return after;
    });
  }
  approvePromotion(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.transitionPromotion(id, expectedUpdatedAt, actorId, true);
  }
  deactivatePromotion(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.transitionPromotion(id, expectedUpdatedAt, actorId, false);
  }
}
