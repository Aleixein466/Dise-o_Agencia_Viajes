import { calculateDraftQuote, type DraftPriceRule } from "@ricaurte/domain";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

export type QuoteInput = {
  packageId: string;
  hotelId?: string;
  transportOptionId?: string;
  priceRuleId?: string;
  adults: number;
  childAges: number[];
  optionalTourIds: string[];
  addOnIds: string[];
};

const cents = (value: bigint) => value.toString();
@Injectable()
export class AdminQuotesService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async options(packageId: string) {
    const client = await this.db.client();
    const pkg = await client.tourPackage.findFirst({
      where: { id: packageId, deletedAt: null },
      select: {
        id: true,
        title: true,
        destinationId: true,
        durationDays: true,
        components: {
          select: {
            type: true,
            included: true,
            hotel: { select: { id: true, name: true } },
            roomType: { select: { id: true, name: true } },
            tour: { select: { id: true, name: true } },
            transportOption: { select: { id: true, name: true, mode: true } },
            addOn: { select: { id: true, name: true } },
          },
        },
        priceRules: {
          where: { active: false, isFictitious: true },
          select: { id: true, name: true, amountCents: true, unit: true, ruleSetVersion: true, conditions: true },
        },
      },
    });
    if (!pkg) throw new NotFoundException();
    return { ...pkg, priceRules: pkg.priceRules.map((rule) => ({ ...rule, amountCents: cents(rule.amountCents) })) };
  }

  private async pricing(input: QuoteInput) {
    const data = await this.options(input.packageId);
    const hotelIds = new Set(
      data.components.filter((item) => item.type === "HOTEL").flatMap((item) => (item.hotel ? [item.hotel.id] : [])),
    );
    if (input.hotelId && !hotelIds.has(input.hotelId))
      throw new BadRequestException("El hotel no pertenece al paquete");
    const tourIds = new Set(
      data.components
        .filter((item) => item.type === "TOUR" && !item.included)
        .flatMap((item) => (item.tour ? [item.tour.id] : [])),
    );
    if (input.optionalTourIds.some((id) => !tourIds.has(id))) throw new BadRequestException("Tour opcional inválido");
    const addOnIds = new Set(
      data.components.filter((item) => item.type === "ADD_ON").flatMap((item) => (item.addOn ? [item.addOn.id] : [])),
    );
    if (input.addOnIds.some((id) => !addOnIds.has(id))) throw new BadRequestException("Servicio adicional inválido");
    const transportIds = new Set(
      data.components
        .filter((item) => item.type === "TRANSPORT")
        .flatMap((item) => (item.transportOption ? [item.transportOption.id] : [])),
    );
    if (input.transportOptionId && !transportIds.has(input.transportOptionId))
      throw new BadRequestException("Transporte inválido");

    const toRule = (rule: (typeof data.priceRules)[number]): DraftPriceRule | undefined =>
      rule.unit === "PER_PERSON"
        ? {
            id: rule.id,
            description: rule.name,
            amountCents: BigInt(rule.amountCents),
            ruleSetVersion: rule.ruleSetVersion,
            isFictitious: true,
          }
        : undefined;
    const baseSource = input.priceRuleId ? data.priceRules.find((rule) => rule.id === input.priceRuleId) : undefined;
    const baseRule = baseSource ? toRule(baseSource) : undefined;
    const optionalRules: DraftPriceRule[] = [];
    const missingOptionalRuleIds: string[] = [];
    for (const id of [...input.optionalTourIds, ...input.addOnIds]) {
      const rule = data.priceRules.find(
        (item) =>
          item.conditions && typeof item.conditions === "object" && JSON.stringify(item.conditions).includes(id),
      );
      const priced = rule && toRule(rule);
      if (priced) optionalRules.push(priced);
      else missingOptionalRuleIds.push(id);
    }
    const result = calculateDraftQuote({
      adults: input.adults,
      childAges: input.childAges,
      baseRule,
      optionalRules,
      missingOptionalRuleIds,
      transportSelectedWithoutRule: Boolean(input.transportOptionId),
    });
    return { catalog: data, baseSource, result };
  }

  async preview(input: QuoteInput) {
    const { catalog, result } = await this.pricing(input);
    return {
      state: result.state,
      totalCents: result.totalCents === null ? null : cents(result.totalCents),
      reasons: result.reasons,
      currency: "COP",
      pricingVersion: result.lines[0]?.ruleSetVersion ?? null,
      lines: result.lines.map((line) => ({
        ...line,
        unitPriceCents: cents(line.unitPriceCents),
        totalCents: cents(line.totalCents),
      })),
      catalog: {
        packageId: catalog.id,
        destinationId: catalog.destinationId,
        title: catalog.title,
        durationDays: catalog.durationDays,
      },
    };
  }

  async create(input: QuoteInput, actorId: string) {
    const prepared = await this.pricing(input);
    const preview = await this.preview(input);
    const client = await this.db.client();
    const quote = await client.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          reference: `ADM-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
          travelers: input.adults + input.childAges.length,
          adults: input.adults,
          children: input.childAges.length,
          destinationId: prepared.catalog.destinationId,
          packageId: input.packageId,
          transportOptionId: input.transportOptionId,
          createdById: actorId,
          status: preview.state === "CALCULATED" ? "DRAFT" : "REQUIRES_MANUAL_REVIEW",
          totalCents: preview.totalCents === null ? null : BigInt(preview.totalCents),
          currency: "COP",
          pricingVersion: preview.pricingVersion,
          priceSnapshot: { input, preview },
          reviewReasons: preview.reasons,
          isFictitious: true,
        },
      });
      if (prepared.result.lines.length)
        await tx.quoteLine.createMany({
          data: prepared.result.lines.map((line, index) => ({
            quoteId: created.id,
            lineNo: index + 1,
            kind: index === 0 ? "PACKAGE" : "TOUR",
            priceRuleId: line.priceRuleId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            breakdown: { ruleSetVersion: line.ruleSetVersion },
            pricingVersion: line.ruleSetVersion,
            isFictitious: true,
          })),
        });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "quotes.created",
          entity: "quote",
          entityId: created.id,
          after: { state: preview.state, reasons: preview.reasons },
        },
      });
      return created;
    });
    return this.get(quote.id);
  }

  async get(id: string) {
    const client = await this.db.client();
    const quote = await client.quote.findUnique({
      where: { id },
      include: {
        catalogDestination: { select: { name: true } },
        package: { select: { title: true } },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });
    if (!quote) throw new NotFoundException();
    return {
      ...quote,
      totalCents: quote.totalCents?.toString() ?? null,
      lines: quote.lines.map((line) => ({
        ...line,
        unitPriceCents: cents(line.unitPriceCents),
        totalCents: cents(line.totalCents),
      })),
    };
  }

  async list(page: number, pageSize: number, status?: string) {
    const client = await this.db.client();
    const where = { ...(status ? { status: status as "DRAFT" | "REQUIRES_MANUAL_REVIEW" } : {}), isFictitious: true };
    const [total, items] = await client.$transaction([
      client.quote.count({ where }),
      client.quote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          totalCents: true,
          reviewReasons: true,
          createdAt: true,
          updatedAt: true,
          package: { select: { title: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((item) => ({ ...item, totalCents: item.totalCents?.toString() ?? null })),
    };
  }

  async history(id: string) {
    const client = await this.db.client();
    await this.get(id);
    return client.auditLog.findMany({
      where: { entity: "quote", entityId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorId: true, action: true, before: true, after: true, createdAt: true },
    });
  }

  async recalculate(id: string, input: QuoteInput, expectedRevision: number, actorId: string) {
    const current = await this.get(id);
    if (current.status !== "DRAFT" && current.status !== "REQUIRES_MANUAL_REVIEW")
      throw new ConflictException("La cotización ya no es editable");
    const prepared = await this.pricing(input);
    const preview = await this.preview(input);
    const client = await this.db.client();
    await client.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, revision: expectedRevision, status: { in: ["DRAFT", "REQUIRES_MANUAL_REVIEW"] } },
        data: {
          travelers: input.adults + input.childAges.length,
          adults: input.adults,
          children: input.childAges.length,
          transportOptionId: input.transportOptionId,
          status: preview.state === "CALCULATED" ? "DRAFT" : "REQUIRES_MANUAL_REVIEW",
          totalCents: preview.totalCents === null ? null : BigInt(preview.totalCents),
          pricingVersion: preview.pricingVersion,
          priceSnapshot: { input, preview },
          reviewReasons: preview.reasons,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException("La cotización fue modificada por otro usuario");
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      if (prepared.result.lines.length)
        await tx.quoteLine.createMany({
          data: prepared.result.lines.map((line, index) => ({
            quoteId: id,
            lineNo: index + 1,
            kind: index === 0 ? "PACKAGE" : "TOUR",
            priceRuleId: line.priceRuleId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            breakdown: { ruleSetVersion: line.ruleSetVersion },
            pricingVersion: line.ruleSetVersion,
            isFictitious: true,
          })),
        });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "quotes.recalculated",
          entity: "quote",
          entityId: id,
          before: { revision: expectedRevision },
          after: { state: preview.state, reasons: preview.reasons },
        },
      });
    });
    return this.get(id);
  }
}
