import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { canTransitionCrmStatus, crmTransitionError, type CrmQuoteStatus } from "@ricaurte/domain";
import { DbService } from "../db/db.service";

type ListInput = {
  status?: CrmQuoteStatus;
  assigneeId?: string;
  source?: "PUBLIC" | "ADMIN";
  q?: string;
  page: number;
  pageSize: number;
  canReadContact: boolean;
};

const stringifyCents = (value: bigint | null) => value?.toString() ?? null;

@Injectable()
export class CrmService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(input: ListInput) {
    const client = await this.db.client();
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.assigneeId ? { assignedToId: input.assigneeId === "unassigned" ? null : input.assigneeId } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.q
        ? {
            OR: [
              { reference: { contains: input.q, mode: "insensitive" as const } },
              ...(input.canReadContact ? [{ email: { contains: input.q, mode: "insensitive" as const } }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await client.$transaction([
      client.quote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          source: true,
          travelers: true,
          travelDate: true,
          totalCents: true,
          createdAt: true,
          destination: true,
          package: { select: { title: true } },
          catalogDestination: { select: { name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      client.quote.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        reference: item.reference,
        status: item.status,
        source: item.source,
        packageName: item.package?.title ?? null,
        destinationName: item.catalogDestination?.name ?? item.destination ?? null,
        travelers: item.travelers,
        travelDate: item.travelDate,
        totalCents: stringifyCents(item.totalCents),
        createdAt: item.createdAt,
        assignee: item.assignedTo,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      pages: Math.ceil(total / input.pageSize),
    };
  }

  async get(id: string, canReadContact: boolean) {
    const client = await this.db.client();
    const quote = await client.quote.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        status: true,
        revision: true,
        source: true,
        adults: true,
        children: true,
        travelDate: true,
        totalCents: true,
        currency: true,
        reviewReasons: true,
        notes: true,
        name: true,
        email: true,
        phone: true,
        destination: true,
        package: { select: { title: true } },
        catalogDestination: { select: { name: true } },
        assignedTo: { select: { id: true, name: true } },
        lines: {
          orderBy: { lineNo: "asc" },
          select: { description: true, quantity: true, unitPriceCents: true, totalCents: true },
        },
        leadAssignments: {
          orderBy: { assignedAt: "desc" },
          select: { assignedAt: true, unassignedAt: true, advisor: { select: { id: true, name: true } } },
        },
        crmNotes: {
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!quote) throw new NotFoundException();
    const history = await client.auditLog.findMany({
      where: { entity: "quote", entityId: id },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, before: true, after: true, actor: { select: { id: true, name: true } } },
    });
    return {
      id: quote.id,
      reference: quote.reference,
      status: quote.status,
      revision: quote.revision,
      source: quote.source,
      packageName: quote.package?.title ?? null,
      destinationName: quote.catalogDestination?.name ?? quote.destination ?? null,
      adults: quote.adults,
      children: quote.children,
      travelDate: quote.travelDate,
      totalCents: stringifyCents(quote.totalCents),
      currency: quote.currency,
      reviewReasons: Array.isArray(quote.reviewReasons)
        ? quote.reviewReasons.filter((reason): reason is string => typeof reason === "string")
        : [],
      lines: quote.lines.map((line) => ({
        ...line,
        unitPriceCents: line.unitPriceCents.toString(),
        totalCents: line.totalCents.toString(),
      })),
      contact: canReadContact ? { name: quote.name, email: quote.email, phone: quote.phone } : null,
      contactHidden: !canReadContact,
      notes: quote.notes,
      assignee: quote.assignedTo,
      assignments: quote.leadAssignments,
      crmNotes: quote.crmNotes,
      history,
    };
  }

  async advisors() {
    const client = await this.db.client();
    return client.user.findMany({
      where: { status: "ACTIVE", roles: { some: { roleCode: { in: ["ADVISOR", "ADMIN"] } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  async assign(id: string, advisorId: string, expectedRevision: number, reason: string | undefined, actorId: string) {
    const client = await this.db.client();
    const [quote, advisor] = await Promise.all([
      client.quote.findUnique({
        where: { id },
        select: { id: true, status: true, revision: true, assignedToId: true },
      }),
      client.user.findFirst({
        where: { id: advisorId, status: "ACTIVE", roles: { some: { roleCode: { in: ["ADVISOR", "ADMIN"] } } } },
        select: { id: true },
      }),
    ]);
    if (!quote) throw new NotFoundException();
    if (!advisor) throw new BadRequestException("El asesor debe estar activo y tener rol ADVISOR o ADMIN");
    const status = quote.status === "NEW" || quote.status === "REQUIRES_MANUAL_REVIEW" ? "ASSIGNED" : quote.status;
    await client.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, revision: expectedRevision },
        data: { assignedToId: advisorId, status, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException("La solicitud fue modificada por otro usuario");
      await tx.leadAssignment.updateMany({
        where: { quoteId: id, unassignedAt: null },
        data: { unassignedAt: new Date() },
      });
      await tx.leadAssignment.create({ data: { quoteId: id, advisorId, assignedById: actorId, reason } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "crm.assigned",
          entity: "quote",
          entityId: id,
          before: { status: quote.status, assignedToId: quote.assignedToId, revision: expectedRevision },
          after: { status, assignedToId: advisorId, revision: expectedRevision + 1 },
        },
      });
    });
    return this.get(id, false);
  }

  async changeStatus(id: string, status: CrmQuoteStatus, expectedRevision: number, actorId: string) {
    const client = await this.db.client();
    const quote = await client.quote.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!quote) throw new NotFoundException();
    if (!canTransitionCrmStatus(quote.status, status))
      throw new BadRequestException(crmTransitionError(quote.status, status));
    await client.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, revision: expectedRevision },
        data: { status, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException("La solicitud fue modificada por otro usuario");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "crm.status_changed",
          entity: "quote",
          entityId: id,
          before: { status: quote.status, revision: expectedRevision },
          after: { status, revision: expectedRevision + 1 },
        },
      });
    });
    return this.get(id, false);
  }

  async addNote(id: string, body: string, actorId: string) {
    const client = await this.db.client();
    const quote = await client.quote.findUnique({ where: { id }, select: { id: true } });
    if (!quote) throw new NotFoundException();
    await client.$transaction(async (tx) => {
      await tx.crmNote.create({ data: { quoteId: id, authorId: actorId, body } });
      await tx.auditLog.create({
        data: { actorId, action: "crm.note_added", entity: "quote", entityId: id, before: {}, after: {} },
      });
    });
    return { ok: true };
  }

  async stats() {
    const client = await this.db.client();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const active = { status: { not: "DRAFT" as const } };
    const [groups, unassigned, last7Days] = await Promise.all([
      client.quote.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: active, _count: { _all: true } }),
      client.quote.count({ where: { ...active, assignedToId: null } }),
      client.quote.count({ where: { ...active, createdAt: { gte: since } } }),
    ]);
    return {
      byStatus: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
      unassigned,
      last7Days,
    };
  }
}
