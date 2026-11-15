import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { applyPaymentEvent, PAYMENT_STATUSES, type PaymentStatus } from "@ricaurte/domain";
import { DbService } from "../db/db.service";
import { NotificationsService } from "../notifications/notifications.service";
import { notifyCustomer } from "../notifications/notify";
import { isLivePending, paidCentsOf, PAYABLE_STATES, paymentSelect, PENDING_TTL_MS, settleReservation } from "./ledger";
import { PAYMENT_GATEWAY } from "./gateway";
import { SandboxTestGateway, type GatewayProvider, type PaymentGateway, type ProviderEvent } from "./sandbox-gateway";
import { WompiSandboxGateway } from "./wompi-gateway";

type Db = Awaited<ReturnType<DbService["client"]>>;

// Sandbox transaction ids are our own uuids; Wompi ids look like "1234-1610641025-49201".
const eventSchema = (provider: GatewayProvider) =>
  z.object({
    event: z.literal("transaction.updated"),
    data: z.object({
      transaction: z.object({
        id: provider === "SANDBOX_TEST" ? z.uuid() : z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
        reference: z.string().min(1).max(40),
        amount_in_cents: z.number().int().positive(),
        currency: z.string().length(3),
        status: z.enum(PAYMENT_STATUSES),
      }),
    }),
    environment: z.string().max(20).optional(),
    signature: z.object({ properties: z.array(z.string().max(80)).max(10), checksum: z.string().max(128) }),
    timestamp: z.number().int().positive(),
    sent_at: z.string().max(40).optional(),
  });

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const isUnique = (error: unknown) => record(error).code === "P2002";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  adapterEnabled(): boolean {
    return this.gateway.enabled();
  }
  checkoutUrl(reference: string): string {
    return this.gateway.checkoutUrl(reference);
  }

  // ---------- Customer: payment intent ----------

  async createIntent(userId: string, reservationId: string, amountCents: bigint, idempotencyKey: string) {
    if (!this.gateway.enabled()) throw new ServiceUnavailableException("Los pagos en línea no están habilitados");
    const client = await this.db.client();
    const owned = await client.reservation.findFirst({
      where: { id: reservationId, customer: { userId, deletedAt: null } },
      select: { id: true, customerId: true },
    });
    if (!owned) throw new NotFoundException();

    const replay = await this.byIdempotencyKey(client, idempotencyKey, owned.id);
    if (replay) return { created: false, ...replay };

    try {
      const created = await client.$transaction(async (tx) => {
        // Serialise intents per reservation: balance and "one live pending payment" are checked under the lock.
        await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${owned.id}::uuid FOR UPDATE`;
        const r = await tx.reservation.findUniqueOrThrow({
          where: { id: owned.id },
          select: {
            status: true,
            totalCents: true,
            currency: true,
            payments: { where: { status: "PENDING" }, select: paymentSelect },
          },
        });
        if (!(PAYABLE_STATES as readonly string[]).includes(r.status))
          throw new ConflictException("La reserva no admite pagos en su estado actual");
        if (r.payments.some((p) => isLivePending(p))) throw new ConflictException("Ya tienes un pago en verificación");
        const paid = await paidCentsOf(tx, owned.id);
        const balance = r.totalCents - paid;
        if (amountCents < 1n || amountCents > balance)
          throw new ConflictException("El valor debe estar entre 1 y el saldo pendiente");
        const now = new Date();
        const payment = await tx.payment.create({
          data: {
            reference: `TEST-${randomBytes(8).toString("hex").toUpperCase()}`,
            customerId: owned.customerId,
            reservationId: owned.id,
            provider: this.gateway.provider,
            idempotencyKey,
            amountCents,
            currency: r.currency,
            expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
          },
          select: { reference: true, amountCents: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "payment.intent_created",
            entity: "reservation",
            entityId: owned.id,
            after: {
              reference: payment.reference,
              amountCents: payment.amountCents.toString(),
              provider: this.gateway.provider,
            },
          },
        });
        return payment;
      });
      return { created: true, ...this.intentView(created) };
    } catch (error) {
      if (!isUnique(error)) throw error;
      const raced = await this.byIdempotencyKey(client, idempotencyKey, owned.id);
      if (!raced) throw error;
      return { created: false, ...raced };
    }
  }

  private async byIdempotencyKey(client: Db, idempotencyKey: string, reservationId: string) {
    const row = await client.payment.findUnique({
      where: { idempotencyKey },
      select: { reference: true, amountCents: true, status: true, reservationId: true },
    });
    if (!row) return null;
    // A key reused for another reservation is a client bug or probing; never reveal the other payment.
    if (row.reservationId !== reservationId) throw new ConflictException("Clave de idempotencia ya usada");
    return this.intentView(row);
  }

  private intentView(row: { reference: string; amountCents: bigint; status: string }) {
    return {
      reference: row.reference,
      amountCents: row.amountCents.toString(),
      status: row.status,
      checkoutUrl: this.checkoutUrl(row.reference),
    };
  }

  // ---------- Sandbox checkout (simulated provider page) ----------

  private sandboxGateway(): SandboxTestGateway {
    if (!(this.gateway instanceof SandboxTestGateway) || !this.gateway.enabled()) throw new NotFoundException();
    return this.gateway;
  }

  private async ownedSandboxPayment(client: Db, userId: string, reference: string) {
    this.sandboxGateway();
    const row = await client.payment.findFirst({
      where: { reference, provider: "SANDBOX_TEST", customer: { userId, deletedAt: null } },
      select: {
        id: true,
        reference: true,
        amountCents: true,
        currency: true,
        status: true,
        reservationId: true,
        expiresAt: true,
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  async sandboxView(userId: string, reference: string) {
    const client = await this.db.client();
    const row = await this.ownedSandboxPayment(client, userId, reference);
    return {
      reference: row.reference,
      amountCents: row.amountCents.toString(),
      currency: row.currency,
      status: row.status,
      reservationId: row.reservationId,
    };
  }

  async sandboxDecide(userId: string, reference: string, outcome: "APPROVED" | "DECLINED") {
    const client = await this.db.client();
    const row = await this.ownedSandboxPayment(client, userId, reference);
    let tx = await client.sandboxTestTransaction.findUnique({ where: { paymentReference: reference } });
    // Already settled (double click, replay): report the outcome, never re-deliver.
    if (row.status !== "PENDING") {
      if (tx && tx.status !== outcome) throw new ConflictException("La transacción de prueba ya tiene otro resultado");
      if (!tx) throw new ConflictException("El pago ya no está pendiente");
      return { status: row.status, reservationId: row.reservationId };
    }
    if (row.expiresAt && row.expiresAt <= new Date()) throw new ConflictException("El pago venció; inicia uno nuevo");
    if (outcome === "APPROVED") await this.assertStillPayable(client, row.reservationId, row.amountCents);
    if (!tx) {
      try {
        tx = await client.sandboxTestTransaction.create({
          data: { paymentReference: reference, amountCents: row.amountCents, currency: row.currency, status: outcome },
        });
      } catch (error) {
        if (!isUnique(error)) throw error;
        tx = await client.sandboxTestTransaction.findUniqueOrThrow({ where: { paymentReference: reference } });
      }
    }
    if (tx.status !== outcome) throw new ConflictException("La transacción de prueba ya tiene otro resultado");
    // Delivered through the same verified pipeline a real provider event uses.
    await this.handleEvent(
      this.sandboxGateway().signedEvent({ ...tx, reference: tx.paymentReference }),
      "SANDBOX_TEST",
    );
    const after = await client.payment.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } });
    return { status: after.status, reservationId: row.reservationId };
  }

  /** The simulated provider refuses to capture money the reservation can no longer take. */
  private async assertStillPayable(client: Db, reservationId: string | null, amountCents: bigint) {
    if (!reservationId) return;
    const r = await client.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { status: true, totalCents: true },
    });
    if (!(PAYABLE_STATES as readonly string[]).includes(r.status))
      throw new ConflictException("La reserva ya no admite pagos");
    if (amountCents > r.totalCents - (await paidCentsOf(client, reservationId)))
      throw new ConflictException("El valor supera el saldo pendiente");
  }

  // ---------- Wompi sandbox checkout hop ----------

  /**
   * Target of the same-origin checkout URL: rebuilds the signed Web Checkout URL from the stored payment (amount,
   * currency, expiry), or sends the customer back to the reservation when the payment can no longer be paid.
   */
  async wompiCheckoutTarget(userId: string, reference: string): Promise<string> {
    const gateway = this.gateway;
    if (!(gateway instanceof WompiSandboxGateway) || !gateway.enabled()) throw new NotFoundException();
    const client = await this.db.client();
    const row = await client.payment.findFirst({
      where: { reference, provider: "WOMPI", customer: { userId, deletedAt: null } },
      select: {
        reference: true,
        amountCents: true,
        currency: true,
        status: true,
        reservationId: true,
        expiresAt: true,
      },
    });
    if (!row?.reservationId) throw new NotFoundException();
    const back = gateway.returnUrl(row.reservationId);
    if (row.status !== "PENDING" || (row.expiresAt && row.expiresAt <= new Date())) return back;
    try {
      await this.assertStillPayable(client, row.reservationId, row.amountCents);
    } catch (error) {
      if (error instanceof ConflictException) return back;
      throw error;
    }
    return gateway.signedCheckoutUrl({ ...row, reservationId: row.reservationId });
  }

  // ---------- Provider events ----------

  /** `route` is the provider whose webhook URL was called; any other adapter answers 404. */
  async handleEvent(raw: unknown, route: GatewayProvider = "SANDBOX_TEST"): Promise<WebhookOutcome> {
    const provider = this.gateway.provider;
    if (!this.gateway.enabled() || provider !== route) throw new NotFoundException();
    const parsed = eventSchema(provider).safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const event = parsed.data as ProviderEvent;
    const t = event.data.transaction;
    const client = await this.db.client();
    // The checksum covers the raw body: the provider may sign fields the schema strips.
    const valid = this.gateway.verify(raw as ProviderEvent);
    const base = {
      provider,
      eventType: event.event,
      providerTransactionId: t.id,
      reportedStatus: t.status,
      checksumValid: valid,
      payloadSha256: sha256(JSON.stringify(event)),
      // Minimised: only the transaction fields, never payer data.
      payload: { transaction: t, environment: event.environment ?? null, timestamp: event.timestamp },
      providerSentAt: event.sent_at && !Number.isNaN(Date.parse(event.sent_at)) ? new Date(event.sent_at) : null,
    };
    if (!valid) {
      // Stored under a unique id so a forged event can never pre-empt the genuine one's idempotency slot.
      await client.paymentWebhookEvent.create({
        data: { ...base, providerEventId: `invalid:${randomBytes(12).toString("hex")}` },
      });
      throw new UnauthorizedException();
    }

    const providerEventId = `${t.id}:${t.status}:${event.timestamp}`;
    let stored: { id: string };
    try {
      stored = await client.paymentWebhookEvent.create({ data: { ...base, providerEventId }, select: { id: true } });
    } catch (error) {
      if (!isUnique(error)) throw error;
      // Idempotency is on completion: a retry of an event whose processing failed midway is processed again.
      const previous = await client.paymentWebhookEvent.findUnique({
        where: { provider_providerEventId: { provider, providerEventId } },
        select: { id: true, processedAt: true },
      });
      if (!previous || previous.processedAt) return "duplicate";
      stored = { id: previous.id };
    }
    const fail = async (reason: string): Promise<WebhookOutcome> => {
      await client.paymentWebhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date(), processingError: reason },
      });
      return "ignored";
    };

    // Never trust the event body for money: look the transaction up at the provider.
    const looked = await this.gateway.lookup(t.id, client);
    if (!looked) return fail("TRANSACTION_NOT_FOUND");
    if (
      looked.reference !== t.reference ||
      looked.status !== t.status ||
      looked.amountCents !== BigInt(t.amount_in_cents) ||
      looked.currency !== t.currency
    )
      return fail("EVENT_LOOKUP_MISMATCH");
    const payment = await client.payment.findUnique({
      where: { reference: looked.reference },
      select: {
        id: true,
        reference: true,
        amountCents: true,
        currency: true,
        status: true,
        customerId: true,
        reservationId: true,
        provider: true,
      },
    });
    if (!payment || payment.provider !== provider) return fail("PAYMENT_NOT_FOUND");
    await client.paymentWebhookEvent.update({ where: { id: stored.id }, data: { paymentId: payment.id } });

    const result = applyPaymentEvent(
      {
        reference: payment.reference,
        amountCents: Number(payment.amountCents),
        currency: payment.currency as "COP",
        status: payment.status,
        processedEventIds: [],
      },
      {
        eventId: stored.id,
        status: looked.status as PaymentStatus,
        amountCents: Number(looked.amountCents),
        currency: looked.currency,
        reference: looked.reference,
      },
      { role: "SYSTEM" },
    );
    if (!result.ok) return fail(result.error);
    if (!result.changed) {
      await client.paymentWebhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } });
      return "processed";
    }

    await client.$transaction(async (tx) => {
      // Lock the reservation before touching money, so a concurrent manual approval (which takes the same lock)
      // always sees this payment's ledger entry and cannot approve against a stale balance.
      if (payment.reservationId)
        await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${payment.reservationId}::uuid FOR UPDATE`;
      const now = new Date();
      const next = result.payment.status;
      // Re-check under the lock: a manual abono approved while this event waited may have covered the balance. The
      // provider already captured the money, so the payment is still recorded truthfully, but an overpayment is
      // flagged for manual refund/reconciliation instead of passing silently. (Non-payable reservations are already
      // held by settleReservation → payment.settlement_review.)
      let review: { reason: string; balanceCents: string } | null = null;
      if (result.effect === "APPROVED" && payment.reservationId) {
        const r = await tx.reservation.findUniqueOrThrow({
          where: { id: payment.reservationId },
          select: { totalCents: true },
        });
        const balance = r.totalCents - (await paidCentsOf(tx, payment.reservationId));
        if (payment.amountCents > balance) review = { reason: "OVERPAYMENT", balanceCents: balance.toString() };
      }
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: {
          status: next,
          verifiedAt: now,
          providerTransactionId: looked.id,
          ...(next === "APPROVED" ? { approvedAt: now } : {}),
        },
      });
      if (updated.count !== 1) {
        // A concurrent delivery already applied it; the conditional update kept the ledger single.
        await tx.paymentWebhookEvent.update({ where: { id: stored.id }, data: { processedAt: now } });
        return;
      }
      if (result.effect === "APPROVED" || result.effect === "VOIDED") {
        await tx.ledgerEntry.create({
          data: {
            kind: result.effect === "APPROVED" ? "PAYMENT_APPROVED" : "PAYMENT_VOIDED",
            amountCents: result.effect === "APPROVED" ? payment.amountCents : -payment.amountCents,
            currency: payment.currency,
            customerId: payment.customerId,
            reservationId: payment.reservationId,
            paymentId: payment.id,
            description: `Pago ${payment.reference} (entorno de prueba)`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: `payment.${next.toLowerCase()}`,
          entity: "payment",
          entityId: payment.id,
          before: { status: payment.status },
          after: { status: next, amountCents: payment.amountCents.toString(), provider },
        },
      });
      if (review)
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "payment.requires_manual_review",
            entity: "payment",
            entityId: payment.id,
            details: { ...review, amountCents: payment.amountCents.toString(), reservationId: payment.reservationId },
          },
        });
      if (result.effect === "APPROVED")
        await notifyCustomer(
          this.notifications,
          tx,
          payment.customerId,
          "payment.approved",
          {
            reference: payment.reference,
            amountCents: payment.amountCents.toString(),
            currency: payment.currency,
            resourceId: payment.reservationId,
          },
          `payment.approved:${payment.id}`,
        );
      if (result.effect === "APPROVED" && payment.reservationId)
        await settleReservation(tx, payment.reservationId, { paymentId: payment.id }, now, {
          role: "SYSTEM",
          id: null,
        });
      await tx.paymentWebhookEvent.update({ where: { id: stored.id }, data: { processedAt: now } });
    });
    return "processed";
  }
}
