import { transitionReservation } from "@ricaurte/domain";
import type { DbService } from "../db/db.service";

type Db = Awaited<ReturnType<DbService["client"]>>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export const PAYABLE_STATES = ["PENDING_PAYMENT", "PARTIALLY_PAID", "CONFIRMED"] as const;
export const PENDING_TTL_MS = 30 * 60 * 1000;

/** Verified money only: the append-only ledger is the single source of the paid amount. */
export async function paidCentsOf(client: Db | Tx, reservationId: string): Promise<bigint> {
  const sum = await client.ledgerEntry.aggregate({ where: { reservationId }, _sum: { amountCents: true } });
  return sum._sum.amountCents ?? 0n;
}

export type PaymentRow = {
  reference: string;
  amountCents: bigint;
  status: string;
  provider: string;
  createdAt: Date;
  approvedAt: Date | null;
  expiresAt: Date | null;
};

export const paymentSelect = {
  reference: true,
  amountCents: true,
  status: true,
  provider: true,
  createdAt: true,
  approvedAt: true,
  expiresAt: true,
} as const;

export function isLivePending(row: PaymentRow, now = new Date()): boolean {
  return row.status === "PENDING" && (!row.expiresAt || row.expiresAt > now);
}

/** Money summary shared by the customer portal and the staff detail. */
export function paymentSummary(input: {
  status: string;
  totalCents: bigint;
  requiredDepositCents: bigint;
  paidCents: bigint;
  payments: PaymentRow[];
  adapterEnabled: boolean;
  checkoutUrl?: (reference: string) => string;
}) {
  const balance = input.totalCents > input.paidCents ? input.totalCents - input.paidCents : 0n;
  const pending = input.payments.find((row) => isLivePending(row));
  return {
    payment: {
      paidCents: input.paidCents.toString(),
      balanceCents: balance.toString(),
      requiredDepositCents: input.requiredDepositCents.toString(),
      canPay: input.adapterEnabled && (PAYABLE_STATES as readonly string[]).includes(input.status) && balance > 0n,
      pending: pending
        ? {
            reference: pending.reference,
            amountCents: pending.amountCents.toString(),
            ...(input.checkoutUrl ? { checkoutUrl: input.checkoutUrl(pending.reference) } : {}),
          }
        : null,
    },
    payments: input.payments.map((row) => ({
      reference: row.reference,
      amountCents: row.amountCents.toString(),
      status: row.status,
      provider: row.provider,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
    })),
  };
}

/** Applies verified money to the reservation. Never confirms it: CONFIRM stays a staff decision. */
export async function settleReservation(
  tx: Tx,
  reservationId: string,
  source: { paymentId?: string; manualAbonoId?: string },
  now: Date,
  actor: { role: "SYSTEM" | "FINANCE"; id: string | null },
) {
  await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservationId}::uuid FOR UPDATE`;
  const r = await tx.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: {
      status: true,
      version: true,
      totalCents: true,
      requiredDepositCents: true,
      availabilityValidatedAt: true,
    },
  });
  const paid = await paidCentsOf(tx, reservationId);
  if (paid > r.totalCents)
    await tx.auditLog.create({
      data: {
        action: "payment.settlement_review",
        entity: "reservation",
        entityId: reservationId,
        after: { ...source, reason: "OVERPAID", paidCents: paid.toString() },
      },
    });
  const outcome = transitionReservation(
    r.status,
    { type: "PAYMENT_SETTLED", actor: { role: actor.role, id: actor.id ?? "system" } },
    {
      totalCents: Number(r.totalCents),
      paidCents: Number(paid),
      requiredDepositCents: Number(r.requiredDepositCents),
      availabilityValidated: r.availabilityValidatedAt !== null,
    },
    now,
  );
  if (!outcome.ok) {
    // Money is held but the reservation cannot take it (e.g. cancelled meanwhile): surface for reconciliation.
    await tx.auditLog.create({
      data: {
        action: "payment.settlement_review",
        entity: "reservation",
        entityId: reservationId,
        after: { ...source, status: r.status, error: outcome.error },
      },
    });
    return;
  }
  if (!outcome.changed) return;
  await tx.reservation.update({
    where: { id: reservationId },
    data: { status: outcome.next, version: { increment: 1 } },
  });
  await tx.reservationStatusHistory.create({
    data: {
      reservationId,
      fromStatus: r.status,
      toStatus: outcome.next,
      event: "PAYMENT_SETTLED",
      actorId: actor.id,
      role: actor.role,
      at: now,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action: "reservation.payment_settled",
      entity: "reservation",
      entityId: reservationId,
      before: { status: r.status },
      after: { status: outcome.next, paidCents: paid.toString() },
    },
  });
}
