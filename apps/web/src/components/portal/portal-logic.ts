export const QUOTE_STATUSES = [
  "DRAFT",
  "REQUIRES_MANUAL_REVIEW",
  "NEW",
  "ASSIGNED",
  "PROPOSAL_SENT",
  "ACCEPTED",
  "DECLINED",
  "CLOSED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

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
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "En preparación",
  REQUIRES_MANUAL_REVIEW: "En revisión por un asesor",
  NEW: "Solicitud recibida",
  ASSIGNED: "Asignada a un asesor",
  PROPOSAL_SENT: "Propuesta enviada",
  ACCEPTED: "Propuesta aceptada",
  DECLINED: "Propuesta rechazada",
  CLOSED: "Cerrada",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  DRAFT: "Borrador",
  REQUEST_RECEIVED: "Solicitud recibida",
  PENDING_VALIDATION: "Validando disponibilidad",
  PENDING_PAYMENT: "Disponibilidad confirmada · pendiente de pago",
  PARTIALLY_PAID: "Pago parcial recibido",
  PAID: "Pagada",
  CONFIRMED: "Reserva confirmada",
  REJECTED: "No fue posible atenderla",
  CANCELLED: "Cancelada",
  REFUND_PENDING: "Reembolso pendiente",
  REFUNDED: "Reembolsada",
  COMPLETED: "Viaje completado",
};

export function quoteStatusLabel(status: string): string {
  return (QUOTE_STATUS_LABELS as Record<string, string>)[status] ?? "Estado en revisión";
}

export function reservationStatusLabel(status: string): string {
  return (RESERVATION_STATUS_LABELS as Record<string, string>)[status] ?? "Estado en revisión";
}

export const CANCELLABLE_RESERVATION_STATUSES: readonly string[] = [
  "DRAFT",
  "REQUEST_RECEIVED",
  "PENDING_VALIDATION",
  "PENDING_PAYMENT",
];

export function canCancelReservation(status: string): boolean {
  return CANCELLABLE_RESERVATION_STATUSES.includes(status);
}

export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

export function validateCancelReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length < CANCEL_REASON_MIN) return "Cuéntanos el motivo (mínimo 3 caracteres).";
  if (length > CANCEL_REASON_MAX) return "El motivo no puede superar 500 caracteres.";
  return null;
}

export type TravelerCategory = "ADULT" | "CHILD" | "INFANT";
export type TravelerRow = { category: TravelerCategory; fullName: string; ageYears: string };

/** One row per traveler: adults first, then minors, sized from the quote. */
export function buildTravelerRows(adults: number, children: number): TravelerRow[] {
  const rows: TravelerRow[] = [];
  for (let i = 0; i < Math.max(0, Math.trunc(adults)); i += 1)
    rows.push({ category: "ADULT", fullName: "", ageYears: "" });
  for (let i = 0; i < Math.max(0, Math.trunc(children)); i += 1)
    rows.push({ category: "CHILD", fullName: "", ageYears: "" });
  return rows;
}

export type TravelerPayload = { fullName: string; category: TravelerCategory; ageYears?: number };

export type ReservationFormInput = { startsOn: string; rows: TravelerRow[]; notes: string };
export type ReservationFormErrors = {
  startsOn?: string;
  notes?: string;
  rows: Record<number, { fullName?: string; ageYears?: string }>;
};

/** Tomorrow in Bogota (UTC-5, no DST) as YYYY-MM-DD. */
export function minStartDate(now: Date = new Date()): string {
  const bogota = new Date(now.getTime() - 5 * 3_600_000);
  bogota.setUTCDate(bogota.getUTCDate() + 1);
  return bogota.toISOString().slice(0, 10);
}

export function validateReservationForm(input: ReservationFormInput, minDate: string): ReservationFormErrors {
  const errors: ReservationFormErrors = { rows: {} };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) || Number.isNaN(Date.parse(`${input.startsOn}T00:00:00Z`))) {
    errors.startsOn = "Elige la fecha de inicio del viaje.";
  } else if (input.startsOn < minDate) {
    errors.startsOn = "La fecha de inicio debe ser a partir de mañana.";
  }
  input.rows.forEach((row, index) => {
    const rowErrors: { fullName?: string; ageYears?: string } = {};
    const name = row.fullName.trim();
    if (name.length < 2 || name.length > 160) rowErrors.fullName = "Escribe el nombre completo (2 a 160 caracteres).";
    if (row.category !== "ADULT") {
      const age = Number(row.ageYears);
      if (row.ageYears.trim() === "" || !Number.isInteger(age) || age < 0 || age > 17) {
        rowErrors.ageYears = "Indica la edad del menor (0 a 17 años).";
      }
    }
    if (rowErrors.fullName || rowErrors.ageYears) errors.rows[index] = rowErrors;
  });
  if (input.notes.trim().length > 1000) errors.notes = "Las notas no pueden superar 1000 caracteres.";
  return errors;
}

export function hasFormErrors(errors: ReservationFormErrors): boolean {
  return Boolean(errors.startsOn || errors.notes || Object.keys(errors.rows).length);
}

export function buildReservationBody(input: ReservationFormInput) {
  const travelers: TravelerPayload[] = input.rows.map((row) => ({
    fullName: row.fullName.trim(),
    category: row.category,
    ...(row.category === "ADULT" ? {} : { ageYears: Number(row.ageYears) }),
  }));
  const notes = input.notes.trim();
  return { startsOn: input.startsOn, travelers, ...(notes ? { notes } : {}) };
}

/** User-facing Spanish message for a failed portal call. */
export function portalErrorMessage(
  status: number,
  fallback = "No fue posible completar la acción. Inténtalo de nuevo.",
): string {
  if (status === 0) return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (status === 401 || status === 403) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (status === 404) return "No encontramos este registro en tu cuenta.";
  if (status === 409)
    return "Este registro cambió mientras lo revisabas. Lo actualizamos para que veas la información vigente.";
  if (status === 429) return "Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.";
  return fallback;
}

const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormat.format(date);
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En verificación",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  VOIDED: "Anulado",
  ERROR: "Error",
  REFUNDED: "Reembolsado",
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? "Estado en revisión";
}

export type PaymentPending = { reference: string; amountCents: string; checkoutUrl: string };
export type PaymentSummary = {
  paidCents: string;
  balanceCents: string;
  requiredDepositCents: string | null;
  canPay: boolean;
  pending: PaymentPending | null;
};
export type PaymentRecord = {
  reference: string;
  amountCents: string;
  status: string;
  provider: string;
  createdAt: string;
  approvedAt: string | null;
};

const DIGITS = /^\d+$/;

/** Whole pesos typed by the person (digits, spaces, dots or commas as thousand separators) to a cents string. */
export function pesosToCents(input: string): string | null {
  const clean = input.trim().replace(/[\s.,]/g, "");
  if (!DIGITS.test(clean)) return null;
  return (BigInt(clean) * BigInt(100)).toString();
}

export function validatePaymentAmount(
  input: string,
  balanceCents: string,
): { cents: string; error: null } | { cents: null; error: string } {
  const cents = pesosToCents(input);
  if (cents === null) return { cents: null, error: "Escribe un valor en pesos, solo números." };
  if (BigInt(cents) < BigInt(100)) return { cents: null, error: "El valor debe ser de al menos $1." };
  if (DIGITS.test(balanceCents) && BigInt(cents) > BigInt(balanceCents))
    return { cents: null, error: "El valor no puede superar el saldo pendiente." };
  return { cents, error: null };
}

/** Suggested amount in whole pesos: remaining deposit if any, otherwise the balance. */
export function defaultPaymentPesos(
  payment: Pick<PaymentSummary, "paidCents" | "balanceCents" | "requiredDepositCents">,
): string {
  if (!DIGITS.test(payment.balanceCents)) return "";
  const balance = BigInt(payment.balanceCents);
  let target = balance;
  if (payment.requiredDepositCents && DIGITS.test(payment.requiredDepositCents) && DIGITS.test(payment.paidCents)) {
    const remaining = BigInt(payment.requiredDepositCents) - BigInt(payment.paidCents);
    if (remaining > BigInt(0) && remaining < balance) target = remaining;
  }
  return (target / BigInt(100)).toString();
}
