import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

const packageSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  durationDays: true,
  status: true,
  includes: true,
  excludes: true,
  updatedAt: true,
  destination: { select: { id: true, name: true, slug: true } },
  itinerary: { orderBy: { day: "asc" as const }, select: { id: true, day: true, title: true, description: true } },
  components: {
    where: { hotelId: { not: null } },
    select: { hotel: { select: { id: true, name: true, slug: true } } },
  },
  priceRules: {
    where: { active: false },
    select: { id: true, name: true, amountCents: true, currency: true, conditions: true, updatedAt: true },
  },
};
function page(total: number, value: number, size: number) {
  return { total, page: value, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) };
}

@Injectable()
export class CatalogAdminService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async packages(query: string | undefined, destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(destinationId ? { destinationId } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { slug: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await client.$transaction([
      client.tourPackage.count({ where }),
      client.tourPackage.findMany({
        where,
        select: packageSelect,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        priceRules: row.priceRules.map((rate) => ({ ...rate, amountCents: rate.amountCents.toString() })),
        hotels: row.components.flatMap((c) => (c.hotel ? [c.hotel] : [])),
      })),
      ...page(total, current, pageSize),
    };
  }
  async packageDetail(id: string) {
    const client = await this.db.client();
    const row = await client.tourPackage.findFirst({ where: { id, deletedAt: null }, select: packageSelect });
    if (!row) throw new NotFoundException();
    return {
      ...row,
      priceRules: row.priceRules.map((rate) => ({ ...rate, amountCents: rate.amountCents.toString() })),
      hotels: row.components.flatMap((c) => (c.hotel ? [c.hotel] : [])),
    };
  }
  async createPackage(
    input: { destinationId: string; slug: string; title: string; durationDays: number; hotelIds: string[] },
    actorId: string,
  ) {
    const client = await this.db.client();
    try {
      const created = await client.$transaction(async (tx) => {
        const destination = await tx.destination.findFirst({
          where: { id: input.destinationId, deletedAt: null },
          select: { id: true },
        });
        if (!destination) throw new NotFoundException();
        const hotels = await tx.hotel.findMany({
          where: { id: { in: input.hotelIds }, destinationId: input.destinationId, deletedAt: null },
          select: { id: true },
        });
        if (hotels.length !== input.hotelIds.length) throw new NotFoundException();
        const pkg = await tx.tourPackage.create({
          data: {
            destinationId: input.destinationId,
            slug: input.slug,
            title: input.title,
            durationDays: input.durationDays,
            status: "DRAFT",
            isFictitious: true,
          },
        });
        if (hotels.length)
          await tx.packageComponent.createMany({
            data: hotels.map((hotel, sortOrder) => ({
              packageId: pkg.id,
              type: "HOTEL",
              hotelId: hotel.id,
              included: true,
              sortOrder,
            })),
          });
        await tx.auditLog.create({
          data: { actorId, action: "packages.created", entity: "package", entityId: pkg.id },
        });
        return pkg;
      });
      return this.packageDetail(created.id);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
  async updatePackage(
    id: string,
    input: {
      title?: string;
      summary?: string;
      description?: string;
      includes?: string[];
      excludes?: string[];
      itinerary?: { day: number; title: string; description: string }[];
    },
    actorId: string,
  ) {
    const client = await this.db.client();
    const exists = await client.tourPackage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException();
    await client.$transaction(async (tx) => {
      await tx.tourPackage.update({ where: { id }, data: { ...input, itinerary: undefined } });
      if (input.itinerary)
        for (const item of input.itinerary)
          await tx.itineraryDay.upsert({
            where: { packageId_day: { packageId: id, day: item.day } },
            update: { title: item.title, description: item.description },
            create: { packageId: id, ...item },
          });
      await tx.auditLog.create({ data: { actorId, action: "packages.updated", entity: "package", entityId: id } });
    });
    return this.packageDetail(id);
  }
  async hotels(query: string | undefined, destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = {
      deletedAt: null,
      ...(destinationId ? { destinationId } : {}),
      ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
    };
    const [total, items] = await client.$transaction([
      client.hotel.count({ where }),
      client.hotel.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          stars: true,
          status: true,
          destination: { select: { id: true, name: true } },
          roomTypes: { where: { deletedAt: null }, select: { id: true, name: true, maxOccupancy: true } },
        },
      }),
    ]);
    return { items, ...page(total, current, pageSize) };
  }
  async createHotel(input: { destinationId: string; slug: string; name: string; stars?: number }, actorId: string) {
    const client = await this.db.client();
    try {
      const hotel = await client.hotel.create({
        data: { ...input, status: "DRAFT" },
        select: { id: true, name: true },
      });
      await client.auditLog.create({
        data: { actorId, action: "hotels.created", entity: "hotel", entityId: hotel.id },
      });
      return hotel;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
  async updateHotel(
    id: string,
    input: { name?: string; description?: string; stars?: number | null },
    actorId: string,
  ) {
    const client = await this.db.client();
    const hotel = await client.hotel
      .update({ where: { id }, data: input, select: { id: true, name: true } })
      .catch(() => {
        throw new NotFoundException();
      });
    await client.auditLog.create({ data: { actorId, action: "hotels.updated", entity: "hotel", entityId: id } });
    return hotel;
  }
  async updateRate(id: string, amountCents: bigint, actorId: string) {
    const client = await this.db.client();
    const old = await client.priceRule.findFirst({
      where: { id, active: false, isFictitious: true },
      select: { id: true, amountCents: true },
    });
    if (!old) throw new NotFoundException();
    const rate = await client.priceRule.update({
      where: { id },
      data: { amountCents },
      select: { id: true, amountCents: true, updatedAt: true },
    });
    await client.auditLog.create({
      data: {
        actorId,
        action: "pricing.draft_updated",
        entity: "price_rule",
        entityId: id,
        before: { amountCents: old.amountCents.toString() },
        after: { amountCents: amountCents.toString() },
      },
    });
    return { ...rate, amountCents: rate.amountCents.toString() };
  }
  async rateHistory(id: string) {
    const client = await this.db.client();
    return client.auditLog.findMany({
      where: { entity: "price_rule", entityId: id, action: "pricing.draft_updated" },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, before: true, after: true, createdAt: true },
    });
  }
  async tours(destinationId: string | undefined, current: number, pageSize: number) {
    const client = await this.db.client();
    const where = { deletedAt: null, ...(destinationId ? { destinationId } : {}) };
    const [total, items] = await client.$transaction([
      client.tour.count({ where }),
      client.tour.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (current - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          summary: true,
          status: true,
          destination: { select: { name: true } },
          packageComponents: { select: { package: { select: { title: true } }, included: true } },
        },
      }),
    ]);
    return { items, ...page(total, current, pageSize) };
  }
  async createTour(
    input: {
      destinationId: string;
      slug: string;
      name: string;
      summary?: string;
      packageId?: string;
      included: boolean;
    },
    actorId: string,
  ) {
    const client = await this.db.client();
    try {
      const tour = await client.$transaction(async (tx) => {
        const created = await tx.tour.create({
          data: {
            destinationId: input.destinationId,
            slug: input.slug,
            name: input.name,
            summary: input.summary,
            status: "DRAFT",
          },
        });
        if (input.packageId)
          await tx.packageComponent.create({
            data: { packageId: input.packageId, type: "TOUR", tourId: created.id, included: input.included },
          });
        await tx.auditLog.create({ data: { actorId, action: "tours.created", entity: "tour", entityId: created.id } });
        return created;
      });
      return tour;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException();
      throw error;
    }
  }
}
