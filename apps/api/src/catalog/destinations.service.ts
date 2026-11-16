import { Inject, Injectable } from "@nestjs/common";
import { redact } from "../audit/redact";
import { writeAudit } from "../content/audit";
import { DbService } from "../db/db.service";
import { conflict, notFound, stale } from "./commercial-rules.service";

export type DestinationInput = {
  slug: string;
  name: string;
  country: string;
  region?: string | null;
  description?: string | null;
  category: "NACIONAL" | "INTERNACIONAL" | "PASADIA" | "ESPECIAL";
  seoTitle?: string | null;
  seoDescription?: string | null;
  noindex?: boolean;
  sortOrder?: number;
};

const ENTITY = "destination";
const select = {
  id: true,
  slug: true,
  name: true,
  country: true,
  region: true,
  description: true,
  category: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  noindex: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DestinationsService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(query?: string) {
    const client = await this.db.client();
    return client.destination.findMany({
      where: {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { country: { contains: query, mode: "insensitive" } },
                { region: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select,
    });
  }

  async history(id: string) {
    const client = await this.db.client();
    if (!(await client.destination.findFirst({ where: { id, deletedAt: null }, select: { id: true } })))
      throw notFound();
    const rows = await client.auditLog.findMany({
      where: { entity: ENTITY, entityId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, before: redact(row.before), after: redact(row.after) }));
  }

  async create(input: DestinationInput, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        const destination = await tx.destination.create({
          data: { ...input, slug: input.slug.toLowerCase(), status: "DRAFT" },
          select,
        });
        await writeAudit(tx, {
          actorId,
          action: "destinations.created",
          entity: ENTITY,
          entityId: destination.id,
          after: destination,
        });
        return destination;
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002")
        throw conflict("DESTINATION_SLUG_TAKEN", "Ya existe un destino con ese slug");
      throw error;
    }
  }

  async update(id: string, input: Partial<DestinationInput>, expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    try {
      return await client.$transaction(async (tx) => {
        const previous = await tx.destination.findFirst({ where: { id, deletedAt: null }, select });
        if (!previous) throw notFound();
        if (previous.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
        const changed = await tx.destination.updateMany({
          where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
          data: { ...input, ...(input.slug ? { slug: input.slug.toLowerCase() } : {}) },
        });
        if (changed.count !== 1) throw stale();
        const destination = await tx.destination.findUniqueOrThrow({ where: { id }, select });
        await writeAudit(tx, {
          actorId,
          action: "destinations.updated",
          entity: ENTITY,
          entityId: id,
          before: previous,
          after: destination,
        });
        return destination;
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002")
        throw conflict("DESTINATION_SLUG_TAKEN", "Ya existe un destino con ese slug");
      throw error;
    }
  }

  async setStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", expectedUpdatedAt: Date, actorId: string) {
    const client = await this.db.client();
    return client.$transaction(async (tx) => {
      const previous = await tx.destination.findFirst({ where: { id, deletedAt: null }, select });
      if (!previous) throw notFound();
      if (previous.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw stale();
      if (status === "PUBLISHED" && previous.status !== "DRAFT")
        throw conflict("NOT_DRAFT", "Solo un borrador se puede publicar");
      if (status === "DRAFT" && previous.status !== "PUBLISHED")
        throw conflict("NOT_PUBLISHED", "Solo un destino publicado se puede retirar");
      if (status === "ARCHIVED" && previous.status === "ARCHIVED")
        throw conflict("ALREADY_ARCHIVED", "El destino ya estaba archivado");
      const changed = await tx.destination.updateMany({
        where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
        data: { status },
      });
      if (changed.count !== 1) throw stale();
      const destination = await tx.destination.findUniqueOrThrow({ where: { id }, select });
      const suffix = status === "PUBLISHED" ? "published" : status === "DRAFT" ? "unpublished" : "archived";
      await writeAudit(tx, {
        actorId,
        action: `destinations.${suffix}`,
        entity: ENTITY,
        entityId: id,
        before: previous,
        after: destination,
      });
      return destination;
    });
  }
}
