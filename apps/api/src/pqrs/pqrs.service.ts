import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";
import { DbService } from "../db/db.service";
import { NotificationsService } from "../notifications/notifications.service";

export const PQRS_TYPES = ["PETITION", "COMPLAINT", "CLAIM", "SUGGESTION"] as const;
export const PQRS_STATUSES = ["RECEIVED", "IN_REVIEW", "WAITING_FOR_CUSTOMER", "ANSWERED", "CLOSED"] as const;
export type PqrsType = (typeof PQRS_TYPES)[number];
export type PqrsStatus = (typeof PQRS_STATUSES)[number];

/** Allowed staff transitions (contract pqrs.md). CLOSED is terminal. */
export const PQRS_TRANSITIONS: Readonly<Record<PqrsStatus, readonly PqrsStatus[]>> = {
  RECEIVED: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_FOR_CUSTOMER", "ANSWERED"],
  WAITING_FOR_CUSTOMER: ["IN_REVIEW"],
  ANSWERED: ["IN_REVIEW", "CLOSED"],
  CLOSED: [],
};
const OPEN: PqrsStatus[] = ["RECEIVED", "IN_REVIEW", "WAITING_FOR_CUSTOMER"];
const PAGE = 25;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base32 = (bytes: Buffer) => [...bytes].map((byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[byte & 31]).join("");
const newTrackingCode = () =>
  base32(randomBytes(16))
    .match(/.{1,4}/g)!
    .join("-");
const newReference = () => `PQR-${randomBytes(6).toString("hex").toUpperCase()}`;

/** Monday–Friday only. Colombian holidays are not applied yet (PENDIENTE DE CONFIRMACIÓN legal). */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let left = days;
  while (left > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return result;
}

export type PublicPqrsInput = {
  type: PqrsType;
  subject: string;
  description: string;
  name: string;
  email: string;
  phone?: string;
  dataConsent: true;
  idempotencyKey: string;
  website: string;
};
export type CustomerPqrsInput = { type: PqrsType; subject: string; description: string; idempotencyKey: string };

type Db = Awaited<ReturnType<DbService["client"]>>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

const messageSelect = {
  id: true,
  message: true,
  isStaff: true,
  isInternal: true,
  createdAt: true,
  author: { select: { name: true } },
} as const;

@Injectable()
export class PqrsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ENV) private readonly env: ApiEnv,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  private intakeFlag() {
    if (this.env.PQRS_INTAKE_ENABLED !== "true") throw new ServiceUnavailableException("Servicio no disponible");
  }

  /** Intake gate for public and customer creation: flag on and an APPROVED data-treatment document in force. */
  private async intakeLegal(client: Db | Tx) {
    this.intakeFlag();
    const legal = await client.legalDocument.findFirst({
      where: {
        type: "DATA_TREATMENT_AUTHORIZATION",
        status: "APPROVED",
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }],
      },
      orderBy: { approvedAt: "desc" },
      select: { id: true, version: true },
    });
    if (!legal) throw new ServiceUnavailableException("Servicio no disponible");
    return legal;
  }

  private dueAt(now: Date) {
    return addBusinessDays(now, this.env.PQRS_RESPONSE_BUSINESS_DAYS);
  }

  private async notify(
    tx: Tx,
    kind: string,
    ticket: { id: string; reference: string; requesterEmail: string | null; requesterName: string | null },
    extra: Record<string, unknown>,
    dedupe: string,
  ) {
    if (!this.notifications || !ticket.requesterEmail) return;
    const firstName = ticket.requesterName?.trim().split(/\s+/)[0];
    await this.notifications.enqueue(
      kind,
      ticket.requesterEmail,
      { reference: ticket.reference, ...(firstName ? { firstName } : {}), ...extra },
      dedupe,
      tx,
    );
  }

  // ---------- Public ----------

  async createPublic(input: PublicPqrsInput, ip: string, origin?: string) {
    this.intakeFlag();
    if (origin && origin !== this.env.WEB_ORIGIN) throw new ForbiddenException();
    // Honeypot: look successful to bots, store nothing.
    if (input.website) return { reference: "", trackingCode: null, status: "RECEIVED", responseDueAt: null };
    const client = await this.db.client();
    await this.intakeLegal(client);
    // Replay only public tickets: a key held by a portal ticket must not disclose it.
    const replay = await client.pqrsTicket.findFirst({
      where: { idempotencyKey: input.idempotencyKey, customerId: null },
      select: { reference: true, status: true, resolutionDueAt: true },
    });
    if (replay)
      return {
        reference: replay.reference,
        trackingCode: null,
        status: replay.status,
        responseDueAt: replay.resolutionDueAt?.toISOString() ?? null,
      };
    const code = newTrackingCode();
    const now = new Date();
    const due = this.dueAt(now);
    const email = input.email.trim().toLowerCase();
    try {
      const ticket = await client.$transaction(async (tx) => {
        const legal = await this.intakeLegal(tx);
        const created = await tx.pqrsTicket.create({
          data: {
            reference: newReference(),
            type: input.type,
            subject: input.subject,
            description: input.description,
            requesterName: input.name,
            requesterEmail: email,
            requesterPhone: input.phone || null,
            trackingCodeHash: sha256(code),
            idempotencyKey: input.idempotencyKey,
            dataConsentAt: now,
            firstResponseDueAt: due,
            resolutionDueAt: due,
          },
          select: { id: true, reference: true, status: true, requesterEmail: true, requesterName: true },
        });
        await tx.consentRecord.create({
          data: {
            purpose: "DATA_PROCESSING",
            legalDocumentId: legal.id,
            legalDocumentVersion: legal.version,
            granted: true,
            email,
            pqrsTicketId: created.id,
            source: "public_pqrs",
            ipHash: sha256(ip),
          },
        });
        await tx.auditLog.create({
          data: { actorId: null, action: "pqrs.public_created", entity: "pqrs", entityId: created.id },
        });
        await this.notify(tx, "pqrs.received", created, {}, `pqrs.received:${created.id}`);
        return created;
      });
      return {
        reference: ticket.reference,
        trackingCode: code,
        status: ticket.status,
        responseDueAt: due.toISOString(),
      };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const existing = await client.pqrsTicket.findFirst({
          where: { idempotencyKey: input.idempotencyKey, customerId: null },
          select: { reference: true, status: true, resolutionDueAt: true },
        });
        if (existing)
          return {
            reference: existing.reference,
            trackingCode: null,
            status: existing.status,
            responseDueAt: existing.resolutionDueAt?.toISOString() ?? null,
          };
        throw new ConflictException("Solicitud duplicada; recarga");
      }
      throw error;
    }
  }

  async track(reference: string, code: string) {
    const client = await this.db.client();
    const ticket = await client.pqrsTicket.findUnique({
      where: { reference: reference.trim().toUpperCase() },
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        subject: true,
        createdAt: true,
        resolutionDueAt: true,
        trackingCodeHash: true,
        messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, select: messageSelect },
      },
    });
    // Same 404 for unknown reference and wrong code; constant-time comparison of equal-length hex digests.
    const expected = Buffer.from(ticket?.trackingCodeHash ?? "0".repeat(64), "hex");
    const actual = Buffer.from(sha256(code.trim().toUpperCase()), "hex");
    if (!ticket?.trackingCodeHash || !timingSafeEqual(expected, actual)) throw new NotFoundException();
    return this.publicView(ticket);
  }

  private publicView(ticket: {
    reference: string;
    type: string;
    status: string;
    subject: string;
    createdAt: Date;
    resolutionDueAt: Date | null;
    messages: Array<{ message: string; isStaff: boolean; createdAt: Date }>;
  }) {
    return {
      reference: ticket.reference,
      type: ticket.type,
      status: ticket.status,
      subject: ticket.subject,
      createdAt: ticket.createdAt.toISOString(),
      responseDueAt: ticket.resolutionDueAt?.toISOString() ?? null,
      messages: ticket.messages.map((m) => ({
        author: m.isStaff ? "AGENCY" : "REQUESTER",
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  // ---------- Customer portal (owner-scoped) ----------

  private async customerOf(client: Db | Tx, userId: string) {
    const customer = await client.customer.findUnique({
      where: { userId },
      select: { id: true, name: true, email: true, phone: true, deletedAt: true },
    });
    if (!customer || customer.deletedAt) throw new ForbiddenException();
    return customer;
  }

  async customerList(userId: string) {
    const client = await this.db.client();
    const customer = await this.customerOf(client, userId);
    const rows = await client.pqrsTicket.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        subject: true,
        createdAt: true,
        resolutionDueAt: true,
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        type: row.type,
        status: row.status,
        subject: row.subject,
        createdAt: row.createdAt.toISOString(),
        responseDueAt: row.resolutionDueAt?.toISOString() ?? null,
      })),
    };
  }

  async customerDetail(userId: string, id: string) {
    const client = await this.db.client();
    const customer = await this.customerOf(client, userId);
    const ticket = await client.pqrsTicket.findFirst({
      where: { id, customerId: customer.id },
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        subject: true,
        createdAt: true,
        resolutionDueAt: true,
        messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, select: messageSelect },
      },
    });
    if (!ticket) throw new NotFoundException();
    return { id: ticket.id, ...this.publicView(ticket) };
  }

  // Origin/CSRF are validated by requireCustomerMutation (APP_ORIGIN); no WEB_ORIGIN check here.
  async customerCreate(userId: string, input: CustomerPqrsInput) {
    const client = await this.db.client();
    await this.intakeLegal(client);
    const customer = await this.customerOf(client, userId);
    const replay = await client.pqrsTicket.findFirst({
      where: { idempotencyKey: input.idempotencyKey, customerId: customer.id },
      select: { id: true, reference: true, status: true, resolutionDueAt: true },
    });
    if (replay)
      return {
        id: replay.id,
        reference: replay.reference,
        status: replay.status,
        responseDueAt: replay.resolutionDueAt?.toISOString() ?? null,
      };
    const now = new Date();
    const due = this.dueAt(now);
    try {
      return await client.$transaction(async (tx) => {
        const created = await tx.pqrsTicket.create({
          data: {
            reference: newReference(),
            customerId: customer.id,
            type: input.type,
            subject: input.subject,
            description: input.description,
            requesterName: customer.name,
            requesterEmail: customer.email?.toLowerCase() ?? null,
            requesterPhone: customer.phone ?? null,
            idempotencyKey: input.idempotencyKey,
            firstResponseDueAt: due,
            resolutionDueAt: due,
          },
          select: { id: true, reference: true, status: true, requesterEmail: true, requesterName: true },
        });
        await tx.auditLog.create({
          data: { actorId: userId, action: "pqrs.customer_created", entity: "pqrs", entityId: created.id },
        });
        await this.notify(tx, "pqrs.received", created, {}, `pqrs.received:${created.id}`);
        return {
          id: created.id,
          reference: created.reference,
          status: created.status,
          responseDueAt: due.toISOString(),
        };
      });
    } catch (error) {
      // Same key used by someone else (or a race): never reveal another customer's ticket.
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("Solicitud duplicada; recarga");
      throw error;
    }
  }

  async customerReply(userId: string, id: string, message: string) {
    const client = await this.db.client();
    const customer = await this.customerOf(client, userId);
    return client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pqrs_tickets WHERE id = ${id}::uuid FOR UPDATE`;
      const ticket = await tx.pqrsTicket.findFirst({
        where: { id, customerId: customer.id },
        select: { id: true, status: true },
      });
      if (!ticket) throw new NotFoundException();
      if (ticket.status === "CLOSED") throw new ConflictException("La PQRS está cerrada");
      const created = await tx.pqrsMessage.create({
        data: { ticketId: id, message, isStaff: false, isInternal: false, authorId: userId },
        select: { id: true },
      });
      if (ticket.status === "WAITING_FOR_CUSTOMER")
        await tx.pqrsTicket.update({ where: { id }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
      await tx.auditLog.create({
        data: { actorId: userId, action: "pqrs.customer_replied", entity: "pqrs", entityId: id },
      });
      return { id: created.id };
    });
  }

  // ---------- Staff ----------

  async staffList(query: { status?: PqrsStatus; overdue?: boolean; page: number }) {
    const client = await this.db.client();
    const now = new Date();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdue ? { status: { in: OPEN }, resolutionDueAt: { lt: now } } : {}),
    };
    const [rows, total] = await Promise.all([
      client.pqrsTicket.findMany({
        where,
        orderBy: [{ resolutionDueAt: "asc" }, { createdAt: "asc" }],
        skip: (query.page - 1) * PAGE,
        take: PAGE,
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          subject: true,
          requesterName: true,
          createdAt: true,
          resolutionDueAt: true,
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      client.pqrsTicket.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        type: row.type,
        status: row.status,
        subject: row.subject,
        requesterName: row.requesterName,
        assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.name } : null,
        createdAt: row.createdAt.toISOString(),
        responseDueAt: row.resolutionDueAt?.toISOString() ?? null,
        overdue: Boolean(row.resolutionDueAt && row.resolutionDueAt < now && OPEN.includes(row.status as PqrsStatus)),
      })),
      page: query.page,
      total,
    };
  }

  private assignableStaff(client: Db | Tx) {
    // Roles holding pqrs:respond (domain ROLE_PERMISSIONS): ADVISOR and ADMIN.
    return client.user.findMany({
      where: { status: "ACTIVE", roles: { some: { roleCode: { in: ["ADVISOR", "ADMIN"] } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  async staffDetail(id: string) {
    const client = await this.db.client();
    const [ticket, staff] = await Promise.all([
      client.pqrsTicket.findUnique({
        where: { id },
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          subject: true,
          description: true,
          requesterName: true,
          requesterEmail: true,
          requesterPhone: true,
          customerId: true,
          version: true,
          createdAt: true,
          resolutionDueAt: true,
          firstRespondedAt: true,
          resolvedAt: true,
          closedAt: true,
          assignedTo: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "asc" }, select: messageSelect },
        },
      }),
      this.assignableStaff(client),
    ]);
    if (!ticket) throw new NotFoundException();
    const iso = (value: Date | null) => value?.toISOString() ?? null;
    return {
      id: ticket.id,
      reference: ticket.reference,
      type: ticket.type,
      status: ticket.status,
      subject: ticket.subject,
      description: ticket.description,
      requesterName: ticket.requesterName,
      requesterEmail: ticket.requesterEmail,
      requesterPhone: ticket.requesterPhone,
      customerId: ticket.customerId,
      version: ticket.version,
      createdAt: ticket.createdAt.toISOString(),
      responseDueAt: iso(ticket.resolutionDueAt),
      overdue: Boolean(
        ticket.resolutionDueAt && ticket.resolutionDueAt < new Date() && OPEN.includes(ticket.status as PqrsStatus),
      ),
      firstRespondedAt: iso(ticket.firstRespondedAt),
      resolvedAt: iso(ticket.resolvedAt),
      closedAt: iso(ticket.closedAt),
      assignedTo: ticket.assignedTo ? { id: ticket.assignedTo.id, displayName: ticket.assignedTo.name } : null,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        author: m.isStaff ? "AGENCY" : "REQUESTER",
        internal: m.isInternal,
        authorName: m.isStaff ? (m.author?.name ?? null) : null,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
      assignableStaff: staff.map((user) => ({ id: user.id, displayName: user.name })),
    };
  }

  async assign(actorId: string, id: string, assigneeId: string | null) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pqrs_tickets WHERE id = ${id}::uuid FOR UPDATE`;
      const ticket = await tx.pqrsTicket.findUnique({ where: { id }, select: { status: true, assignedToId: true } });
      if (!ticket) throw new NotFoundException();
      if (ticket.status === "CLOSED") throw new ConflictException("La PQRS está cerrada");
      if (assigneeId && !(await this.assignableStaff(tx)).some((user) => user.id === assigneeId))
        throw new BadRequestException("El usuario no puede atender PQRS");
      await tx.pqrsTicket.update({ where: { id }, data: { assignedToId: assigneeId, version: { increment: 1 } } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "pqrs.assigned",
          entity: "pqrs",
          entityId: id,
          before: { assignedToId: ticket.assignedToId },
          after: { assignedToId: assigneeId },
        },
      });
      return { assignedToId: assigneeId };
    });
  }

  async staffMessage(actorId: string, id: string, message: string, internal: boolean) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pqrs_tickets WHERE id = ${id}::uuid FOR UPDATE`;
      const ticket = await tx.pqrsTicket.findUnique({
        where: { id },
        select: {
          id: true,
          reference: true,
          status: true,
          firstRespondedAt: true,
          requesterEmail: true,
          requesterName: true,
        },
      });
      if (!ticket) throw new NotFoundException();
      if (ticket.status === "CLOSED" && !internal) throw new ConflictException("La PQRS está cerrada");
      const created = await tx.pqrsMessage.create({
        data: { ticketId: id, message, isStaff: true, isInternal: internal, authorId: actorId },
        select: { id: true },
      });
      if (!internal && !ticket.firstRespondedAt)
        await tx.pqrsTicket.update({ where: { id }, data: { firstRespondedAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId, action: internal ? "pqrs.note_added" : "pqrs.answered", entity: "pqrs", entityId: id },
      });
      // The mail carries no content: the requester reads the answer with reference + code (or in the portal).
      if (!internal) await this.notify(tx, "pqrs.answered", ticket, {}, `pqrs.answered:${created.id}`);
      return { id: created.id };
    });
  }

  async changeStatus(actorId: string, id: string, status: PqrsStatus, expectedVersion: number) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const ticket = await tx.pqrsTicket.findUnique({
        where: { id },
        select: { id: true, reference: true, status: true, version: true, requesterEmail: true, requesterName: true },
      });
      if (!ticket) throw new NotFoundException();
      if (ticket.version !== expectedVersion) throw new ConflictException("La PQRS cambió; recarga");
      const from = ticket.status as PqrsStatus;
      if (!PQRS_TRANSITIONS[from].includes(status)) throw new ConflictException("Transición no permitida");
      if (status === "ANSWERED") {
        const answers = await tx.pqrsMessage.count({ where: { ticketId: id, isStaff: true, isInternal: false } });
        if (!answers) throw new ConflictException("Responde al solicitante antes de marcarla como respondida");
      }
      const now = new Date();
      // Conditional claim: a concurrent change with the same version loses (count 0 → 409).
      const claimed = await tx.pqrsTicket.updateMany({
        where: { id, version: expectedVersion, status: from },
        data: {
          status,
          version: { increment: 1 },
          ...(status === "ANSWERED" ? { resolvedAt: now } : {}),
          ...(status === "CLOSED" ? { closedAt: now } : {}),
          ...(status === "IN_REVIEW" && from === "ANSWERED" ? { resolvedAt: null } : {}),
        },
      });
      if (claimed.count !== 1) throw new ConflictException("La PQRS cambió; recarga");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "pqrs.status_changed",
          entity: "pqrs",
          entityId: id,
          before: { status: from },
          after: { status },
        },
      });
      await this.notify(tx, "pqrs.status_changed", ticket, { status }, `pqrs.status:${id}:${expectedVersion + 1}`);
      return { status, version: expectedVersion + 1 };
    });
  }
}
