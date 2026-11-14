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
      select: { id: true },
    });
    if (!old) throw new NotFoundException();
    const rate = await client.priceRule.update({
      where: { id },
      data: { amountCents },
      select: { id: true, amountCents: true, updatedAt: true },
    });
    await client.auditLog.create({
      data: { actorId, action: "pricing.draft_updated", entity: "price_rule", entityId: id },
    });
    return { ...rate, amountCents: rate.amountCents.toString() };
  }
}
