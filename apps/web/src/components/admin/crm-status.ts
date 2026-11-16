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

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Borrador interno",
  REQUIRES_MANUAL_REVIEW: "Requiere revisión manual",
  NEW: "Nueva",
  ASSIGNED: "Asignada",
  PROPOSAL_SENT: "Propuesta enviada",
  ACCEPTED: "Aceptada",
  DECLINED: "Rechazada",
  CLOSED: "Cerrada",
};

/** Mirror of packages/domain/src/quotes/crm-status.ts; the server stays the authority. */
export const NEXT_STATUSES: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: [],
  NEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  REQUIRES_MANUAL_REVIEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  ASSIGNED: ["PROPOSAL_SENT", "DECLINED", "CLOSED"],
  PROPOSAL_SENT: ["ACCEPTED", "DECLINED", "ASSIGNED"],
  ACCEPTED: ["CLOSED"],
  DECLINED: ["CLOSED"],
  CLOSED: [],
};

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function allowedNextStatuses(status: string): readonly QuoteStatus[] {
  return (NEXT_STATUSES as Record<string, readonly QuoteStatus[]>)[status] ?? [];
}

/** Statuses the UI offers in the status select: ASSIGNED from NEW/REVIEW goes through the assign action. */
export function selectableNextStatuses(status: string): QuoteStatus[] {
  const fromIntake = status === "NEW" || status === "REQUIRES_MANUAL_REVIEW";
  return allowedNextStatuses(status).filter((next) => !(fromIntake && next === "ASSIGNED"));
}

const ACTION_LABELS: Record<string, string> = {
  "crm.assigned": "Asignación",
  "crm.status_changed": "Cambio de estado",
  "crm.note_added": "Nota agregada",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
