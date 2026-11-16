import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";

const OPEN_QUOTES = ["REQUIRES_MANUAL_REVIEW", "NEW", "ASSIGNED", "PROPOSAL_SENT"] as const;
const RESERVATION_QUEUE = ["REQUEST_RECEIVED", "PENDING_VALIDATION", "PENDING_PAYMENT", "PARTIALLY_PAID"] as const;
const OPEN_PQRS = ["RECEIVED", "IN_REVIEW", "WAITING_FOR_CUSTOMER"] as const;

export type DashboardSummary = {
  quotes?: { open: number; requiresReview: number };
  reservations?: { inProgress: number; pendingValidation: number };
  payments?: { abonosToApprove: number };
  pqrs?: { open: number; overdue: number };
};

/**
 * Counts only (no PII). Each block is present only when the staff member holds the matching read permission,
 * so the dashboard never reveals figures of modules the role cannot open.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async summary(permissions: readonly string[], now = new Date()): Promise<DashboardSummary> {
    const client = await this.db.client();
    const can = (permission: string) => permissions.includes(permission);
    const out: DashboardSummary = {};
    const jobs: Promise<void>[] = [];
    if (can("quotes:read"))
      jobs.push(
        Promise.all([
          client.quote.count({ where: { status: { in: [...OPEN_QUOTES] } } }),
          client.quote.count({ where: { status: "REQUIRES_MANUAL_REVIEW" } }),
        ]).then(([open, requiresReview]) => void (out.quotes = { open, requiresReview })),
      );
    if (can("reservations:read"))
      jobs.push(
        Promise.all([
          client.reservation.count({ where: { status: { in: [...RESERVATION_QUEUE] } } }),
          client.reservation.count({ where: { status: { in: ["REQUEST_RECEIVED", "PENDING_VALIDATION"] } } }),
        ]).then(([inProgress, pendingValidation]) => void (out.reservations = { inProgress, pendingValidation })),
      );
    if (can("payments:read"))
      jobs.push(
        client.manualAbono
          .count({ where: { status: "SUBMITTED" } })
          .then((abonosToApprove) => void (out.payments = { abonosToApprove })),
      );
    if (can("pqrs:read"))
      jobs.push(
        Promise.all([
          client.pqrsTicket.count({ where: { status: { in: [...OPEN_PQRS] } } }),
          client.pqrsTicket.count({ where: { status: { in: [...OPEN_PQRS] }, resolutionDueAt: { lt: now } } }),
        ]).then(([open, overdue]) => void (out.pqrs = { open, overdue })),
      );
    await Promise.all(jobs);
    return out;
  }
}
