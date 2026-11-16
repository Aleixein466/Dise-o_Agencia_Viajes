import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { conflict, notFound, stale, type Tx } from "../catalog/commercial-rules.service";

/**
 * Staff view of customer records. Document numbers never leave the API unmasked and never enter audit snapshots;
 * contact data (email, phone) is not copied into audit either, only the names of the fields that changed. Internal
 * notes are CrmNote rows scoped to the customer (no quote/reservation), never exposed by the customer portal.
 */

export type CustomerPatch = { name?: string; email?: string; phone?: string; country?: string | null };

const ENTITY = "customer";
const LATEST = 5;
const NOTES = 50;

/** Last 4 characters only; anything shorter is fully hidden. */
export function maskDocument(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/\s/g, "");
  return clean.length > 4 ? `••••${clean.slice(-4)}` : "••••";
}

const base = {
  id: true,
  name: true,
  email: true,
  phone: true,
  country: true,
  documentType: true,
  documentNumber: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type BaseRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string | null;
  documentType: string | null;
  documentNumber: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Explicit allow-list: nothing else from the row (full document, user id) can reach a response. */
function present(row: BaseRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    documentType: row.documentType,
    documentNumberMasked: maskDocument(row.documentNumber),
    hasPortalAccount: row.userId !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const cents = (value: bigint | null | undefined) => (value === null || value === undefined ? null : value.toString());
const duplicate = () => conflict("DUPLICATE_CUSTOMER", "Ya existe un cliente o una cuenta con ese correo");

@Injectable()
export class CustomersService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(q: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const term = q?.trim();
    const where = {
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await client.$transaction([
      client.customer.count({ where }),
      client.customer.findMany({
        where,
        select: { ...base, _count: { select: { quotes: true, reservations: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map(({ _count, ...row }) => ({
        ...present(row),
        quotesCount: _count.quotes,
        reservationsCount: _count.reservations,
      })),
      total,
      page: current,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async get(id: string) {
    const client = await this.db.client();
    const row = await client.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...base,
        _count: { select: { quotes: true, reservations: true, payments: true, pqrsTickets: true } },
        quotes: {
          orderBy: { createdAt: "desc" },
          take: LATEST,
          select: { id: true, reference: true, status: true, totalCents: true, currency: true, createdAt: true },
        },
        reservations: {
          orderBy: { createdAt: "desc" },
          take: LATEST,
          select: {
            id: true,
            code: true,
            status: true,
            startsOn: true,
            totalCents: true,
            currency: true,
            createdAt: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: LATEST,
          select: {
            id: true,
            reference: true,
            status: true,
            provider: true,
            amountCents: true,
            currency: true,
            createdAt: true,
          },
        },
        pqrsTickets: {
          orderBy: { createdAt: "desc" },
          take: LATEST,
          select: { id: true, reference: true, type: true, status: true, subject: true, createdAt: true },
        },
      },
    });
    if (!row) throw notFound();
    const [notesCount, notes] = await client.$transaction([
      client.crmNote.count({ where: { customerId: id, quoteId: null, reservationId: null, pqrsTicketId: null } }),
      client.crmNote.findMany({
        where: { customerId: id, quoteId: null, reservationId: null, pqrsTicketId: null },
        orderBy: { createdAt: "desc" },
        take: NOTES,
        select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
      }),
    ]);
    const { _count, quotes, reservations, payments, pqrsTickets, ...customer } = row;
    return {
      ...present(customer),
      counts: {
        quotes: _count.quotes,
        reservations: _count.reservations,
        payments: _count.payments,
        pqrs: _count.pqrsTickets,
        notes: notesCount,
      },
      quotes: quotes.map((item) => ({ ...item, totalCents: cents(item.totalCents) })),
      reservations: reservations.map((item) => ({
        ...item,
        startsOn: item.startsOn ? item.startsOn.toISOString().slice(0, 10) : null,
        totalCents: cents(item.totalCents),
      })),
      payments: payments.map((item) => ({ ...item, amountCents: cents(item.amountCents) })),
      pqrs: pqrsTickets,
      notes,
    };
  }

  /** Serialises email changes to the same address, so two edits cannot both pass the duplicate check. */
  private async assertEmailFree(tx: Tx, email: string, ownId: string) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`customers:email:${email}`}))`;
    const [customer, user] = await Promise.all([
      tx.customer.findFirst({
        where: { id: { not: ownId }, deletedAt: null, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      }),
      tx.user.findFirst({ where: { email }, select: { id: true } }),
    ]);
    if (customer || user) throw duplicate();
  }

  async update(id: string, patch: CustomerPatch, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    await client.$transaction(async (tx) => {
      const old = await tx.customer.findFirst({ where: { id, deletedAt: null }, select: base });
      if (!old) throw notFound();
      if (old.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
      const email = patch.email?.toLowerCase();
      const data = {
        name: patch.name ?? old.name,
        email: email ?? old.email,
        phone: patch.phone ?? old.phone,
        country: patch.country !== undefined ? patch.country : old.country,
      };
      const changed = (Object.keys(data) as (keyof typeof data)[]).filter((key) => data[key] !== old[key]);
      if (!changed.length) return;
      if (changed.includes("email")) {
        // The portal login is the account email; changing only the contact copy would split the two.
        if (old.userId)
          throw conflict(
            "CUSTOMER_HAS_ACCOUNT",
            "El cliente tiene cuenta en el portal: su correo de acceso no se cambia desde aquí",
          );
        await this.assertEmailFree(tx, data.email, id);
      }
      const written = await tx.customer.updateMany({
        where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
        data,
      });
      if (written.count !== 1) throw stale();
      await tx.auditLog.create({
        data: {
          actorId,
          action: "customers.updated",
          entity: ENTITY,
          entityId: id,
          // Contact values are personal data: the audit keeps which fields changed, never their values.
          details: { changed },
        },
      });
    });
    return this.get(id);
  }

  async addNote(id: string, body: string, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      if (!customer) throw notFound();
      const note = await tx.crmNote.create({
        data: { customerId: id, authorId: actorId, body },
        select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
      });
      // The note text can hold sensitive context: the audit entry records that it exists, not what it says.
      await tx.auditLog.create({
        data: { actorId, action: "customers.note_added", entity: ENTITY, entityId: id, details: { noteId: note.id } },
      });
      return note;
    });
  }
}
