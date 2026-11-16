import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@ricaurte/db";
import { DbService } from "../db/db.service";
import {
  badRequest,
  conflict,
  dateOnly,
  lockApprovals,
  notFound,
  priceRulesMayTie,
  stale,
  type TieShape,
  type Tx,
} from "./commercial-rules.service";

const packageSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  durationDays: true,
  status: true,
  includes: true,
  excludes: true,
  updatedAt: true,
  destination: { select: { id: true, name: true, slug: true } },
  itinerary: { orderBy: { day: "asc" as const }, select: { id: true, day: true, title: true, description: true } },
  components: {
    where: { hotelId: { not: null } },
    select: { hotel: { select: { id: true, name: true, slug: true } } },
  },
  priceRules: {
    // Approved rules stay listed so they can be audited and deactivated; amounts stay editable only while draft.
    select: {
      id: true,
      name: true,
      amountCents: true,
      currency: true,
      conditions: true,
      unit: true,
      priority: true,
      seasonId: true,
      ageRuleId: true,
      occupancy: true,
      minTravelers: true,
      maxTravelers: true,
      validFrom: true,
      validTo: true,
      active: true,
      isFictitious: true,
      updatedAt: true,
    },
  },
};
export type PriceRuleUnit = "PER_PERSON" | "PER_PERSON_NIGHT" | "PER_ROOM_NIGHT" | "PER_BOOKING";
/** Fields the public engine selects on. roomTypeId is stored as conditions.roomTypeId: the room_type_id column is a
 * price target (CHECK price_rules_target_valid allows exactly one target). */
export type PriceRuleCommercial = {
  name: string;
  unit: PriceRuleUnit;
  amountCents: bigint;
  priority: number;
  seasonId: string | null;
  ageRuleId: string | null;
  roomTypeId: string | null;
  occupancy: number | null;
  minTravelers: number | null;
  maxTravelers: number | null;
  validFrom: Date | null;
  validTo: Date | null;
};
export type PriceRuleTarget = { packageId?: string; tourId?: string; transportOptionId?: string; addOnId?: string };
export type PriceRuleCreate = PriceRuleTarget &
  Pick<PriceRuleCommercial, "name" | "unit" | "amountCents"> &
  Partial<Omit<PriceRuleCommercial, "name" | "unit" | "amountCents">> & { ruleSetVersion: string };
const priceRuleSelect = {
  id: true,
  name: true,
  ruleSetVersion: true,
  unit: true,
  amountCents: true,
  currency: true,
  priority: true,
  packageId: true,
  departureId: true,
  roomTypeId: true,
  tourId: true,
  transportOptionId: true,
  addOnId: true,
  seasonId: true,
  ageRuleId: true,
  occupancy: true,
  minTravelers: true,
  maxTravelers: true,
  conditions: true,
  validFrom: true,
  validTo: true,
  active: true,
  isFictitious: true,
  createdAt: true,
  updatedAt: true,
} as const;
const lifecycleSelect = { active: true, isFictitious: true } as const;
function conditionsObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function boundRoom(conditions: Prisma.JsonValue | null) {
  const value = conditionsObject(conditions).roomTypeId;
  return typeof value === "string" ? value : null;
}
/** Price rules keep their historic encoding: a draft is isFictitious (and inactive until approved). */
function priceRuleStatus(row: { active: boolean; isFictitious: boolean }) {
  if (row.isFictitious) return "draft" as const;
  return row.active ? ("approved" as const) : ("inactive" as const);
}
function presentPriceRule<
  T extends {
    amountCents: bigint;
    conditions: Prisma.JsonValue | null;
    roomTypeId: string | null;
    active: boolean;
    isFictitious: boolean;
  },
>(row: T) {
  const { roomTypeId: targetRoomTypeId, ...rest } = row;
  return {
    ...rest,
    amountCents: row.amountCents.toString(),
    roomTypeId: boundRoom(row.conditions),
    targetRoomTypeId,
    status: priceRuleStatus(row),
  };
}
function page(total: number, value: number, size: number) {
  return { total, page: value, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) };
}

@Injectable()
export class CatalogAdminService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async packages(query: string | undefined, destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(destinationId ? { destinationId } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { slug: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await client.$transaction([
      client.tourPackage.count({ where }),
      client.tourPackage.findMany({
        where,
        select: packageSelect,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        priceRules: row.priceRules.map((rate) => ({ ...rate, amountCents: rate.amountCents.toString() })),
        hotels: row.components.flatMap((c) => (c.hotel ? [c.hotel] : [])),
      })),
      ...page(total, current, pageSize),
    };
  }
  async packageDetail(id: string) {
    const client = await this.db.client();
    const row = await client.tourPackage.findFirst({ where: { id, deletedAt: null }, select: packageSelect });
    if (!row) throw new NotFoundException();
    return {
      ...row,
      priceRules: row.priceRules.map((rate) => ({ ...rate, amountCents: rate.amountCents.toString() })),
      hotels: row.components.flatMap((c) => (c.hotel ? [c.hotel] : [])),
    };
  }
  async createPackage(
    input: { destinationId: string; slug: string; title: string; durationDays: number; hotelIds: string[] },
    actorId: string,
  ) {
    const client = await this.db.client();
    try {
      const created = await client.$transaction(async (tx) => {
        const destination = await tx.destination.findFirst({
          where: { id: input.destinationId, deletedAt: null },
          select: { id: true },
        });
        if (!destination) throw new NotFoundException();
        const hotels = await tx.hotel.findMany({
          where: { id: { in: input.hotelIds }, destinationId: input.destinationId, deletedAt: null },
          select: { id: true },
        });
        if (hotels.length !== input.hotelIds.length) throw new NotFoundException();
        const pkg = await tx.tourPackage.create({
          data: {
            destinationId: input.destinationId,
            slug: input.slug,
            title: input.title,
            durationDays: input.durationDays,
            status: "DRAFT",
            isFictitious: true,
          },
        });
        if (hotels.length)
          await tx.packageComponent.createMany({
            data: hotels.map((hotel, sortOrder) => ({
              packageId: pkg.id,
              type: "HOTEL",
              hotelId: hotel.id,
              included: true,
              sortOrder,
            })),
          });
        await tx.auditLog.create({
          data: { actorId, action: "packages.created", entity: "package", entityId: pkg.id },
        });
        return pkg;
      });
      return this.packageDetail(created.id);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
  async updatePackage(
    id: string,
    input: {
      title?: string;
      summary?: string;
      description?: string;
      includes?: string[];
      excludes?: string[];
      itinerary?: { day: number; title: string; description: string }[];
    },
    actorId: string,
  ) {
    const client = await this.db.client();
    const exists = await client.tourPackage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException();
    await client.$transaction(async (tx) => {
      await tx.tourPackage.update({ where: { id }, data: { ...input, itinerary: undefined } });
      if (input.itinerary)
        for (const item of input.itinerary)
          await tx.itineraryDay.upsert({
            where: { packageId_day: { packageId: id, day: item.day } },
            update: { title: item.title, description: item.description },
            create: { packageId: id, ...item },
          });
      await tx.auditLog.create({ data: { actorId, action: "packages.updated", entity: "package", entityId: id } });
    });
    return this.packageDetail(id);
  }
  async hotels(query: string | undefined, destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(destinationId ? { destinationId } : {}),
      ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
    };
    const [total, items] = await client.$transaction([
      client.hotel.count({ where }),
      client.hotel.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          stars: true,
          status: true,
          destination: { select: { id: true, name: true } },
          roomTypes: { where: { deletedAt: null }, select: { id: true, name: true, maxOccupancy: true } },
        },
      }),
    ]);
    return { items, ...page(total, current, pageSize) };
  }
  async createHotel(input: { destinationId: string; slug: string; name: string; stars?: number }, actorId: string) {
    const client = await this.db.client();
    try {
      const hotel = await client.hotel.create({
        data: { ...input, status: "DRAFT" },
        select: { id: true, name: true },
      });
      await client.auditLog.create({
        data: { actorId, action: "hotels.created", entity: "hotel", entityId: hotel.id },
      });
      return hotel;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
  async updateHotel(
    id: string,
    input: { name?: string; description?: string; stars?: number | null },
    actorId: string,
  ) {
    const client = await this.db.client();
    const hotel = await client.hotel
      .update({ where: { id }, data: input, select: { id: true, name: true } })
      .catch(() => {
        throw new NotFoundException();
      });
    await client.auditLog.create({ data: { actorId, action: "hotels.updated", entity: "hotel", entityId: id } });
    return hotel;
  }
  async updateRate(id: string, amountCents: bigint, actorId: string) {
    const client = await this.db.client();
    // Read, write and audit in one transaction, and write only while the row is still a draft: an approval that
    // lands between the read and the write makes the update match nothing instead of changing a public price.
    return client.$transaction(async (tx) => {
      const old = await tx.priceRule.findFirst({
        where: { id, active: false, isFictitious: true },
        select: { id: true, amountCents: true },
      });
      if (!old) throw new NotFoundException();
      const changed = await tx.priceRule.updateMany({
        where: { id, active: false, isFictitious: true },
        data: { amountCents },
      });
      if (changed.count !== 1) throw conflict("NOT_DRAFT", "La tarifa ya no es un borrador");
      const rate = await tx.priceRule.findUniqueOrThrow({
        where: { id },
        select: { id: true, amountCents: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "pricing.draft_updated",
          entity: "price_rule",
          entityId: id,
          before: { amountCents: old.amountCents.toString() },
          after: { amountCents: amountCents.toString() },
        },
      });
      return { ...rate, amountCents: rate.amountCents.toString() };
    });
  }
  async rateHistory(id: string) {
    const client = await this.db.client();
    return client.auditLog.findMany({
      where: { entity: "price_rule", entityId: id, action: "pricing.draft_updated" },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, before: true, after: true, createdAt: true },
    });
  }
  /** Validation shared by create and edit: every reference exists, is in scope and the ranges are coherent. */
  private async commercialChecks(tx: Tx, rule: PriceRuleTarget & PriceRuleCommercial) {
    const targets = [rule.packageId, rule.tourId, rule.transportOptionId, rule.addOnId].filter(Boolean);
    if (targets.length !== 1)
      throw badRequest("TARGET_INVALID", "Una tarifa aplica a exactamente un paquete, tour, transporte o adicional");
    let destinationId: string | null = null;
    if (rule.packageId) {
      const pkg = await tx.tourPackage.findFirst({
        where: { id: rule.packageId, deletedAt: null },
        select: { destinationId: true },
      });
      if (!pkg) throw badRequest("TARGET_INVALID", "El elemento a tarifar no existe");
      destinationId = pkg.destinationId;
    } else if (rule.tourId) {
      const tour = await tx.tour.findFirst({
        where: { id: rule.tourId, deletedAt: null },
        select: { destinationId: true },
      });
      if (!tour) throw badRequest("TARGET_INVALID", "El elemento a tarifar no existe");
      destinationId = tour.destinationId;
    } else if (rule.transportOptionId) {
      const transport = await tx.transportOption.findFirst({
        where: { id: rule.transportOptionId, deletedAt: null },
        select: { destinationId: true },
      });
      if (!transport) throw badRequest("TARGET_INVALID", "El elemento a tarifar no existe");
      destinationId = transport.destinationId;
    } else if (!(await tx.addOn.findFirst({ where: { id: rule.addOnId, deletedAt: null }, select: { id: true } })))
      throw badRequest("TARGET_INVALID", "El elemento a tarifar no existe");
    if (rule.validFrom && rule.validTo && rule.validFrom.getTime() >= rule.validTo.getTime())
      throw badRequest("DATE_RANGE_INVALID", "La vigencia de venta debe empezar antes de terminar");
    const { occupancy, minTravelers: min, maxTravelers: max } = rule;
    if (
      (min != null && max != null && min > max) ||
      (occupancy != null && ((min != null && occupancy < min) || (max != null && occupancy > max)))
    )
      throw badRequest("TRAVELERS_RANGE_INVALID", "Los límites de viajeros y la ocupación no son coherentes");
    if (rule.seasonId) {
      const season = await tx.season.findUnique({
        where: { id: rule.seasonId },
        select: { active: true, packageId: true, destinationId: true },
      });
      if (!season?.active) throw badRequest("SEASON_NOT_FOUND", "La temporada no existe o está desactivada");
      if (
        (season.packageId && season.packageId !== rule.packageId) ||
        (season.destinationId && season.destinationId !== destinationId)
      )
        throw badRequest("SEASON_SCOPE_MISMATCH", "La temporada no corresponde a este paquete o destino");
    }
    let category: string | null = null;
    if (rule.ageRuleId) {
      const band = await tx.ageRule.findFirst({
        where: { id: rule.ageRuleId, tourId: null },
        select: {
          active: true,
          category: true,
          basis: true,
          packageId: true,
          destinationId: true,
          package: { select: { destinationId: true } },
        },
      });
      if (!band?.active) throw badRequest("AGE_RULE_NOT_FOUND", "La banda de edad no existe o está desactivada");
      if (band.basis !== "AGE_YEARS")
        throw badRequest("AGE_RULE_BASIS_UNSUPPORTED", "La cotización pública solo admite bandas por edad en años");
      // A package band may price that package's optional tours/transport: only the destination must agree.
      const bandDestination = band.destinationId ?? band.package?.destinationId ?? null;
      if (
        (band.packageId && rule.packageId && band.packageId !== rule.packageId) ||
        (bandDestination && destinationId && bandDestination !== destinationId)
      )
        throw badRequest("AGE_RULE_SCOPE_MISMATCH", "La banda de edad no corresponde a este paquete o destino");
      category = band.category;
    }
    if (rule.roomTypeId) {
      const room = await tx.roomType.findFirst({
        where: { id: rule.roomTypeId, deletedAt: null },
        select: { hotelId: true },
      });
      if (!room) throw badRequest("ROOM_TYPE_NOT_FOUND", "La acomodación no existe");
      const inPackage =
        !rule.packageId ||
        (await tx.packageComponent.findFirst({
          where: { packageId: rule.packageId, hotelId: room.hotelId },
          select: { id: true },
        }));
      if (!inPackage)
        throw badRequest("ROOM_TYPE_SCOPE_MISMATCH", "La acomodación no pertenece a un hotel del paquete");
    }
    // Zero is an explicit price only for an infant band (the engine rejects it anywhere else).
    const amount = rule.amountCents;
    if (amount < 0n || amount > 999_999_999_999n || (amount === 0n && category !== "INFANT"))
      throw badRequest("AMOUNT_INVALID", "El valor debe ser mayor que 0 (0 solo para una banda de infantes)");
  }
  async createPriceRule(input: PriceRuleCreate, actorId: string) {
    const client = await this.db.client();
    const rule = {
      packageId: input.packageId,
      tourId: input.tourId,
      transportOptionId: input.transportOptionId,
      addOnId: input.addOnId,
      name: input.name,
      unit: input.unit,
      amountCents: input.amountCents,
      priority: input.priority ?? 0,
      seasonId: input.seasonId ?? null,
      ageRuleId: input.ageRuleId ?? null,
      roomTypeId: input.roomTypeId ?? null,
      occupancy: input.occupancy ?? null,
      minTravelers: input.minTravelers ?? null,
      maxTravelers: input.maxTravelers ?? null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    };
    return client.$transaction(async (tx) => {
      await this.commercialChecks(tx, rule);
      const { roomTypeId, ...columns } = rule;
      const row = await tx.priceRule.create({
        data: {
          ...columns,
          ruleSetVersion: input.ruleSetVersion,
          currency: "COP",
          conditions: roomTypeId ? { roomTypeId } : {},
          active: false,
          isFictitious: true,
        },
        select: priceRuleSelect,
      });
      const after = presentPriceRule(row);
      await tx.auditLog.create({
        data: {
          actorId,
          action: "pricing.draft_created",
          entity: "price_rule",
          entityId: row.id,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
      return after;
    });
  }
  /** Draft-only edit of the commercial fields; the target never changes. Approved rules: deactivate and create new. */
  async updatePriceRule(id: string, patch: Partial<PriceRuleCommercial>, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await tx.priceRule.findUnique({ where: { id }, select: priceRuleSelect });
      if (!old) throw notFound();
      if (old.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
      if (old.active || !old.isFictitious)
        throw conflict("NOT_DRAFT", "Solo un borrador se puede editar; desactiva la tarifa y crea una nueva");
      // Departure / room-type targeted rules have no admin path and are not edited here.
      if (old.departureId || old.roomTypeId) throw badRequest("TARGET_INVALID", "Esta tarifa no se edita desde aquí");
      const commercial: PriceRuleCommercial = {
        name: patch.name ?? old.name,
        unit: patch.unit ?? old.unit,
        amountCents: patch.amountCents ?? old.amountCents,
        priority: patch.priority ?? old.priority,
        seasonId: patch.seasonId !== undefined ? patch.seasonId : old.seasonId,
        ageRuleId: patch.ageRuleId !== undefined ? patch.ageRuleId : old.ageRuleId,
        roomTypeId: patch.roomTypeId !== undefined ? patch.roomTypeId : boundRoom(old.conditions),
        occupancy: patch.occupancy !== undefined ? patch.occupancy : old.occupancy,
        minTravelers: patch.minTravelers !== undefined ? patch.minTravelers : old.minTravelers,
        maxTravelers: patch.maxTravelers !== undefined ? patch.maxTravelers : old.maxTravelers,
        validFrom: patch.validFrom !== undefined ? patch.validFrom : old.validFrom,
        validTo: patch.validTo !== undefined ? patch.validTo : old.validTo,
      };
      await this.commercialChecks(tx, {
        ...commercial,
        packageId: old.packageId ?? undefined,
        tourId: old.tourId ?? undefined,
        transportOptionId: old.transportOptionId ?? undefined,
        addOnId: old.addOnId ?? undefined,
      });
      const { roomTypeId, ...columns } = commercial;
      const conditions = conditionsObject(old.conditions);
      if (roomTypeId) conditions.roomTypeId = roomTypeId;
      else delete conditions.roomTypeId;
      const changed = await tx.priceRule.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, active: false, isFictitious: true },
        data: { ...columns, conditions: conditions as Prisma.InputJsonObject },
      });
      if (changed.count !== 1) throw stale();
      const before = presentPriceRule(old);
      const after = presentPriceRule(await tx.priceRule.findUniqueOrThrow({ where: { id }, select: priceRuleSelect }));
      await tx.auditLog.create({
        data: {
          actorId,
          action: "pricing.draft_updated",
          entity: "price_rule",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
      return after;
    });
  }
  /** Approval guard: bound season / age band must be approved, and no approved rule of the same item may tie with it. */
  private async assertApprovable(tx: Tx, id: string) {
    const tieSelect = {
      ...priceRuleSelect,
      season: { select: { startsOn: true, endsOn: true, ...lifecycleSelect } },
      ageRule: { select: lifecycleSelect },
    } as const;
    const rule = await tx.priceRule.findUniqueOrThrow({ where: { id }, select: tieSelect });
    const approved = (row: { active: boolean; isFictitious: boolean } | null) =>
      !!row && row.active && !row.isFictitious;
    if (rule.seasonId && !approved(rule.season))
      throw conflict("SEASON_NOT_APPROVED", "Aprueba primero la temporada de esta tarifa");
    if (rule.ageRuleId && !approved(rule.ageRule))
      throw conflict("AGE_RULE_NOT_APPROVED", "Aprueba primero la banda de edad de esta tarifa");
    const peers = await tx.priceRule.findMany({
      where: {
        id: { not: id },
        active: true,
        isFictitious: false,
        packageId: rule.packageId,
        departureId: rule.departureId,
        roomTypeId: rule.roomTypeId,
        tourId: rule.tourId,
        transportOptionId: rule.transportOptionId,
        addOnId: rule.addOnId,
        ageRuleId: rule.ageRuleId,
        priority: rule.priority,
      },
      select: tieSelect,
    });
    const shape = (row: typeof rule): TieShape => ({
      ageRuleId: row.ageRuleId,
      roomTypeId: boundRoom(row.conditions),
      priority: row.priority,
      season: row.season ? { startsOn: dateOnly(row.season.startsOn), endsOn: dateOnly(row.season.endsOn) } : null,
      occupancy: row.occupancy,
      minTravelers: row.minTravelers,
      maxTravelers: row.maxTravelers,
      validFrom: row.validFrom,
      validTo: row.validTo,
    });
    // Peers bound to a withdrawn season / band are never selected publicly, so they cannot tie.
    const clash = peers
      .filter((peer) => (!peer.seasonId || approved(peer.season)) && (!peer.ageRuleId || approved(peer.ageRule)))
      .find((peer) => priceRulesMayTie(shape(peer), shape(rule)));
    if (clash)
      throw conflict(
        "PRICE_RULE_AMBIGUOUS",
        `Empataría con la tarifa aprobada "${clash.name}": cambia la prioridad, la temporada, la acomodación o los límites`,
        { conflictId: clash.id },
      );
  }
  private async transitionPriceRule(id: string, expectedUpdatedAt: Date, actorId: string, active: boolean) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      if (active) await lockApprovals(tx, "price_rule");
      const before = await tx.priceRule.findUnique({
        where: { id },
        select: { id: true, active: true, isFictitious: true, updatedAt: true },
      });
      if (!before) throw new NotFoundException();
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict("STALE_UPDATE", "La regla fue modificada por otro usuario");
      // Only a draft is approved; a deactivated approved rate stays withdrawn (create a new draft instead).
      if (active && !(before.isFictitious && !before.active))
        throw conflict("NOT_DRAFT", "Solo un borrador se puede aprobar; crea una nueva tarifa");
      if (active) await this.assertApprovable(tx, id);
      const changed = await tx.priceRule.updateMany({
        where: active
          ? { id, updatedAt: expectedUpdatedAt, active: false, isFictitious: true }
          : { id, updatedAt: expectedUpdatedAt },
        data: active ? { active: true, isFictitious: false } : { active: false },
      });
      if (changed.count !== 1) throw conflict("STALE_UPDATE", "La regla fue modificada por otro usuario");
      const after = await tx.priceRule.findUniqueOrThrow({
        where: { id },
        select: { id: true, active: true, isFictitious: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: active ? "pricing.approved" : "pricing.deactivated",
          entity: "price_rule",
          entityId: id,
          before: {
            active: before.active,
            isFictitious: before.isFictitious,
            updatedAt: before.updatedAt.toISOString(),
          },
          after: { active: after.active, isFictitious: after.isFictitious, updatedAt: after.updatedAt.toISOString() },
        },
      });
      return after;
    });
  }
  approvePriceRule(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.transitionPriceRule(id, expectedUpdatedAt, actorId, true);
  }
  deactivatePriceRule(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.transitionPriceRule(id, expectedUpdatedAt, actorId, false);
  }
  async tours(destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = { deletedAt: null, ...(destinationId ? { destinationId } : {}) };
    const [total, items] = await client.$transaction([
      client.tour.count({ where }),
      client.tour.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          summary: true,
          status: true,
          destination: { select: { name: true } },
          packageComponents: { select: { package: { select: { title: true } }, included: true } },
        },
      }),
    ]);
    return { items, ...page(total, current, pageSize) };
  }
  async createTour(
    input: {
      destinationId: string;
      slug: string;
      name: string;
      summary?: string;
      packageId?: string;
      included: boolean;
    },
    actorId: string,
  ) {
    const client = await this.db.client();
    try {
      const tour = await client.$transaction(async (tx) => {
        const created = await tx.tour.create({
          data: {
            destinationId: input.destinationId,
            slug: input.slug,
            name: input.name,
            summary: input.summary,
            status: "DRAFT",
          },
        });
        if (input.packageId)
          await tx.packageComponent.create({
            data: { packageId: input.packageId, type: "TOUR", tourId: created.id, included: input.included },
          });
        await tx.auditLog.create({ data: { actorId, action: "tours.created", entity: "tour", entityId: created.id } });
        return created;
      });
      return tour;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
}
