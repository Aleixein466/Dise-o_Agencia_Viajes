export const RESERVATION_STATUSES = [
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

export const RESERVATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: "Borrador",
  REQUEST_RECEIVED: "Solicitud recibida",
  PENDING_VALIDATION: "Validando disponibilidad",
  PENDING_PAYMENT: "Pendiente de pago",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  CONFIRMED: "Confirmada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  REFUND_PENDING: "Reembolso pendiente",
  REFUNDED: "Reembolsada",
  COMPLETED: "Completada",
};

export type ReservationAction = "START_VALIDATION" | "APPROVE_FOR_PAYMENT" | "CONFIRM" | "REJECT" | "CANCEL";

export const RESERVATION_ACTION_LABELS: Readonly<Record<ReservationAction, string>> = {
  START_VALIDATION: "Iniciar validación",
  APPROVE_FOR_PAYMENT: "Confirmar disponibilidad",
  CONFIRM: "Confirmar reserva",
  REJECT: "Rechazar",
  CANCEL: "Cancelar",
};

export const reservationStatusLabel = (status: string) => RESERVATION_STATUS_LABELS[status] ?? status;

const LIVE_BEFORE_PAYMENT = ["REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT"];
const REJECTABLE = [...LIVE_BEFORE_PAYMENT, "PARTIALLY_PAID", "PAID"];
const CANCELLABLE = ["DRAFT", ...LIVE_BEFORE_PAYMENT, "PARTIALLY_PAID", "PAID", "CONFIRMED"];

/** Staff actions available per status; mirrors packages/domain reservations state machine (ADVISOR/ADMIN rules). */
export function allowedReservationActions(status: string): ReservationAction[] {
  const actions: ReservationAction[] = [];
  if (status === "REQUEST_RECEIVED") actions.push("START_VALIDATION");
  if (status === "PENDING_VALIDATION") actions.push("APPROVE_FOR_PAYMENT");
  if (status === "PARTIALLY_PAID" || status === "PAID") actions.push("CONFIRM");
  if (REJECTABLE.includes(status)) actions.push("REJECT");
  if (CANCELLABLE.includes(status)) actions.push("CANCEL");
  return actions;
}

export const actionRequiresReason = (action: ReservationAction) => action === "REJECT" || action === "CANCEL";

export function parseDepositPesos(input: string): string | null {
  const clean = input.trim().replace(/[\s.,]/g, "");
  return /^\d+$/.test(clean) ? (BigInt(clean) * BigInt(100)).toString() : null;
}
