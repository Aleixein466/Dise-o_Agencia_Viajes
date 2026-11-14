import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

export type DestinationInput = {
  slug: string;
  name: string;
  country: string;
  region?: string;
  description?: string;
  category: "NACIONAL" | "INTERNACIONAL" | "PASADIA" | "ESPECIAL";
};

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
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        country: true,
        region: true,
        category: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async create(input: DestinationInput, actorId: string) {
    const client = await this.db.client();
    try {
      const destination = await client.destination.create({
        data: { ...input, slug: input.slug.toLowerCase(), status: "DRAFT" },
        select: {
          id: true,
          slug: true,
          name: true,
          country: true,
          region: true,
          category: true,
          status: true,
          updatedAt: true,
        },
      });
      await client.auditLog.create({
        data: { actorId, action: "destinations.created", entity: "destination", entityId: destination.id },
      });
      return destination;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }

  async update(id: string, input: Partial<DestinationInput>, actorId: string) {
    const client = await this.db.client();
    const previous = await client.destination.findFirst({ where: { id, deletedAt: null } });
    if (!previous) throw new NotFoundException();
    try {
      const destination = await client.destination.update({
        where: { id },
        data: { ...input, ...(input.slug ? { slug: input.slug.toLowerCase() } : {}) },
        select: {
          id: true,
          slug: true,
          name: true,
          country: true,
          region: true,
          category: true,
          status: true,
          updatedAt: true,
        },
      });
      await client.auditLog.create({
        data: { actorId, action: "destinations.updated", entity: "destination", entityId: id },
      });
      return destination;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }

  async setStatus(id: string, status: "PUBLISHED" | "ARCHIVED", actorId: string) {
    const client = await this.db.client();
    const destination = await client.destination
      .update({ where: { id, deletedAt: null }, data: { status }, select: { id: true, status: true, name: true } })
      .catch(() => {
        throw new NotFoundException();
      });
    await client.auditLog.create({
      data: { actorId, action: `destinations.${status.toLowerCase()}`, entity: "destination", entityId: id },
    });
    return destination;
  }
}
