import type { DbService } from "../db/db.service";
import type { NotificationsService } from "./notifications.service";

type Db = Awaited<ReturnType<DbService["client"]>>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/**
 * Queues a customer notification in the caller's transaction (atomic with the business change). The outbox row
 * holds only references and statuses; the dispatcher decides whether anything is delivered.
 */
export async function notifyCustomer(
  notifications: NotificationsService | undefined,
  tx: Db | Tx,
  customerId: string,
  kind: string,
  data: Record<string, unknown>,
  dedupeKey: string,
): Promise<void> {
  if (!notifications) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { email: true, name: true } });
  if (!customer?.email) return;
  const firstName = customer.name?.trim().split(/\s+/)[0];
  await notifications.enqueue(kind, customer.email, { ...data, ...(firstName ? { firstName } : {}) }, dedupeKey, tx);
}
