import { assertCents } from "../shared/money";

/** Reservation lifecycle (requirements §10.4). Payment status lives in a separate machine. */
export const RESERVATION_STATES = [
  "DRAFT",
  "REQUEST_RECEIVED",
  "PENDING_VALIDATION",
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAID",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "COMPLETED",
] as const;
export type ReservationState = (typeof RESERVATION_STATES)[number];

export const RESERVATION_EVENTS = [
  "SUBMIT_REQUEST",
  "CHECKOUT",
  "START_VALIDATION",
  "APPROVE_FOR_PAYMENT",
  "PAYMENT_SETTLED",
  "CONFIRM",
  "REJECT",
  "CANCEL",
  "REFUND_COMPLETED",
  "COMPLETE",
] as const;
export type ReservationEventType = (typeof RESERVATION_EVENTS)[number];

export const ROLES = ["CUSTOMER", "ADVISOR", "FINANCE", "ADMIN", "SYSTEM"] as const;
export type Role = (typeof ROLES)[number];

export const TERMINAL_STATES: ReadonlySet<ReservationState> = new Set([
  "REJECTED",
  "CANCELLED",
  "REFUNDED",
  "COMPLETED",
]);

/** paidCents counts only verified, approved money (never return-URL or unverified data). */
export type ReservationContext = {
  totalCents: number;
  paidCents: number;
  requiredDepositCents: number;
  availabilityValidated: boolean;
};
export type ReservationEvent = { type: ReservationEventType; actor: { role: Role; id: string }; reason?: string };
export type HistoryEntry = {
  from: ReservationState;
  to: ReservationState;
  event: ReservationEventType;
  actorId: string;
  role: Role;
  reason?: string;
  at: Date;
};
export type ReservationError =
  "INVALID_TRANSITION" | "FORBIDDEN" | "GUARD_FAILED" | "REASON_REQUIRED" | "INVALID_AMOUNT";
export type ReservationResult =
  | { ok: true; changed: false; next: ReservationState }
  | { ok: true; changed: true; next: ReservationState; history: HistoryEntry }
  | { ok: false; error: ReservationError };

type Rule = { readonly from: readonly ReservationState[]; readonly roles: readonly Role[] };
const STAFF: readonly Role[] = ["ADVISOR", "ADMIN"];
const PRE_PAYMENT: readonly ReservationState[] = ["DRAFT", "REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT"];

/**
 * Explicit transition table: event -> list of (source states, allowed roles).
 * An event/state pair absent from this table is INVALID_TRANSITION; present but wrong role is FORBIDDEN.
 */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationEventType, readonly Rule[]>> = Object.freeze({
  SUBMIT_REQUEST: [{ from: ["DRAFT"], roles: ["CUSTOMER"] }],
  CHECKOUT: [{ from: ["DRAFT"], roles: ["CUSTOMER"] }],
  START_VALIDATION: [{ from: ["REQUEST_RECEIVED"], roles: STAFF }],
  APPROVE_FOR_PAYMENT: [{ from: ["PENDING_VALIDATION"], roles: STAFF }],
  // CONFIRMED accepts later abonos (deposit-based confirmation, §11.4 "varios pagos").
  PAYMENT_SETTLED: [{ from: ["PENDING_PAYMENT", "PARTIALLY_PAID", "PAID", "CONFIRMED"], roles: ["SYSTEM", "FINANCE"] }],
  CONFIRM: [{ from: ["PARTIALLY_PAID", "PAID"], roles: STAFF }],
  REJECT: [
    { from: ["REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT", "PARTIALLY_PAID", "PAID"], roles: STAFF },
  ],
  CANCEL: [
    { from: PRE_PAYMENT, roles: ["CUSTOMER"] },
    // Staff may cancel any live reservation; REFUND_PENDING is excluded because money is already in flight.
    { from: [...PRE_PAYMENT, "PARTIALLY_PAID", "PAID", "CONFIRMED"], roles: STAFF },
  ],
  REFUND_COMPLETED: [{ from: ["REFUND_PENDING"], roles: ["FINANCE"] }],
  COMPLETE: [{ from: ["CONFIRMED"], roles: STAFF }],
});

const REASON_REQUIRED: ReadonlySet<ReservationEventType> = new Set(["REJECT", "CANCEL", "REFUND_COMPLETED"]);

export function transitionReservation(
  state: ReservationState,
  event: ReservationEvent,
  ctx: ReservationContext,
  at: Date,
): ReservationResult {
  try {
    assertCents(ctx.totalCents);
    assertCents(ctx.paidCents);
    assertCents(ctx.requiredDepositCents);
  } catch {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  const rules = RESERVATION_TRANSITIONS[event.type].filter((rule) => rule.from.includes(state));
  if (rules.length === 0) return { ok: false, error: "INVALID_TRANSITION" };
  if (!rules.some((rule) => rule.roles.includes(event.actor.role))) return { ok: false, error: "FORBIDDEN" };

  const reason = event.reason?.trim();
  if (REASON_REQUIRED.has(event.type) && !reason) return { ok: false, error: "REASON_REQUIRED" };

  const next = resolveNext(state, event.type, ctx);
  if (next === null) return { ok: false, error: "GUARD_FAILED" };
  if (next === state) return { ok: true, changed: false, next };
  return {
    ok: true,
    changed: true,
    next,
    history: {
      from: state,
      to: next,
      event: event.type,
      actorId: event.actor.id,
      role: event.actor.role,
      ...(reason ? { reason } : {}),
      at,
    },
  };
}

/** Returns the target state, or null when a guard fails. Money received never yields CONFIRMED by itself. */
function resolveNext(
  state: ReservationState,
  type: ReservationEventType,
  ctx: ReservationContext,
): ReservationState | null {
  const moneyHeld = ctx.paidCents > 0;
  const fullyPaid = ctx.paidCents >= ctx.totalCents;
  // A state that implies money received must never be closed without refund because of stale context.
  const stateImpliesMoney = state === "PARTIALLY_PAID" || state === "PAID" || state === "CONFIRMED";
  if ((type === "REJECT" || type === "CANCEL") && stateImpliesMoney && !moneyHeld) return null;
  switch (type) {
    case "SUBMIT_REQUEST":
      return "REQUEST_RECEIVED";
    case "CHECKOUT":
      return "PENDING_PAYMENT";
    case "START_VALIDATION":
      return "PENDING_VALIDATION";
    case "APPROVE_FOR_PAYMENT":
      return ctx.availabilityValidated ? "PENDING_PAYMENT" : null;
    case "PAYMENT_SETTLED":
      if (!moneyHeld) return null;
      if (state === "CONFIRMED") return "CONFIRMED"; // further abonos never change confirmation
      if (state === "PAID") return fullyPaid ? "PAID" : null; // never downgrade a paid reservation
      return fullyPaid ? "PAID" : "PARTIALLY_PAID";
    case "CONFIRM": {
      const depositMet = ctx.requiredDepositCents > 0 && ctx.paidCents >= ctx.requiredDepositCents;
      return ctx.availabilityValidated && (fullyPaid || depositMet) ? "CONFIRMED" : null;
    }
    case "REJECT":
      return moneyHeld ? "REFUND_PENDING" : "REJECTED";
    case "CANCEL":
      return moneyHeld ? "REFUND_PENDING" : "CANCELLED";
    case "REFUND_COMPLETED":
      return "REFUNDED";
    case "COMPLETE":
      return fullyPaid ? "COMPLETED" : null;
  }
}

const CUSTOMER_LABELS: Readonly<Record<ReservationState, string>> = Object.freeze({
  DRAFT: "Borrador",
  REQUEST_RECEIVED: "Solicitud recibida",
  PENDING_VALIDATION: "Solicitud en revisión",
  PENDING_PAYMENT: "Pendiente de pago",
  PARTIALLY_PAID: "Pago parcial recibido – pendiente de confirmación",
  PAID: "Pago recibido – pendiente de confirmación",
  CONFIRMED: "Confirmada",
  REJECTED: "Solicitud no aprobada",
  CANCELLED: "Cancelada",
  REFUND_PENDING: "Reembolso en trámite",
  REFUNDED: "Reembolsada",
  COMPLETED: "Viaje realizado",
});

export function customerStatus(state: ReservationState): string {
  return CUSTOMER_LABELS[state];
}
