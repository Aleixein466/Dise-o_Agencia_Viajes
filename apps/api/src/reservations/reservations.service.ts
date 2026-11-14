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
import { transitionReservation, type ReservationEventType, type Role } from "@ricaurte/domain";
import { DbService } from "../db/db.service";
import { paidCentsOf, paymentSelect, paymentSummary } from "../payments/ledger";
import { SandboxTestGateway } from "../payments/sandbox-gateway";

export type TravelerInput = { fullName: string; category: "ADULT" | "CHILD" | "INFANT"; ageYears?: number };
export type ReservationRequest = { startsOn: string; travelers: TravelerInput[]; notes?: string };
export type ReservationActor = { id: string; role: Role };
type Db = Awaited<ReturnType<DbService["client"]>>;

// Explicit selects only: never return full User rows (password hashes, MFA data) or raw relations.
const person = { select: { id: true, name: true } } as const;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const conditionsOf = (snapshot: unknown) => {
  const c = record(record(snapshot).conditions);
  return { inclusions: strings(c.inclusions), exclusions: strings(c.exclusions) };
};
const PG_UNIQUE = "P2002";
const isUnique = (error: unknown) => record(error).code === PG_UNIQUE;
const day = 24 * 60 * 60 * 1000;

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Optional() @Inject(SandboxTestGateway) private readonly gateway?: SandboxTestGateway,
  ) {}

  // ---------- Customer portal (ownership: customer.userId === principal) ----------

  private async ownedQuote(client: Db, userId: string, id: string) {
    const quote = await client.quote.findFirst({
      where: { id, customer: { userId, deletedAt: null } },
      select: {
        id: true,
        reference: true,
        status: true,
        revision: true,
        travelDate: true,
        adults: true,
        children: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        customerId: true,
        destinationId: true,
        packageId: true,
        departureId: true,
        transportOptionId: true,
        pricingVersion: true,
        priceSnapshot: true,
        reviewReasons: true,
        destination: true,
        catalogDestination: { select: { name: true } },
        package: { select: { title: true, durationDays: true, includes: true, excludes: true } },
        reservation: { select: { id: true, code: true, status: true } },
        lines: {
          orderBy: { lineNo: "asc" },
          select: { description: true, quantity: true, unitPriceCents: true, totalCents: true },
        },
      },
    });
    if (!quote) throw new NotFoundException();
    return quote;
  }

  private quoteSummary(q: {
    id: string;
    reference: string;
    status: string;
    travelDate: Date | null;
    adults: number | null;
    children: number | null;
    totalCents: bigint | null;
    currency: string;
    createdAt: Date;
    destination: string | null;
    catalogDestination: { name: string } | null;
    package: { title: string } | null;
    reservation: { id: string; code: string; status: string } | null;
  }) {
    return {
      id: q.id,
      reference: q.reference,
      status: q.status,
      packageName: q.package?.title ?? null,
      destinationName: q.catalogDestination?.name ?? q.destination ?? null,
      travelDate: q.travelDate?.toISOString().slice(0, 10) ?? null,
      adults: q.adults ?? 0,
      children: q.children ?? 0,
      totalCents: q.totalCents?.toString() ?? null,
      currency: q.currency,
      createdAt: q.createdAt,
      reservation: q.reservation,
    };
  }

  async customerQuotes(userId: string) {
    const client = await this.db.client();
    const rows = await client.quote.findMany({
      where: { customer: { userId, deletedAt: null }, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        reference: true,
        status: true,
        travelDate: true,
        adults: true,
        children: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        destination: true,
        catalogDestination: { select: { name: true } },
        package: { select: { title: true } },
        reservation: { select: { id: true, code: true, status: true } },
      },
    });
    return rows.map((row) => this.quoteSummary(row));
  }

  async customerQuote(userId: string, id: string) {
    const client = await this.db.client();
    const q = await this.ownedQuote(client, userId, id);
    const selection = record(record(q.priceSnapshot).selection);
    const [hotel, room] = await Promise.all([
      typeof selection.hotelId === "string"
        ? client.hotel.findUnique({ where: { id: selection.hotelId }, select: { name: true } })
        : null,
      typeof selection.roomTypeId === "string"
        ? client.roomType.findUnique({ where: { id: selection.roomTypeId }, select: { name: true } })
        : null,
    ]);
    return {
      ...this.quoteSummary(q),
      revision: q.revision,
      lines: q.lines.map((line) => ({
        label: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitPriceCents.toString(),
        totalCents: line.totalCents.toString(),
      })),
      inclusions: strings(q.package?.includes),
      exclusions: strings(q.package?.excludes),
      hotelName: hotel?.name ?? null,
      roomTypeName: room?.name ?? null,
      reviewReasons: strings(q.reviewReasons),
    };
  }

  async decide(userId: string, id: string, decision: "ACCEPT" | "DECLINE", expectedRevision: number) {
    const client = await this.db.client();
    const q = await this.ownedQuote(client, userId, id);
    if (q.status !== "PROPOSAL_SENT") throw new ConflictException("La propuesta ya no admite cambios");
    if (decision === "ACCEPT" && q.totalCents === null)
      throw new ConflictException("La propuesta aún no tiene valor definitivo");
    const status = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await client.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, revision: expectedRevision, status: "PROPOSAL_SENT" },
        data: { status, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException("La solicitud cambió; recarga la información");
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "portal.quote_decision",
          entity: "quote",
          entityId: id,
          before: { status: q.status },
          after: { status },
        },
      });
    });
    return this.customerQuote(userId, id);
  }

  /** Idempotent per quote (unique Reservation.quoteId). Returns `created: false` for a repeated request. */
  async requestReservation(userId: string, id: string, input: ReservationRequest) {
    const client = await this.db.client();
    const q = await this.ownedQuote(client, userId, id);
    if (q.reservation)
      return { created: false, id: q.reservation.id, code: q.reservation.code, status: q.reservation.status };
    if (q.status !== "ACCEPTED" || q.totalCents === null || !q.customerId)
      throw new ConflictException("La cotización debe estar aceptada y tener un valor definitivo");
    const adults = input.travelers.filter((t) => t.category === "ADULT").length;
    if (adults !== (q.adults ?? 0) || input.travelers.length - adults !== (q.children ?? 0))
      throw new BadRequestException("Los viajeros no coinciden con la cotización aceptada");
    const startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
    if (Number.isNaN(startsOn.getTime()) || startsOn.getTime() <= Date.now())
      throw new BadRequestException("La fecha debe ser futura");
    const now = new Date();
    const result = transitionReservation(
      "DRAFT",
      { type: "SUBMIT_REQUEST", actor: { role: "CUSTOMER", id: userId } },
      { totalCents: Number(q.totalCents), paidCents: 0, requiredDepositCents: 0, availabilityValidated: false },
      now,
    );
    if (!result.ok || !result.changed) throw new ConflictException();
    const duration = q.package?.durationDays ?? null;
    // Frozen commercial conditions: later catalog or rate changes never alter this reservation.
    const priceSnapshot = {
      quote: { reference: q.reference, revision: q.revision, snapshot: q.priceSnapshot ?? null },
      conditions: { inclusions: strings(q.package?.includes), exclusions: strings(q.package?.excludes) },
      acceptedAt: now.toISOString(),
      customerNotes: input.notes ?? null,
    };
    try {
      const created = await client.$transaction(async (tx) => {
        const row = await tx.reservation.create({
          data: {
            code: `RES-${randomBytes(6).toString("hex").toUpperCase()}`,
            customerId: q.customerId!,
            quoteId: q.id,
            destinationId: q.destinationId,
            packageId: q.packageId,
            departureId: q.departureId,
            transportOptionId: q.transportOptionId,
            status: result.next,
            adults,
            children: input.travelers.length - adults,
            startsOn,
            endsOn: duration ? new Date(startsOn.getTime() + (duration - 1) * day) : null,
            totalCents: q.totalCents!,
            currency: q.currency,
            pricingVersion: q.pricingVersion ?? "unversioned",
            priceSnapshot,
            travelers: {
              create: input.travelers.map((t, index) => ({
                fullName: t.fullName,
                category: t.category,
                ageYears: t.ageYears ?? null,
                isResponsible: index === 0,
              })),
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: result.next,
                event: "SUBMIT_REQUEST",
                actorId: userId,
                role: "CUSTOMER",
                at: now,
              },
            },
          },
          select: { id: true, code: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "reservation.requested",
            entity: "reservation",
            entityId: row.id,
            after: { status: row.status, quoteId: q.id },
          },
        });
        return row;
      });
      return { created: true, ...created };
    } catch (error) {
      if (!isUnique(error)) throw error;
      const existing = await client.reservation.findUnique({
        where: { quoteId: q.id },
        select: { id: true, code: true, status: true },
      });
      if (!existing) throw error;
      return { created: false, ...existing };
    }
  }

  async customerReservations(userId: string) {
    const client = await this.db.client();
    const rows = await client.reservation.findMany({
      where: { customer: { userId, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: this.customerSelect(),
    });
    return rows.map((row) => this.customerSummary(row));
  }

  async customerReservation(userId: string, id: string) {
    const client = await this.db.client();
    const row = await client.reservation.findFirst({
      where: { id, customer: { userId, deletedAt: null } },
      select: {
        ...this.customerSelect(),
        version: true,
        priceSnapshot: true,
        requiredDepositCents: true,
        payments: { orderBy: { createdAt: "desc" }, take: 20, select: paymentSelect },
        travelers: { orderBy: { createdAt: "asc" }, select: { fullName: true, category: true, ageYears: true } },
        statusHistory: { orderBy: { at: "asc" }, select: { toStatus: true, at: true } },
      },
    });
    if (!row) throw new NotFoundException();
    return {
      ...this.customerSummary(row),
      version: row.version,
      travelers: row.travelers,
      history: row.statusHistory,
      conditions: conditionsOf(row.priceSnapshot),
      ...paymentSummary({
        status: row.status,
        totalCents: row.totalCents,
        requiredDepositCents: row.requiredDepositCents,
        paidCents: await paidCentsOf(client, row.id),
        payments: row.payments,
        adapterEnabled: this.gateway?.enabled() ?? false,
        checkoutUrl: this.gateway ? (reference) => this.gateway!.checkoutUrl(reference) : undefined,
      }),
    };
  }

  /** Customer cancellation: ownership is checked in the same query that loads the row. */
  async customerCancel(userId: string, id: string, reason: string, expectedVersion: number) {
    const client = await this.db.client();
    const owned = await client.reservation.findFirst({
      where: { id, customer: { userId, deletedAt: null } },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException();
    await this.applyEvent(client, id, { id: userId, role: "CUSTOMER" }, "CANCEL", expectedVersion, reason);
    return this.customerReservation(userId, id);
  }

  private customerSelect() {
    return {
      id: true,
      code: true,
      status: true,
      startsOn: true,
      adults: true,
      children: true,
      totalCents: true,
      currency: true,
      availabilityValidatedAt: true,
      createdAt: true,
      package: { select: { title: true } },
    } as const;
  }

  private customerSummary(row: {
    id: string;
    code: string;
    status: string;
    startsOn: Date | null;
    adults: number;
    children: number;
    totalCents: bigint;
    currency: string;
    availabilityValidatedAt: Date | null;
    createdAt: Date;
    package: { title: string } | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      packageName: row.package?.title ?? null,
      startsOn: row.startsOn?.toISOString().slice(0, 10) ?? null,
      adults: row.adults,
      children: row.children,
      totalCents: row.totalCents.toString(),
      currency: row.currency,
      availabilityValidatedAt: row.availabilityValidatedAt,
      createdAt: row.createdAt,
    };
  }

  // ---------- Staff ----------

  async staffEvent(
    id: string,
    actor: ReservationActor,
    event: ReservationEventType,
    expectedVersion: number,
    reason?: string,
    requiredDepositCents?: bigint,
  ) {
    const client = await this.db.client();
    await this.applyEvent(client, id, actor, event, expectedVersion, reason, requiredDepositCents);
    return this.adminDetail(id, false);
  }

  private async applyEvent(
    client: Db,
    id: string,
    actor: ReservationActor,
    event: ReservationEventType,
    expectedVersion: number,
    reason?: string,
    requiredDepositCents?: bigint,
  ) {
    const row = await client.reservation.findUnique({
      where: { id },
      select: {
        status: true,
        version: true,
        totalCents: true,
        requiredDepositCents: true,
        availabilityValidatedAt: true,
      },
    });
    if (!row) throw new NotFoundException();
    if (row.version !== expectedVersion) throw new ConflictException("La reserva cambió; recarga la información");
    // The deposit is a staff decision taken when availability is validated; it is never invented.
    if (requiredDepositCents !== undefined) {
      if (event !== "APPROVE_FOR_PAYMENT")
        throw new BadRequestException("El abono mínimo solo se fija al confirmar disponibilidad");
      if (requiredDepositCents < 0n || requiredDepositCents > row.totalCents)
        throw new BadRequestException("El abono mínimo debe estar entre 0 y el total");
    }
    const deposit = requiredDepositCents ?? row.requiredDepositCents;
    const paidCents = await paidCentsOf(client, id);
    const now = new Date();
    const outcome = transitionReservation(
      row.status,
      { type: event, actor, reason },
      {
        totalCents: Number(row.totalCents),
        // Verified money only: the append-only ledger.
        paidCents: Number(paidCents),
        requiredDepositCents: Number(deposit),
        availabilityValidated: event === "APPROVE_FOR_PAYMENT" || row.availabilityValidatedAt !== null,
      },
      now,
    );
    if (!outcome.ok) {
      if (outcome.error === "FORBIDDEN") throw new ForbiddenException();
      if (outcome.error === "REASON_REQUIRED") throw new BadRequestException("Indica el motivo");
      throw new ConflictException("Transición no permitida para el estado actual");
    }
    await client.$transaction(async (tx) => {
      const changed = await tx.reservation.updateMany({
        where: { id, version: expectedVersion, status: row.status },
        data: {
          status: outcome.next,
          version: { increment: 1 },
          ...(event === "APPROVE_FOR_PAYMENT"
            ? { availabilityValidatedAt: now, validatedById: actor.id, requiredDepositCents: deposit }
            : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException("La reserva cambió; recarga la información");
      // A closed reservation cannot take money: void its pending (uncaptured) payment intents.
      if (outcome.next === "CANCELLED" || outcome.next === "REJECTED" || outcome.next === "REFUND_PENDING")
        await tx.payment.updateMany({
          where: { reservationId: id, status: "PENDING" },
          data: { status: "VOIDED", statusReason: "Reserva cerrada antes del pago" },
        });
      if (outcome.changed)
        await tx.reservationStatusHistory.create({
          data: {
            reservationId: id,
            fromStatus: row.status,
            toStatus: outcome.next,
            event,
            actorId: actor.id,
            role: actor.role,
            reason: reason?.trim() || null,
            at: now,
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: `reservation.${event.toLowerCase()}`,
          entity: "reservation",
          entityId: id,
          before: { status: row.status, version: row.version },
          after: { status: outcome.next, version: row.version + 1 },
        },
      });
    });
  }

  async adminList(input: { status?: string; q?: string; page: number; pageSize: number }, showContact: boolean) {
    const client = await this.db.client();
    const where = {
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.q
        ? {
            OR: [
              { code: { contains: input.q, mode: "insensitive" as const } },
              { quote: { reference: { contains: input.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await client.$transaction([
      client.reservation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          code: true,
          status: true,
          startsOn: true,
          totalCents: true,
          createdAt: true,
          package: { select: { title: true } },
          customer: { select: { name: true } },
          quote: { select: { reference: true } },
          assignedAdvisor: person,
          _count: { select: { travelers: true } },
        },
      }),
      client.reservation.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        packageName: r.package?.title ?? null,
        customerName: showContact ? r.customer.name : null,
        startsOn: r.startsOn?.toISOString().slice(0, 10) ?? null,
        travelers: r._count.travelers,
        totalCents: r.totalCents.toString(),
        assignedAdvisor: r.assignedAdvisor,
        quoteReference: r.quote?.reference ?? null,
        createdAt: r.createdAt,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      pages: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  }

  async adminDetail(id: string, showContact: boolean) {
    const client = await this.db.client();
    const r = await client.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        version: true,
        startsOn: true,
        endsOn: true,
        totalCents: true,
        currency: true,
        priceSnapshot: true,
        availabilityValidatedAt: true,
        requiredDepositCents: true,
        payments: { orderBy: { createdAt: "desc" }, take: 50, select: paymentSelect },
        package: { select: { title: true } },
        destination: { select: { name: true } },
        customer: { select: { name: true, email: true, phone: true } },
        quote: { select: { id: true, reference: true, status: true } },
        validatedBy: person,
        assignedAdvisor: person,
        travelers: { orderBy: { createdAt: "asc" }, select: { fullName: true, category: true, ageYears: true } },
        statusHistory: {
          orderBy: { at: "asc" },
          select: { fromStatus: true, toStatus: true, event: true, role: true, reason: true, at: true, actor: person },
        },
        crmNotes: { orderBy: { createdAt: "desc" }, select: { id: true, body: true, createdAt: true, author: person } },
      },
    });
    if (!r) throw new NotFoundException();
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      version: r.version,
      packageName: r.package?.title ?? null,
      destinationName: r.destination?.name ?? null,
      startsOn: r.startsOn?.toISOString().slice(0, 10) ?? null,
      endsOn: r.endsOn?.toISOString().slice(0, 10) ?? null,
      totalCents: r.totalCents.toString(),
      currency: r.currency,
      priceSnapshot: r.priceSnapshot,
      travelers: r.travelers,
      customer: showContact ? r.customer : null,
      contactHidden: !showContact,
      quote: r.quote,
      availabilityValidatedAt: r.availabilityValidatedAt,
      validatedBy: r.validatedBy,
      assignedAdvisor: r.assignedAdvisor,
      history: r.statusHistory,
      notes: r.crmNotes,
      ...paymentSummary({
        status: r.status,
        totalCents: r.totalCents,
        requiredDepositCents: r.requiredDepositCents,
        paidCents: await paidCentsOf(client, r.id),
        payments: r.payments,
        adapterEnabled: this.gateway?.enabled() ?? false,
      }),
    };
  }

  async addNote(id: string, body: string, actorId: string, showContact: boolean) {
    const client = await this.db.client();
    const exists = await client.reservation.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException();
    await client.$transaction([
      client.crmNote.create({ data: { reservationId: id, authorId: actorId, body } }),
      client.auditLog.create({
        data: { actorId, action: "reservation.note_added", entity: "reservation", entityId: id },
      }),
    ]);
    return this.adminDetail(id, showContact);
  }

  async assign(id: string, advisorId: string, expectedVersion: number, actorId: string, showContact: boolean) {
    const client = await this.db.client();
    const advisor = await client.user.findFirst({
      where: {
        id: advisorId,
        status: "ACTIVE",
        deletedAt: null,
        roles: { some: { roleCode: { in: ["ADVISOR", "ADMIN"] } } },
      },
      select: { id: true },
    });
    if (!advisor) throw new BadRequestException("El asesor no es válido");
    await client.$transaction(async (tx) => {
      const before = await tx.reservation.findUnique({ where: { id }, select: { assignedAdvisorId: true } });
      if (!before) throw new NotFoundException();
      const changed = await tx.reservation.updateMany({
        where: { id, version: expectedVersion },
        data: { assignedAdvisorId: advisorId, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException("La reserva cambió; recarga la información");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "reservation.assigned",
          entity: "reservation",
          entityId: id,
          before: { advisorId: before.assignedAdvisorId },
          after: { advisorId },
        },
      });
    });
    return this.adminDetail(id, showContact);
  }
}
