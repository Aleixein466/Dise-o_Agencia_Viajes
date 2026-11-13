import { assertCents } from "../shared/money";
import type { Role } from "../reservations/state-machine";

/** Payment status (requirements §10.4/§11.3), separate from reservation status. */
export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type Payment = {
  reference: string;
  amountCents: number;
  currency: "COP";
  status: PaymentStatus;
  processedEventIds: readonly string[];
};

/** A provider event that has ALREADY passed signature verification and transaction lookup. */
export type PaymentEvent = {
  eventId: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  reference: string;
};
/** Effects the caller must apply to the reservation ledger: APPROVED adds money, VOIDED/REFUNDED remove it. */
export type PaymentEffect = "APPROVED" | "VOIDED" | "REFUNDED";
export type PaymentError = "MISMATCH" | "INVALID_TRANSITION" | "FORBIDDEN" | "INVALID_AMOUNT" | "INVALID_EVENT";
export type PaymentResult =
  { ok: true; changed: boolean; payment: Payment; effect?: PaymentEffect } | { ok: false; error: PaymentError };

/** Forward transitions only. Equal or backward (stale) statuses are recorded as no-ops. */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = Object.freeze({
  PENDING: ["APPROVED", "DECLINED", "VOIDED", "ERROR"],
  ERROR: ["APPROVED", "DECLINED"],
  // VOIDED after APPROVED: provider annulment (e.g. card void) reverses verified money.
  APPROVED: ["VOIDED", "REFUNDED"],
  DECLINED: [],
  VOIDED: [],
  REFUNDED: [],
});

const RANK: Readonly<Record<PaymentStatus, number>> = {
  PENDING: 0,
  ERROR: 1,
  APPROVED: 2,
  DECLINED: 2,
  VOIDED: 2,
  REFUNDED: 3,
};

/**
 * SYSTEM = verified provider pipeline. FINANCE may approve manually registered abonos (transfer/cash
 * with comprobante, §11.4 — the caller must store reference, approver and evidence) and record refunds.
 */
function actorMayApply(role: Role, status: PaymentStatus): boolean {
  if (status === "REFUNDED") return role === "FINANCE";
  if (status === "APPROVED") return role === "SYSTEM" || role === "FINANCE";
  return role === "SYSTEM";
}

export function applyPaymentEvent(payment: Payment, evt: PaymentEvent, actor: { role: Role }): PaymentResult {
  // Only the verified provider pipeline (SYSTEM) or finance staff may move money states.
  if (actor.role !== "SYSTEM" && actor.role !== "FINANCE") return { ok: false, error: "FORBIDDEN" };
  if (!evt.eventId.trim() || !PAYMENT_STATUSES.includes(evt.status)) return { ok: false, error: "INVALID_EVENT" };
  try {
    assertCents(payment.amountCents);
    assertCents(evt.amountCents);
  } catch {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  // Idempotency: a replayed event never has a second effect.
  if (payment.processedEventIds.includes(evt.eventId)) return { ok: true, changed: false, payment };

  // Integrity: the event must describe exactly this payment; never approve on mismatch.
  if (
    evt.reference !== payment.reference ||
    evt.currency !== payment.currency ||
    evt.amountCents !== payment.amountCents
  ) {
    return { ok: false, error: "MISMATCH" };
  }

  const recorded: Payment = { ...payment, processedEventIds: [...payment.processedEventIds, evt.eventId] };
  if (PAYMENT_TRANSITIONS[payment.status].includes(evt.status)) {
    if (!actorMayApply(actor.role, evt.status)) return { ok: false, error: "FORBIDDEN" };
    const reversesMoney = payment.status === "APPROVED" && evt.status === "VOIDED";
    const effect: PaymentEffect | undefined =
      evt.status === "APPROVED" || evt.status === "REFUNDED" ? evt.status : reversesMoney ? "VOIDED" : undefined;
    return { ok: true, changed: true, payment: { ...recorded, status: evt.status }, ...(effect ? { effect } : {}) };
  }
  // Stale or repeated status (e.g. PENDING arriving after APPROVED): record, never downgrade.
  if (evt.status === payment.status || RANK[evt.status] < RANK[payment.status])
    return { ok: true, changed: false, payment: recorded };
  // Conflicting final statuses (e.g. APPROVED after DECLINED) are surfaced for reconciliation, never ignored.
  return { ok: false, error: "INVALID_TRANSITION" };
}
