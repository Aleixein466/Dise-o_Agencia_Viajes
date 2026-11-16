import { redact } from "../audit/redact";
import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { badRequest, conflict, notFound, stale, type Tx } from "./commercial-rules.service";

/**
 * Staff CRUD for transport options. Prices are price rules, not columns here. Options are never deleted: they are
 * deactivated (and can be activated again). Contract: docs/orchestration/contracts/transport-options-admin.md
 */

export type TransportMode = "GROUND" | "AIR" | "SEA";
export type TransportStatus = "active" | "inactive";
export type TransportFilter = { destinationId?: string; mode?: TransportMode; status?: TransportStatus };
export type TransportInput = {
  destinationId: string;
  mode: TransportMode;
  name: string;
  description?: string | null;
  conditions?: string | null;
};
export type TransportPatch = Partial<Omit<TransportInput, "destinationId">>;

const ENTITY = "transport_option";
const select = {
  id: true,
  destinationId: true,
  mode: true,
  name: true,
  description: true,
  conditions: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  destination: { select: { id: true, name: true } },
} as const;

type Row = { active: boolean };
const present = <T extends Row>(row: T) => ({
  ...row,
  status: (row.active ? "active" : "inactive") as TransportStatus,
});

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
function assertStamp(row: { updatedAt: Date }, expectedUpdatedAt: Date) {
  if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
}
const nameTaken = () =>
  conflict("TRANSPORT_NAME_TAKEN", "Ya existe una opción de transporte con ese nombre para el destino y modo");

@Injectable()
export class TransportOptionsService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async history(id: string) {
    const client = await this.db.client();
    // Same visibility as get(): a deleted option has no readable history.
    if (!(await client.transportOption.findFirst({ where: { id, deletedAt: null }, select: { id: true } })))
      throw notFound();
    const rows = await client.auditLog.findMany({
      where: { entity: ENTITY, entityId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, before: redact(row.before), after: redact(row.after) }));
  }

  async list(filter: TransportFilter, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(filter.destinationId ? { destinationId: filter.destinationId } : {}),
      ...(filter.mode ? { mode: filter.mode } : {}),
      ...(filter.status ? { active: filter.status === "active" } : {}),
    };
    const [total, rows] = await client.$transaction([
      client.transportOption.count({ where }),
      client.transportOption.findMany({
        where,
        select,
        orderBy: [{ name: "asc" }, { id: "asc" }],
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
    const row = await client.transportOption.findFirst({ where: { id, deletedAt: null }, select });
    if (!row) throw notFound();
    return present(row);
  }

  private async assertNameFree(
    tx: Tx,
    key: { destinationId: string; mode: TransportMode; name: string },
    ownId?: string,
  ) {
    const clash = await tx.transportOption.findFirst({
      where: {
        destinationId: key.destinationId,
        mode: key.mode,
        name: { equals: key.name, mode: "insensitive" },
        ...(ownId ? { id: { not: ownId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw nameTaken();
  }

  async create(input: TransportInput, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        const destination = await tx.destination.findFirst({
          where: { id: input.destinationId, deletedAt: null },
          select: { id: true },
        });
        if (!destination) throw badRequest("DESTINATION_NOT_FOUND", "El destino no existe");
        await this.assertNameFree(tx, input);
        const row = await tx.transportOption.create({
          data: {
            destinationId: input.destinationId,
            mode: input.mode,
            name: input.name,
            description: input.description ?? null,
            conditions: input.conditions ?? null,
            active: true,
          },
          select,
        });
        const after = present(row);
        await audit(tx, actorId, "transport_options.created", row.id, null, after);
        return after;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw nameTaken();
      throw error;
    }
  }

  async update(id: string, patch: TransportPatch, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        const old = await tx.transportOption.findFirst({ where: { id, deletedAt: null }, select });
        if (!old) throw notFound();
        assertStamp(old, expectedUpdatedAt);
        const before = present(old);
        const data = {
          mode: patch.mode ?? old.mode,
          name: patch.name ?? old.name,
          description: patch.description !== undefined ? patch.description : old.description,
          conditions: patch.conditions !== undefined ? patch.conditions : old.conditions,
        };
        if (data.mode !== old.mode || data.name.toLowerCase() !== old.name.toLowerCase())
          await this.assertNameFree(tx, { destinationId: old.destinationId, mode: data.mode, name: data.name }, id);
        const changed = await tx.transportOption.updateMany({
          where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
          data,
        });
        if (changed.count !== 1) throw stale();
        const after = present(await tx.transportOption.findUniqueOrThrow({ where: { id }, select }));
        await audit(tx, actorId, "transport_options.updated", id, before, after);
        return after;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw nameTaken();
      throw error;
    }
  }

  async deactivate(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.setActive(id, false, expectedUpdatedAt, actorId);
  }
  async activate(id: string, expectedUpdatedAt: Date, actorId: string) {
    return this.setActive(id, true, expectedUpdatedAt, actorId);
  }

  private async setActive(id: string, active: boolean, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const old = await tx.transportOption.findFirst({ where: { id, deletedAt: null }, select });
      if (!old) throw notFound();
      assertStamp(old, expectedUpdatedAt);
      if (old.active === active)
        throw conflict(
          active ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE",
          active ? "Ya estaba activa" : "Ya estaba desactivada",
        );
      // No admin path adds transport components to PUBLISHED packages (only drafts, via import); publishing a package
      // that uses an inactive option is harmless because public pricing refuses inactive/deleted transport.
      if (!active) {
        const count = await tx.packageComponent.count({
          where: { transportOptionId: id, package: { status: "PUBLISHED", deletedAt: null } },
        });
        if (count > 0)
          throw conflict(
            "TRANSPORT_IN_USE",
            `La opción se usa en ${count} componente(s) de paquetes publicados. Quítala de esos paquetes primero`,
            { count },
          );
      }
      const before = present(old);
      const changed = await tx.transportOption.updateMany({
        where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
        data: { active },
      });
      if (changed.count !== 1) throw stale();
      const after = present(await tx.transportOption.findUniqueOrThrow({ where: { id }, select }));
      await audit(
        tx,
        actorId,
        active ? "transport_options.activated" : "transport_options.deactivated",
        id,
        before,
        after,
      );
      return after;
    });
  }
}
