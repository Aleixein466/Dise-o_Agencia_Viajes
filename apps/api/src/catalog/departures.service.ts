import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { badRequest, conflict, notFound, stale, type Tx } from "./commercial-rules.service";

/**
 * Manual cupos per package departure. Capacity is only what staff types (never hotel or airline inventory); holds and
 * releases are manual, with a reason. Seat changes are race-safe: holds are one conditional UPDATE, capacity edits
 * lock the row first, and the DB check "departures_capacity_check" (held + sold <= capacity) backs both. Prices,
 * publication and sold seats are not touched here. Every seat change is appended to departure_seat_changes.
 */

export type DepartureAvailability = "AVAILABLE" | "SOLD_OUT" | "TO_CONFIRM";
export type DepartureInput = {
  packageId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  availabilityStatus: DepartureAvailability;
};
export type DeparturePatch = Partial<Omit<DepartureInput, "packageId">> & { reason?: string };

const ENTITY = "departure";
const select = {
  id: true,
  packageId: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  heldSeats: true,
  soldSeats: true,
  availabilityStatus: true,
  published: true,
  updatedAt: true,
  package: { select: { id: true, title: true } },
} as const;

type Seats = { capacity: number; heldSeats: number; soldSeats: number };
const present = <T extends Seats>(row: T) => ({
  ...row,
  availableSeats: Math.max(0, row.capacity - row.heldSeats - row.soldSeats),
});
type Locked = { id: string }[];

const overbooking = (available: number) =>
  conflict("OVERBOOKING", `No hay cupos suficientes: quedan ${available} disponibles`, { available });
const isCheckViolation = (error: unknown) =>
  (error as { code?: string }).code === "23514" || /departures_capacity_check/.test(String(error));

async function recordSeats(
  tx: Tx,
  actorId: string,
  departureId: string,
  kind: "CREATED" | "CAPACITY" | "HOLD" | "RELEASE",
  delta: number,
  after: Seats,
  reason: string | null,
) {
  await tx.departureSeatChange.create({
    data: {
      departureId,
      actorId,
      kind,
      delta,
      capacityAfter: after.capacity,
      heldAfter: after.heldSeats,
      soldAfter: after.soldSeats,
      reason,
    },
  });
}
async function audit(tx: Tx, actorId: string, action: string, id: string, before: object | null, after: object | null) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entity: ENTITY,
      entityId: id,
      ...(before ? { before: JSON.parse(JSON.stringify(before)) } : {}),
      ...(after ? { after: JSON.parse(JSON.stringify(after)) } : {}),
    },
  });
}
function assertRange(startsAt: Date, endsAt: Date) {
  if (endsAt.getTime() < startsAt.getTime())
    throw badRequest("DATE_RANGE_INVALID", "La fecha de regreso no puede ser anterior a la de salida");
}

@Injectable()
export class DeparturesService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(packageId: string, current: number, pageSize: number) {
    const client = await this.db.client();
    if (!(await client.tourPackage.findFirst({ where: { id: packageId, deletedAt: null }, select: { id: true } })))
      throw notFound();
    const where = { packageId };
    const [total, rows] = await client.$transaction([
      client.departure.count({ where }),
      client.departure.findMany({
        where,
        select,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map(present),
      total,
      page: current,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async get(id: string) {
    const client = await this.db.client();
    const row = await client.departure.findFirst({ where: { id, package: { deletedAt: null } }, select });
    if (!row) throw notFound();
    return present(row);
  }

  async history(id: string) {
    await this.get(id);
    const client = await this.db.client();
    return client.departureSeatChange.findMany({
      where: { departureId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        kind: true,
        delta: true,
        capacityAfter: true,
        heldAfter: true,
        soldAfter: true,
        reason: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    });
  }

  /** Serialises creations per package so two staff cannot add the same departure date twice. */
  private async assertDateFree(tx: Tx, packageId: string, startsAt: Date, ownId?: string) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`departures:${packageId}`}))`;
    const clash = await tx.departure.findFirst({
      where: { packageId, startsAt, ...(ownId ? { id: { not: ownId } } : {}) },
      select: { id: true },
    });
    if (clash) throw conflict("DEPARTURE_EXISTS", "Ya existe una salida de este paquete en esa fecha");
  }

  async create(input: DepartureInput, actorId: string) {
    assertRange(input.startsAt, input.endsAt);
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const pkg = await tx.tourPackage.findFirst({
        where: { id: input.packageId, deletedAt: null },
        select: { id: true },
      });
      if (!pkg) throw badRequest("PACKAGE_NOT_FOUND", "El paquete no existe");
      await this.assertDateFree(tx, input.packageId, input.startsAt);
      const row = await tx.departure.create({
        data: {
          packageId: input.packageId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          capacity: input.capacity,
          availabilityStatus: input.availabilityStatus,
        },
        select,
      });
      const after = present(row);
      await recordSeats(tx, actorId, row.id, "CREATED", row.capacity, row, null);
      await audit(tx, actorId, "departures.created", row.id, null, after);
      return after;
    });
  }

  async update(id: string, patch: DeparturePatch, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        // Row lock: a concurrent hold waits here, so the capacity check below sees the final held seats.
        const locked = await tx.$queryRaw<Locked>`SELECT "id" FROM "departures" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const old = await tx.departure.findFirst({ where: { id, package: { deletedAt: null } }, select });
        if (!old || !locked.length) throw notFound();
        if (old.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
        const data = {
          startsAt: patch.startsAt ?? old.startsAt,
          endsAt: patch.endsAt ?? old.endsAt,
          capacity: patch.capacity ?? old.capacity,
          availabilityStatus: patch.availabilityStatus ?? old.availabilityStatus,
        };
        assertRange(data.startsAt, data.endsAt);
        const capacityDelta = data.capacity - old.capacity;
        if (capacityDelta !== 0) {
          if (!patch.reason) throw badRequest("REASON_REQUIRED", "Indica el motivo del cambio de capacidad");
          const committed = old.heldSeats + old.soldSeats;
          if (data.capacity < committed)
            throw conflict(
              "CAPACITY_BELOW_COMMITTED",
              `La capacidad no puede ser menor que los cupos retenidos y vendidos (${committed})`,
              { committed },
            );
        }
        if (data.startsAt.getTime() !== old.startsAt.getTime())
          await this.assertDateFree(tx, old.packageId, data.startsAt, id);
        const written = await tx.departure.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data });
        if (written.count !== 1) throw stale();
        const after = present(await tx.departure.findUniqueOrThrow({ where: { id }, select }));
        if (capacityDelta !== 0)
          await recordSeats(tx, actorId, id, "CAPACITY", capacityDelta, after, patch.reason ?? null);
        await audit(tx, actorId, "departures.updated", id, present(old), after);
        return after;
      });
    } catch (error) {
      if (isCheckViolation(error))
        throw conflict(
          "CAPACITY_BELOW_COMMITTED",
          "La capacidad no puede ser menor que los cupos retenidos y vendidos",
        );
      throw error;
    }
  }

  /** One conditional UPDATE: the seats are held only if held + sold + n still fits the capacity. */
  async hold(id: string, seats: number, reason: string, actorId: string) {
    return this.changeHeld(id, seats, reason, actorId);
  }
  /** One conditional UPDATE: only seats currently held can be released. */
  async release(id: string, seats: number, reason: string, actorId: string) {
    return this.changeHeld(id, -seats, reason, actorId);
  }

  private async changeHeld(id: string, delta: number, reason: string, actorId: string) {
    const client = await this.db.client();
    const now = new Date();
    try {
      return await client.$transaction(async (tx) => {
        const rows =
          delta > 0
            ? await tx.$queryRaw<Locked>`UPDATE "departures" SET "held_seats" = "held_seats" + ${delta}::int, "updated_at" = ${now} WHERE "id" = ${id}::uuid AND "held_seats" + "confirmed_seats" + ${delta}::int <= "capacity" AND EXISTS (SELECT 1 FROM "tour_packages" p WHERE p."id" = "departures"."package_id" AND p."deleted_at" IS NULL) RETURNING "id"`
            : await tx.$queryRaw<Locked>`UPDATE "departures" SET "held_seats" = "held_seats" + ${delta}::int, "updated_at" = ${now} WHERE "id" = ${id}::uuid AND "held_seats" + ${delta}::int >= 0 AND EXISTS (SELECT 1 FROM "tour_packages" p WHERE p."id" = "departures"."package_id" AND p."deleted_at" IS NULL) RETURNING "id"`;
        if (rows.length !== 1) {
          const current = await tx.departure.findFirst({ where: { id, package: { deletedAt: null } }, select });
          if (!current) throw notFound();
          if (delta > 0) throw overbooking(present(current).availableSeats);
          throw conflict("RELEASE_EXCEEDS_HELD", `Solo hay ${current.heldSeats} cupos retenidos para liberar`, {
            held: current.heldSeats,
          });
        }
        const after = present(await tx.departure.findUniqueOrThrow({ where: { id }, select }));
        await recordSeats(tx, actorId, id, delta > 0 ? "HOLD" : "RELEASE", delta, after, reason);
        await audit(tx, actorId, delta > 0 ? "departures.seats_held" : "departures.seats_released", id, null, {
          seats: Math.abs(delta),
          reason,
          capacity: after.capacity,
          heldSeats: after.heldSeats,
          soldSeats: after.soldSeats,
        });
        return after;
      });
    } catch (error) {
      if (isCheckViolation(error)) throw overbooking(0);
      throw error;
    }
  }
}
