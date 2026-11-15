import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { redact } from "./redact";

export type AuditFilter = {
  entity?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  from?: string;
  to?: string;
};

// Colombia is UTC-5 without DST: a calendar day runs 05:00Z of that day to 05:00Z of the next.
const dayStart = (date: string) => new Date(`${date}T05:00:00.000Z`);
const nextDayStart = (date: string) => new Date(dayStart(date).getTime() + 24 * 60 * 60 * 1000);

export function auditWhere(filter: AuditFilter) {
  const createdAt = {
    ...(filter.from ? { gte: dayStart(filter.from) } : {}),
    ...(filter.to ? { lt: nextDayStart(filter.to) } : {}),
  };
  return {
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.from || filter.to ? { createdAt } : {}),
  };
}

export const actionPrefix = (action: string) => action.split(".")[0] ?? action;

/** Read-only audit trail. Never selects ipHash; before/after/details are redacted (see redact.ts). */
@Injectable()
export class AuditService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(filter: AuditFilter, page: number, pageSize: number) {
    const client = await this.db.client();
    const where = auditWhere(filter);
    const [total, rows] = await client.$transaction([
      client.auditLog.count({ where }),
      client.auditLog.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entity: true,
          entityId: true,
          actorRole: true,
          requestId: true,
          before: true,
          after: true,
          details: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        actor: row.actor ? { id: row.actor.id, name: row.actor.name } : null,
        actorRole: row.actorRole,
        requestId: row.requestId,
        before: redact(row.before),
        after: redact(row.after),
        details: redact(row.details),
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Distinct entities and action prefixes (text before the first dot) for the filter selects, at most 100 each. */
  async facets() {
    const client = await this.db.client();
    const [entities, actions] = await Promise.all([
      client.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" }, take: 100 }),
      client.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" }, take: 1000 }),
    ]);
    const prefixes = [...new Set(actions.map((row) => actionPrefix(row.action)))].sort().slice(0, 100);
    return { entities: entities.map((row) => row.entity), actions: prefixes };
  }
}
