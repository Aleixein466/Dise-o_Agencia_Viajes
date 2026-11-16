import type { Tx } from "../catalog/commercial-rules.service";

/** Plain-JSON copy, accepted wherever Prisma wants a Json value. */
export const toJson = (value: object) => JSON.parse(JSON.stringify(value));
const clone = toJson;

/** Same-transaction audit row. Snapshots are redacted only when read back (audit/redact.ts). */
export async function writeAudit(
  tx: Tx,
  entry: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    before?: object | null;
    after?: object | null;
    details?: object;
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ...(entry.before ? { before: clone(entry.before) } : {}),
      ...(entry.after ? { after: clone(entry.after) } : {}),
      ...(entry.details ? { details: clone(entry.details) } : {}),
    },
  });
}

export function assertStamp(row: { updatedAt: Date }, expectedUpdatedAt: Date, stale: () => Error) {
  if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
}
