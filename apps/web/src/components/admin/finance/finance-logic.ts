export const ABONO_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};
export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PAID: "Pagada",
  PARTIAL: "Parcial",
  PENDING: "Pendiente",
  OVERDUE: "Vencida",
};
export const PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const abonoStatusLabel = (status: string): string => ABONO_STATUS_LABELS[status] ?? status;
export const installmentStatusLabel = (status: string): string => INSTALLMENT_STATUS_LABELS[status] ?? status;
export const planStatusLabel = (status: string): string => PLAN_STATUS_LABELS[status] ?? status;

const UNSIGNED = /^\d+$/;
const SIGNED = /^-?\d+$/;
const strip = (input: string) => input.trim().replace(/[\s.,]/g, "");

/** Whole pesos to a cents string; digits only, > 0. */
export function pesosToPositiveCents(input: string): string | null {
  const clean = strip(input);
  if (!UNSIGNED.test(clean)) return null;
  const cents = BigInt(clean) * BigInt(100);
  return cents > BigInt(0) ? cents.toString() : null;
}

/** Whole pesos with optional leading minus to signed cents; zero is rejected. */
export function signedPesosToCents(input: string): string | null {
  const clean = strip(input.replace(/^\s*[−–]/, "-"));
  if (!SIGNED.test(clean)) return null;
  const cents = BigInt(clean) * BigInt(100);
  return cents === BigInt(0) ? null : cents.toString();
}

export type InstallmentRow = { dueOn: string; amount: string };

export function sumInstallmentCents(rows: readonly InstallmentRow[]): bigint | null {
  let total = BigInt(0);
  for (const row of rows) {
    const cents = pesosToPositiveCents(row.amount);
    if (cents === null) return null;
    total += BigInt(cents);
  }
  return total;
}

/** Returns a Spanish error, or null when the schedule is valid and sums to the goal. */
export function validateInstallments(rows: readonly InstallmentRow[], goal: string): string | null {
  const goalCents = pesosToPositiveCents(goal);
  if (goalCents === null) return "La meta debe ser un valor en pesos, solo números.";
  if (rows.length < 1 || rows.length > 60) return "El plan debe tener entre 1 y 60 cuotas.";
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dueOn)) return `Indica la fecha de la cuota ${index + 1}.`;
    if (pesosToPositiveCents(row.amount) === null)
      return `El valor de la cuota ${index + 1} debe ser en pesos, solo números.`;
    if (index > 0 && row.dueOn <= rows[index - 1]!.dueOn)
      return "Las fechas de las cuotas deben ir en orden creciente.";
  }
  const sum = sumInstallmentCents(rows);
  if (sum === null || sum !== BigInt(goalCents)) return "La suma de las cuotas debe ser igual a la meta.";
  return null;
}

/** The registrar cannot approve or reject their own abono. */
export function canDecideAbono(registeredById: string, currentUserId: string): boolean {
  return registeredById !== currentUserId;
}

export function validateReason(reason: string, min: number): string | null {
  return reason.trim().length >= min ? null : `Indica un motivo (mínimo ${min} caracteres).`;
}

export type PlanInstallment = {
  sequence: number;
  dueOn: string;
  amountCents: string;
  paidCents: string;
  status: string;
};
export type PlanView = {
  id: string;
  name: string;
  status: string;
  goalCents: string;
  paidCents: string;
  balanceCents: string;
  nextDue: { sequence: number; dueOn: string; amountCents: string } | null;
  installments: PlanInstallment[];
};

export function normalizePlan(data: unknown): PlanView | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<PlanView>;
  if (typeof raw.id !== "string") return null;
  return {
    ...(raw as PlanView),
    nextDue: raw.nextDue ?? null,
    installments: Array.isArray(raw.installments) ? raw.installments : [],
  };
}

export function apiMessage(data: unknown, fallback: string): string {
  const message = (data as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : fallback;
}

/** Customer reference typed by staff: an email (normal case) or a pasted customer UUID. */
export function customerRef(value: string): { customerEmail: string } | { customerId: string } {
  const trimmed = value.trim();
  return trimmed.includes("@") ? { customerEmail: trimmed.toLowerCase() } : { customerId: trimmed };
}
