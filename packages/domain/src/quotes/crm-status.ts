export const CRM_QUOTE_STATUSES = [
  "DRAFT",
  "REQUIRES_MANUAL_REVIEW",
  "NEW",
  "ASSIGNED",
  "PROPOSAL_SENT",
  "ACCEPTED",
  "DECLINED",
  "CLOSED",
] as const;

export type CrmQuoteStatus = (typeof CRM_QUOTE_STATUSES)[number];

/** Explicit CRM workflow. DRAFT and CLOSED intentionally have no outgoing transitions. */
export const CRM_STATUS_TRANSITIONS: Readonly<Record<CrmQuoteStatus, readonly CrmQuoteStatus[]>> = Object.freeze({
  DRAFT: [],
  REQUIRES_MANUAL_REVIEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  NEW: ["ASSIGNED", "DECLINED", "CLOSED"],
  ASSIGNED: ["PROPOSAL_SENT", "DECLINED", "CLOSED"],
  PROPOSAL_SENT: ["ACCEPTED", "DECLINED", "ASSIGNED"],
  ACCEPTED: ["CLOSED"],
  DECLINED: ["CLOSED"],
  CLOSED: [],
});

export function canTransitionCrmStatus(from: CrmQuoteStatus, to: CrmQuoteStatus): boolean {
  return CRM_STATUS_TRANSITIONS[from].includes(to);
}

export function crmTransitionError(from: CrmQuoteStatus, to: CrmQuoteStatus): string {
  return `No se puede cambiar una solicitud de ${from} a ${to}`;
}
