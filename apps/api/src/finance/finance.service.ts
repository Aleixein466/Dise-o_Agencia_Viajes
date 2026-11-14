import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { DbService } from "../db/db.service";
import { NotificationsService } from "../notifications/notifications.service";
import { notifyCustomer } from "../notifications/notify";
import { PAYABLE_STATES, settleReservation } from "../payments/ledger";
import { readReceipt, removeReceipt, storeReceipt, validateReceipt } from "./receipt-storage";
import { allocateInstallments, validateSchedule } from "./savings";

type Db = Awaited<ReturnType<DbService["client"]>>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
export type Target = { reservationId?: string; savingsPlanId?: string };
export type AbonoInput = Target & {
  amountCents: bigint;
  method: "BANK_TRANSFER" | "CASH";
  bankReference?: string;
  paidAt: string;
};

const person = { select: { id: true, name: true } } as const;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const isUnique = (error: unknown) => record(error).code === "P2002";
const isCheckViolation = (error: unknown) => /manual_abonos_four_eyes/.test(String(record(error).message ?? ""));
const day = (value: Date) => value.toISOString().slice(0, 10);

/** Balance owed on a target, computed under the caller's lock from the append-only ledger. */
async function targetState(client: Db | Tx, target: Target) {
  if (target.reservationId) {
    const r = await client.reservation.findUnique({
      where: { id: target.reservationId },
      select: { id: true, code: true, status: true, totalCents: true, customerId: true, currency: true },
    });
    if (!r) throw new NotFoundException("Reserva no encontrada");
    const sum = await client.ledgerEntry.aggregate({ where: { reservationId: r.id }, _sum: { amountCents: true } });
    const paid = sum._sum.amountCents ?? 0n;
    return {
      kind: "reservation" as const,
      id: r.id,
      code: r.code,
      customerId: r.customerId,
      currency: r.currency,
      payable: (PAYABLE_STATES as readonly string[]).includes(r.status),
      paid,
      balance: r.totalCents - paid,
    };
  }
  const plan = await client.savingsPlan.findUnique({
    where: { id: target.savingsPlanId! },
    select: { id: true, name: true, status: true, goalCents: true, customerId: true, currency: true },
  });
  if (!plan) throw new NotFoundException("Plan de ahorro no encontrado");
  const sum = await client.ledgerEntry.aggregate({ where: { savingsPlanId: plan.id }, _sum: { amountCents: true } });
  const paid = sum._sum.amountCents ?? 0n;
  return {
    kind: "savings" as const,
    id: plan.id,
    code: plan.name ?? "Plan de ahorro",
    customerId: plan.customerId,
    currency: plan.currency,
    payable: plan.status === "ACTIVE",
    paid,
    balance: (plan.goalCents ?? 0n) - paid,
  };
}

async function lockTarget(tx: Tx, target: Target) {
  if (target.reservationId)
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${target.reservationId}::uuid FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM savings_plans WHERE id = ${target.savingsPlanId}::uuid FOR UPDATE`;
}

function exactlyOne(target: Target) {
  if (Boolean(target.reservationId) === Boolean(target.savingsPlanId))
    throw new BadRequestException("Indica una reserva o un plan de ahorro (solo uno)");
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  // ---------- Manual abonos ----------

  async registerAbono(actorId: string, input: AbonoInput, raw: Buffer) {
    exactlyOne(input);
    if (input.amountCents <= 0n) throw new BadRequestException("El valor debe ser mayor que cero");
    const bankReference = input.bankReference?.trim() || null;
    if (input.method === "BANK_TRANSFER" && !bankReference)
      throw new BadRequestException("La transferencia requiere referencia bancaria");
    if (input.paidAt > day(new Date())) throw new BadRequestException("La fecha del pago no puede ser futura");
    const receipt = await validateReceipt(raw);

    const client = await this.db.client();
    const target = await targetState(client, input);
    if (!target.payable) throw new ConflictException("El destino no admite abonos en su estado actual");
    if (input.amountCents > target.balance) throw new ConflictException("El valor supera el saldo pendiente");
    const duplicateReceipt = await client.manualAbono.findFirst({
      where: { status: { not: "REJECTED" }, receiptSha256: receipt.sha256 },
      select: { id: true },
    });
    if (duplicateReceipt) throw new ConflictException("Este comprobante ya fue registrado");

    const objectKey = await storeReceipt(receipt);
    try {
      return await client.$transaction(async (tx) => {
        const asset = await tx.mediaAsset.create({
          data: {
            objectKey,
            altText: "Comprobante de abono",
            mimeType: receipt.mimeType,
            visibility: "PRIVATE",
            sizeBytes: receipt.data.length,
            sha256: receipt.sha256,
            width: receipt.width,
            height: receipt.height,
            uploadedById: actorId,
          },
          select: { id: true },
        });
        const abono = await tx.manualAbono.create({
          data: {
            customerId: target.customerId,
            reservationId: input.reservationId ?? null,
            savingsPlanId: input.savingsPlanId ?? null,
            amountCents: input.amountCents,
            currency: target.currency,
            method: input.method,
            bankReference,
            paidAt: new Date(`${input.paidAt}T12:00:00.000Z`),
            receiptMediaId: asset.id,
            receiptSha256: receipt.sha256,
            registeredById: actorId,
          },
          select: { id: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "finance.abono_registered",
            entity: "manual_abono",
            entityId: abono.id,
            after: {
              amountCents: input.amountCents.toString(),
              method: input.method,
              target: target.kind,
              targetId: target.id,
            },
          },
        });
        return abono;
      });
    } catch (error) {
      await removeReceipt(objectKey);
      if (isUnique(error))
        throw new ConflictException(
          /receipt_sha256/.test(String(record(error).message ?? "")) ||
            /receipt_sha256/.test(JSON.stringify(record(error).meta ?? {}))
            ? "Este comprobante ya fue registrado"
            : "Esta referencia bancaria ya fue registrada para ese método",
        );
      throw error;
    }
  }

  async listAbonos(status: "SUBMITTED" | "APPROVED" | "REJECTED" | undefined, page: number, showContact: boolean) {
    const client = await this.db.client();
    const where = status ? { status } : {};
    const pageSize = 20;
    const [rows, total] = await Promise.all([
      client.manualAbono.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          amountCents: true,
          method: true,
          bankReference: true,
          paidAt: true,
          rejectionReason: true,
          createdAt: true,
          reservation: { select: { id: true, code: true } },
          savingsPlan: { select: { id: true, name: true } },
          customer: { select: { name: true } },
          registeredBy: person,
          approvedBy: person,
        },
      }),
      client.manualAbono.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        amountCents: row.amountCents.toString(),
        method: row.method,
        bankReference: row.bankReference,
        paidAt: day(row.paidAt),
        target: row.reservation
          ? { type: "RESERVATION", id: row.reservation.id, code: row.reservation.code }
          : { type: "SAVINGS_PLAN", id: row.savingsPlan?.id ?? null, code: row.savingsPlan?.name ?? "Plan de ahorro" },
        customerName: showContact ? row.customer.name : null,
        registeredBy: row.registeredBy,
        approvedBy: row.approvedBy,
        rejectionReason: row.rejectionReason,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async receipt(id: string) {
    const client = await this.db.client();
    const row = await client.manualAbono.findUnique({
      where: { id },
      select: { receipt: { select: { objectKey: true, mimeType: true, visibility: true, deletedAt: true } } },
    });
    if (!row || row.receipt.visibility !== "PRIVATE" || row.receipt.deletedAt) throw new NotFoundException();
    return { data: await readReceipt(row.receipt.objectKey), mimeType: row.receipt.mimeType };
  }

  /** Four-eyes approval: the approver must differ from the registrar (also enforced by a DB CHECK). */
  async approveAbono(actorId: string, id: string) {
    const client = await this.db.client();
    const abono = await client.manualAbono.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        registeredById: true,
        amountCents: true,
        currency: true,
        method: true,
        customerId: true,
        reservationId: true,
        savingsPlanId: true,
      },
    });
    if (!abono) throw new NotFoundException();
    if (abono.registeredById === actorId)
      throw new ForbiddenException("Otra persona de Finanzas debe aprobar este abono");
    if (abono.status !== "SUBMITTED") throw new ConflictException("El abono ya fue procesado");
    const target: Target = abono.reservationId
      ? { reservationId: abono.reservationId }
      : { savingsPlanId: abono.savingsPlanId! };
    try {
      await client.$transaction(async (tx) => {
        await lockTarget(tx, target);
        const state = await targetState(tx, target);
        if (!state.payable) throw new ConflictException("El destino ya no admite abonos");
        if (abono.amountCents > state.balance) throw new ConflictException("El abono supera el saldo pendiente actual");
        const now = new Date();
        const claimed = await tx.manualAbono.updateMany({
          where: { id, status: "SUBMITTED" },
          data: { status: "APPROVED", approvedById: actorId, approvedAt: now },
        });
        if (claimed.count !== 1) throw new ConflictException("El abono ya fue procesado");
        const payment = await tx.payment.create({
          data: {
            reference: `MAN-${randomBytes(8).toString("hex").toUpperCase()}`,
            customerId: abono.customerId,
            reservationId: abono.reservationId,
            savingsPlanId: abono.savingsPlanId,
            provider: "MANUAL",
            method: abono.method,
            idempotencyKey: `manual-abono:${abono.id}`,
            amountCents: abono.amountCents,
            currency: abono.currency,
            status: "APPROVED",
            verifiedAt: now,
            approvedAt: now,
          },
          select: { id: true, reference: true },
        });
        await tx.manualAbono.update({ where: { id }, data: { paymentId: payment.id } });
        await tx.ledgerEntry.create({
          data: {
            kind: "MANUAL_ABONO",
            amountCents: abono.amountCents,
            currency: abono.currency,
            customerId: abono.customerId,
            reservationId: abono.reservationId,
            savingsPlanId: abono.savingsPlanId,
            paymentId: payment.id,
            manualAbonoId: abono.id,
            createdById: actorId,
            description: `Abono manual (${abono.method === "CASH" ? "efectivo" : "transferencia"})`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "finance.abono_approved",
            entity: "manual_abono",
            entityId: abono.id,
            before: { status: "SUBMITTED" },
            after: { status: "APPROVED", paymentId: payment.id, amountCents: abono.amountCents.toString() },
          },
        });
        await notifyCustomer(
          this.notifications,
          tx,
          abono.customerId,
          "payment.approved",
          {
            reference: payment.reference,
            amountCents: abono.amountCents.toString(),
            currency: abono.currency,
            resourceId: abono.reservationId,
          },
          `payment.approved:${payment.id}`,
        );
        if (abono.reservationId)
          await settleReservation(tx, abono.reservationId, { manualAbonoId: abono.id, paymentId: payment.id }, now, {
            role: "FINANCE",
            id: actorId,
          });
        else await this.completeIfFunded(tx, abono.savingsPlanId!, actorId, now);
      });
    } catch (error) {
      if (isUnique(error) || isCheckViolation(error)) throw new ConflictException("El abono ya fue procesado");
      throw error;
    }
    return this.abonoStatus(id);
  }

  async rejectAbono(actorId: string, id: string, reason: string) {
    const client = await this.db.client();
    const abono = await client.manualAbono.findUnique({
      where: { id },
      select: { registeredById: true, status: true },
    });
    if (!abono) throw new NotFoundException();
    if (abono.registeredById === actorId)
      throw new ForbiddenException("Otra persona de Finanzas debe revisar este abono");
    await client.$transaction(async (tx) => {
      const claimed = await tx.manualAbono.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "REJECTED", approvedById: actorId, approvedAt: new Date(), rejectionReason: reason },
      });
      if (claimed.count !== 1) throw new ConflictException("El abono ya fue procesado");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "finance.abono_rejected",
          entity: "manual_abono",
          entityId: id,
          before: { status: "SUBMITTED" },
          after: { status: "REJECTED" },
        },
      });
    });
    return this.abonoStatus(id);
  }

  private async abonoStatus(id: string) {
    const client = await this.db.client();
    return client.manualAbono.findUniqueOrThrow({ where: { id }, select: { id: true, status: true } });
  }

  // ---------- Adjustments ----------

  async adjust(actorId: string, target: Target, amountCents: bigint, reason: string) {
    exactlyOne(target);
    if (amountCents === 0n) throw new BadRequestException("El ajuste no puede ser cero");
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      await lockTarget(tx, target);
      const state = await targetState(tx, target);
      if (state.kind === "savings" && !state.payable)
        throw new ConflictException("Solo se pueden ajustar planes de ahorro activos");
      if (state.paid + amountCents < 0n) throw new ConflictException("El ajuste dejaría el pagado por debajo de cero");
      // Credits only on payable targets and never beyond the outstanding balance; refunds/overpayments are
      // reconciled outside this flow. Debits (corrections) stay allowed down to zero.
      if (amountCents > 0n && state.kind === "reservation" && !state.payable)
        throw new ConflictException("La reserva no admite abonos; registra la conciliación por fuera");
      if (amountCents > 0n && amountCents > state.balance)
        throw new ConflictException("El ajuste supera el saldo pendiente");
      const entry = await tx.ledgerEntry.create({
        data: {
          kind: "ADJUSTMENT",
          amountCents,
          currency: state.currency,
          customerId: state.customerId,
          reservationId: target.reservationId ?? null,
          savingsPlanId: target.savingsPlanId ?? null,
          createdById: actorId,
          description: reason,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "finance.adjustment",
          entity: state.kind === "reservation" ? "reservation" : "savings_plan",
          entityId: state.id,
          after: { ledgerEntryId: entry.id, amountCents: amountCents.toString() },
        },
      });
      if (target.savingsPlanId && amountCents > 0n)
        await this.completeIfFunded(tx, target.savingsPlanId, actorId, new Date());
      return { id: entry.id, paidCents: (state.paid + amountCents).toString() };
    });
  }

  // ---------- Lookups by visible identifiers (staff types codes/emails, never raw UUIDs) ----------

  async reservationIdByCode(code: string): Promise<string> {
    const client = await this.db.client();
    const row = await client.reservation.findUnique({ where: { code }, select: { id: true } });
    if (!row) throw new NotFoundException("No existe una reserva con ese código");
    return row.id;
  }

  /** Public requests may create several customer rows per email; the one linked to a portal account wins. */
  async customerIdByEmail(emailInput: string): Promise<string> {
    const client = await this.db.client();
    const rows = await client.customer.findMany({
      where: { email: emailInput.trim().toLowerCase() },
      select: { id: true, userId: true },
      take: 50,
    });
    const linked = rows.filter((row) => row.userId);
    const pick = linked.length === 1 ? linked[0] : linked.length === 0 && rows.length === 1 ? rows[0] : null;
    if (!rows.length) throw new NotFoundException("No existe un cliente con ese correo");
    if (!pick) throw new ConflictException("Hay varios clientes con ese correo; usa el ID del cliente");
    return pick.id;
  }

  async ledger(target: Target) {
    exactlyOne(target);
    const client = await this.db.client();
    const state = await targetState(client, target);
    const rows = await client.ledgerEntry.findMany({
      where: target.reservationId ? { reservationId: target.reservationId } : { savingsPlanId: target.savingsPlanId },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, amountCents: true, description: true, createdAt: true, createdBy: person },
    });
    return {
      entries: rows.map((row) => ({ ...row, amountCents: row.amountCents.toString() })),
      paidCents: state.paid.toString(),
      balanceCents: (state.balance > 0n ? state.balance : 0n).toString(),
    };
  }

  // ---------- Savings plans ----------

  async createPlan(
    actorId: string,
    input: {
      customerId: string;
      name: string;
      goalCents: bigint;
      reservationId?: string;
      packageId?: string;
      installments: Array<{ dueOn: string; amountCents: bigint }>;
    },
  ) {
    const problem = validateSchedule(input.installments, input.goalCents, new Date());
    if (problem) throw new BadRequestException(problem);
    const client = await this.db.client();
    const customer = await client.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");
    if (input.reservationId) {
      const owned = await client.reservation.findFirst({
        where: { id: input.reservationId, customerId: customer.id },
        select: { id: true },
      });
      if (!owned) throw new BadRequestException("La reserva no pertenece a ese cliente");
    }
    const plan = await client.$transaction(async (tx) => {
      const created = await tx.savingsPlan.create({
        data: {
          customerId: customer.id,
          name: input.name,
          goalCents: input.goalCents,
          reservationId: input.reservationId ?? null,
          packageId: input.packageId ?? null,
          targetDate: new Date(`${input.installments[input.installments.length - 1].dueOn}T00:00:00.000Z`),
          createdById: actorId,
          installments: {
            create: input.installments.map((row, index) => ({
              sequence: index + 1,
              dueOn: new Date(`${row.dueOn}T00:00:00.000Z`),
              amountCents: row.amountCents,
            })),
          },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "finance.savings_plan_created",
          entity: "savings_plan",
          entityId: created.id,
          after: { goalCents: input.goalCents.toString(), installments: input.installments.length },
        },
      });
      return created;
    });
    return this.planDetail({ id: plan.id });
  }

  async cancelPlan(actorId: string, id: string, reason: string) {
    const client = await this.db.client();
    await client.$transaction(async (tx) => {
      const changed = await tx.savingsPlan.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
      });
      if (changed.count !== 1) throw new ConflictException("Solo se cancelan planes activos");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "finance.savings_plan_cancelled",
          entity: "savings_plan",
          entityId: id,
          after: { status: "CANCELLED" },
        },
      });
    });
    return this.planDetail({ id });
  }

  async listPlans(customerId?: string) {
    const client = await this.db.client();
    const rows = await client.savingsPlan.findMany({
      where: customerId ? { customerId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true },
    });
    return Promise.all(rows.map((row) => this.planDetail({ id: row.id })));
  }

  async customerPlans(userId: string) {
    const client = await this.db.client();
    const rows = await client.savingsPlan.findMany({
      where: { customer: { userId, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true },
    });
    return Promise.all(rows.map((row) => this.planDetail({ id: row.id })));
  }

  /** `userId` scopes the lookup to the owning customer; a foreign plan answers 404. */
  async planDetail(where: { id: string; userId?: string }) {
    const client = await this.db.client();
    const plan = await client.savingsPlan.findFirst({
      where: { id: where.id, ...(where.userId ? { customer: { userId: where.userId, deletedAt: null } } : {}) },
      select: {
        id: true,
        name: true,
        status: true,
        goalCents: true,
        currency: true,
        targetDate: true,
        cancellationReason: true,
        createdAt: true,
        reservation: { select: { id: true, code: true } },
        installments: { orderBy: { sequence: "asc" }, select: { sequence: true, dueOn: true, amountCents: true } },
      },
    });
    if (!plan) throw new NotFoundException();
    const sum = await client.ledgerEntry.aggregate({ where: { savingsPlanId: plan.id }, _sum: { amountCents: true } });
    const paid = sum._sum.amountCents ?? 0n;
    const goal = plan.goalCents ?? 0n;
    const schedule = allocateInstallments(plan.installments, paid, new Date());
    return {
      id: plan.id,
      name: plan.name,
      status: plan.status,
      goalCents: goal.toString(),
      paidCents: paid.toString(),
      balanceCents: (goal > paid ? goal - paid : 0n).toString(),
      currency: plan.currency,
      targetDate: plan.targetDate ? day(plan.targetDate) : null,
      reservation: plan.reservation,
      cancellationReason: plan.cancellationReason,
      createdAt: plan.createdAt,
      ...(plan.status === "ACTIVE" ? schedule : { installments: schedule.installments, nextDue: null }),
    };
  }

  private async completeIfFunded(tx: Tx, planId: string, actorId: string, now: Date) {
    const plan = await tx.savingsPlan.findUniqueOrThrow({
      where: { id: planId },
      select: { goalCents: true, status: true },
    });
    const sum = await tx.ledgerEntry.aggregate({ where: { savingsPlanId: planId }, _sum: { amountCents: true } });
    if (plan.status !== "ACTIVE" || (sum._sum.amountCents ?? 0n) < (plan.goalCents ?? 0n)) return;
    await tx.savingsPlan.update({ where: { id: planId }, data: { status: "COMPLETED", completedAt: now } });
    await tx.auditLog.create({
      data: { actorId, action: "finance.savings_plan_completed", entity: "savings_plan", entityId: planId },
    });
  }
}
