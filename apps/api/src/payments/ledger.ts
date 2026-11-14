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
