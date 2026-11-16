import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";
import { DbService } from "../db/db.service";
import { hashRecipient, MailAdapter } from "./mail";
import { renderNotification } from "./templates";

type Db = Awaited<ReturnType<DbService["client"]>>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 3;
/** Installments overdue by more than this are not nagged on the first scan. */
const REMINDER_GRACE_DAYS = 7;
const SECRET_KEY = /code|token|password|secret/i;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DispatchResult = { claimed: number; sent: number; retried: number; failed: number; skipped: number };

type Claimed = { id: string; kind: string; recipientEmail: string; templateData: unknown; attempts: number };

function findSecretKey(value: unknown, depth = 0): string | undefined {
  if (value === null || typeof value !== "object" || depth > 4) return undefined;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) return key;
    const nested = findSecretKey(inner, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/** Safe, bounded description of a failure: no message text, which can carry recipient or server details. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const extra = error as Error & { code?: unknown; responseCode?: unknown };
  const parts = [
    error.name,
    typeof extra.code === "string" ? extra.code : undefined,
    typeof extra.responseCode === "number" ? String(extra.responseCode) : undefined,
  ];
  return parts.filter(Boolean).join(" ").slice(0, 300);
}

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(MailAdapter) private readonly mail: MailAdapter,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  /** Idempotent by dedupeKey. Returns true when a new row was written. Safe inside a caller's transaction. */
  async enqueue(
    kind: string,
    to: string,
    data: Record<string, unknown>,
    dedupeKey: string,
    tx?: Db | Tx,
  ): Promise<boolean> {
    const secret = findSecretKey(data);
    if (secret) throw new Error(`Notification data must not contain secret-like keys (${secret})`);
    const recipientEmail = to.trim().toLowerCase();
    if (!recipientEmail.includes("@") || recipientEmail.length > 254) throw new Error("Invalid notification recipient");
    if (dedupeKey.length === 0 || dedupeKey.length > 160) throw new Error("Invalid notification dedupe key");
    const client = tx ?? (await this.db.client());
    try {
      // skipDuplicates is ON CONFLICT DO NOTHING, so a duplicate never aborts the caller's transaction.
      const result = await client.notificationOutbox.createMany({
        data: [{ kind, recipientEmail, templateData: data as never, dedupeKey }],
        skipDuplicates: true,
      });
      return result.count > 0;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return false;
      throw error;
    }
  }

  /** Claims due rows, sends them and records the outcome. Never throws because of a single bad row. */
  async dispatch(limit = 20): Promise<DispatchResult> {
    const result: DispatchResult = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    if (this.mail.enabled === false) {
      this.logger.warn("Mail adapter is disabled; notifications stay queued");
      return result;
    }
    const client = await this.db.client();
    const now = new Date();
    const rows = await client.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Claimed[]>`
        SELECT id::text AS id, kind, recipient_email AS "recipientEmail", template_data AS "templateData", attempts
        FROM notification_outbox
        WHERE status = 'PENDING'::"NotificationStatus" AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      if (due.length > 0)
        // Lease: a crash between claim and outcome makes the row due again after LEASE_MS.
        await tx.notificationOutbox.updateMany({
          where: { id: { in: due.map((row) => row.id) } },
          data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
        });
      return due;
    });
    result.claimed = rows.length;
    for (const row of rows) {
      try {
        await this.process(client, row, result);
      } catch (error) {
        this.logger.error(`Outbox bookkeeping failed kind=${row.kind} (${describeError(error)})`);
      }
    }
    return result;
  }

  private async process(client: Db, row: Claimed, result: DispatchResult): Promise<void> {
    const attempts = row.attempts + 1;
    let rendered: ReturnType<typeof renderNotification>;
    try {
      rendered = renderNotification(row.kind, row.templateData, this.env.WEB_ORIGIN);
    } catch {
      rendered = null;
    }
    if (rendered === null) {
      await client.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "SKIPPED", lastError: "unknown_kind_or_unrenderable" },
      });
      result.skipped += 1;
      return;
    }
    try {
      await this.mail.send({ to: row.recipientEmail, kind: row.kind, ...rendered });
    } catch (error) {
      const lastError = describeError(error);
      this.logger.warn(
        `Notification send failed kind=${row.kind} to=${hashRecipient(row.recipientEmail)} attempt=${attempts} (${lastError})`,
      );
      if (attempts >= MAX_ATTEMPTS) {
        await client.notificationOutbox.update({ where: { id: row.id }, data: { status: "FAILED", lastError } });
        result.failed += 1;
      } else {
        await client.notificationOutbox.update({
          where: { id: row.id },
          data: { status: "PENDING", lastError, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) },
        });
        result.retried += 1;
      }
      return;
    }
    await client.notificationOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
    result.sent += 1;
  }

  /**
   * Informational reminders for ACTIVE savings plans. Ledger money is allocated to installments in sequence
   * order; an installment fully covered gets no reminder. One reminder per (plan, sequence) via dedupeKey.
   */
  async enqueueInstallmentReminders(now = new Date()): Promise<number> {
    const client = await this.db.client();
    const upper = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);
    const lower = new Date(now.getTime() - REMINDER_GRACE_DAYS * DAY_MS);
    const plans = await client.savingsPlan.findMany({
      where: { status: "ACTIVE", installments: { some: { dueOn: { gte: lower, lte: upper } } } },
      select: {
        id: true,
        name: true,
        currency: true,
        customer: { select: { email: true, name: true } },
        installments: { orderBy: { sequence: "asc" }, select: { sequence: true, dueOn: true, amountCents: true } },
      },
    });
    if (plans.length === 0) return 0;
    const sums = await client.ledgerEntry.groupBy({
      by: ["savingsPlanId"],
      where: { savingsPlanId: { in: plans.map((plan) => plan.id) } },
      _sum: { amountCents: true },
    });
    const paidByPlan = new Map(sums.map((row) => [row.savingsPlanId, row._sum.amountCents ?? 0n]));
    let created = 0;
    for (const plan of plans) {
      let remaining = paidByPlan.get(plan.id) ?? 0n;
      if (remaining < 0n) remaining = 0n;
      for (const installment of plan.installments) {
        const covered = remaining < installment.amountCents ? remaining : installment.amountCents;
        remaining -= covered;
        const outstanding = installment.amountCents - covered;
        if (outstanding <= 0n) continue;
        if (installment.dueOn < lower || installment.dueOn > upper) continue;
        const enqueued = await this.enqueue(
          "savings.installment_reminder",
          plan.customer.email,
          {
            firstName: plan.customer.name.trim().split(/\s+/)[0] ?? "",
            planName: plan.name ?? "",
            sequence: installment.sequence,
            dueOn: installment.dueOn.toISOString().slice(0, 10),
            amountCents: outstanding.toString(),
            currency: plan.currency,
          },
          `savings.reminder:${plan.id}:${installment.sequence}`,
          client,
        );
        if (enqueued) created += 1;
      }
    }
    return created;
  }
}
