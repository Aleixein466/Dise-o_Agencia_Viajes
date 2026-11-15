import {
  calculateCommercialQuote,
  isApprovedPublicPriceRule,
  promotionRejection,
  type AgeBand,
  type CommercialPricing,
  type CommercialRule,
  type PricedItem,
  type PromotionOffer,
  type PromotionRejection,
} from "@ricaurte/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

export type PublicSelection = {
  packageId: string;
  hotelId?: string;
  roomTypeId?: string;
  transportOptionId?: string;
  adults: number;
  childAges: number[];
  optionalTourIds: string[];
  addOnIds: string[];
  travelDate?: string;
  promotionCode?: string;
};
const jsonStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const ruleSelect = {
  id: true,
  name: true,
  amountCents: true,
  unit: true,
  ruleSetVersion: true,
  active: true,
  isFictitious: true,
  validFrom: true,
  validTo: true,
  conditions: true,
  transportOptionId: true,
  tourId: true,
  addOnId: true,
  priority: true,
  seasonId: true,
  ageRuleId: true,
  occupancy: true,
  minTravelers: true,
  maxTravelers: true,
  season: {
    select: { id: true, startsOn: true, endsOn: true, isFictitious: true, active: true, destinationId: true, packageId: true },
  },
  ageRule: { select: { id: true, isFictitious: true, active: true } },
} as const;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const publicReasons: Record<string, string> = {
  BASE_RATE_REQUIRED: "Falta una tarifa aprobada para el paquete",
  CHILD_PRICE_RULE_REQUIRED: "Se requiere revisión manual para menores",
  CHILD_AGE_INVALID: "La edad indicada para un menor no es válida",
  ADULT_COUNT_INVALID: "El número de adultos no es válido",
  AGE_RULE_AMBIGUOUS: "Un asesor debe confirmar la categoría de edad de un menor",
  AGE_RULE_BASIS_UNSUPPORTED: "La tarifa para menores depende de la estatura: un asesor la confirmará",
  TRANSPORT_PRICE_RULE_REQUIRED: "Falta una tarifa aprobada para el transporte",
  TRAVEL_DATE_REQUIRED: "Indica tu fecha tentativa de viaje: la tarifa depende de la temporada",
  PRICE_RULE_AMBIGUOUS: "Hay varias tarifas posibles: un asesor confirmará el valor",
  OCCUPANCY_EXCEEDED: "El grupo supera la capacidad de la acomodación elegida: un asesor propondrá la distribución",
};
const publicNotices: Record<string, string> = {
  PROMOTION_CODE_INVALID: "El código promocional no es válido o no aplica para este viaje",
  // Same public text as an invalid code: an exhausted code must not confirm that it exists (internal code kept).
  PROMOTION_EXHAUSTED: "El código promocional no es válido o no aplica para este viaje",
  PROMOTION_REQUIRES_REVIEW: "El código promocional se evaluará cuando un asesor confirme la tarifa",
};

@Injectable()
export class PublicCatalogService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async destinations() {
    const client = await this.db.client();
    const rows = await client.destination.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        packages: {
          where: { status: "PUBLISHED", deletedAt: null },
          select: { id: true, slug: true, title: true, durationDays: true },
        },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      summary: d.description,
      packages: d.packages.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.title,
        durationDays: p.durationDays,
        durationNights: null,
      })),
    }));
  }
  async builder(id: string) {
    const client = await this.db.client();
    const pkg = await client.tourPackage.findFirst({
      where: { id, status: "PUBLISHED", deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        durationDays: true,
        includes: true,
        excludes: true,
        destination: { select: { name: true } },
        components: {
          orderBy: { sortOrder: "asc" },
          select: {
            type: true,
            included: true,
            hotel: {
              select: {
                id: true,
                name: true,
                status: true,
                deletedAt: true,
                roomTypes: {
                  where: { active: true, deletedAt: null },
                  select: { id: true, name: true, maxOccupancy: true },
                },
              },
            },
            transportOption: { select: { id: true, mode: true, name: true, active: true, deletedAt: true } },
            tour: { select: { id: true, name: true, description: true, status: true, deletedAt: true } },
            addOn: { select: { id: true, name: true, active: true, deletedAt: true } },
          },
        },
        priceRules: { select: { active: true, isFictitious: true, validFrom: true, validTo: true } },
      },
    });
    if (!pkg) throw new NotFoundException();
    const hotels = pkg.components.flatMap((c) =>
      c.hotel && c.hotel.status === "PUBLISHED" && !c.hotel.deletedAt
        ? [
            {
              id: c.hotel.id,
              name: c.hotel.name,
              roomTypes: c.hotel.roomTypes.map((r) => ({ id: r.id, name: r.name, occupancy: r.maxOccupancy ?? null })),
            },
          ]
        : [],
    );
    return {
      package: {
        id: pkg.id,
        slug: pkg.slug,
        name: pkg.title,
        destinationName: pkg.destination.name,
        durationDays: pkg.durationDays,
        durationNights: null,
        inclusions: jsonStrings(pkg.includes),
        exclusions: jsonStrings(pkg.excludes),
      },
      hotels,
      transportOptions: pkg.components.flatMap((c) =>
        c.transportOption && c.transportOption.active && !c.transportOption.deletedAt
          ? [{ id: c.transportOption.id, mode: c.transportOption.mode, label: c.transportOption.name }]
          : [],
      ),
      optionalTours: pkg.components.flatMap((c) =>
        c.tour && !c.included && c.tour.status === "PUBLISHED" && !c.tour.deletedAt
          ? [{ id: c.tour.id, name: c.tour.name, description: c.tour.description }]
          : [],
      ),
      addOns: pkg.components.flatMap((c) =>
        c.addOn && c.addOn.active && !c.addOn.deletedAt ? [{ id: c.addOn.id, name: c.addOn.name }] : [],
      ),
      pricingAvailable: pkg.priceRules.some((rule) => isApprovedPublicPriceRule(rule)),
    };
  }
  async pricing(input: PublicSelection, options: { dropPromotion?: PromotionRejection } = {}) {
    const client = await this.db.client();
    const now = new Date();
    const pkg = await client.tourPackage.findFirst({
      where: { id: input.packageId, status: "PUBLISHED", deletedAt: null },
      select: {
        id: true,
        title: true,
        destinationId: true,
        priceRules: { select: ruleSelect },
        components: {
          select: {
            type: true,
            included: true,
            hotelId: true,
            transportOptionId: true,
            tourId: true,
            addOnId: true,
            hotel: {
              select: {
                roomTypes: { where: { active: true, deletedAt: null }, select: { id: true, maxOccupancy: true } },
              },
            },
          },
        },
      },
    });
    if (!pkg) throw new NotFoundException();
    const has = (field: "hotelId" | "transportOptionId" | "tourId" | "addOnId", id: string) =>
      pkg.components.some((c) => c[field] === id && (field !== "tourId" || !c.included));
    // A room type is valid when it belongs to one of the package's hotels (and to the chosen hotel, if any).
    const room = input.roomTypeId
      ? pkg.components.flatMap((c) =>
          (!input.hotelId || c.hotelId === input.hotelId) && c.hotel
            ? c.hotel.roomTypes.filter((r) => r.id === input.roomTypeId)
            : [],
        )[0]
      : undefined;
    if (input.hotelId && !has("hotelId", input.hotelId)) throw new BadRequestException("Selección inválida");
    if (input.roomTypeId && !room) throw new BadRequestException("Selección inválida");
    if (input.transportOptionId && !has("transportOptionId", input.transportOptionId))
      throw new BadRequestException("Selección inválida");
    if (input.optionalTourIds.some((id) => !has("tourId", id)) || input.addOnIds.some((id) => !has("addOnId", id)))
      throw new BadRequestException("Selección inválida");
    // A price rule has exactly one target (DB check price_rules_target_valid): tour/transport/add-on rules are not
    // package rows, so they are loaded by their own ids.
    const targeted =
      input.transportOptionId || input.optionalTourIds.length || input.addOnIds.length
        ? await client.priceRule.findMany({
            where: {
              OR: [
                ...(input.transportOptionId ? [{ transportOptionId: input.transportOptionId }] : []),
                ...(input.optionalTourIds.length ? [{ tourId: { in: input.optionalTourIds } }] : []),
                ...(input.addOnIds.length ? [{ addOnId: { in: input.addOnIds } }] : []),
              ],
            },
            select: ruleSelect,
          })
        : [];
    type Row = (typeof pkg.priceRules)[number];
    // Approved: active, real, inside its sale window, and bound only to a real season of this destination / a real age rule.
    const usable = (rule: Row) =>
      isApprovedPublicPriceRule(rule, now) &&
      (rule.unit === "PER_PERSON" || rule.unit === "PER_BOOKING") &&
      (!rule.seasonId ||
        (!!rule.season &&
          !rule.season.isFictitious &&
          rule.season.active &&
          (!rule.season.destinationId || rule.season.destinationId === pkg.destinationId) &&
          (!rule.season.packageId || rule.season.packageId === pkg.id))) &&
      (!rule.ageRuleId || (!!rule.ageRule && !rule.ageRule.isFictitious && rule.ageRule.active));
    const boundRoom = (rule: Row) => {
      const value =
        rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions)
          ? (rule.conditions as Record<string, unknown>).roomTypeId
          : undefined;
      return typeof value === "string" ? value : null;
    };
    const toRule = (rule: Row): CommercialRule => ({
      id: rule.id,
      description: rule.name,
      amountCents: rule.amountCents,
      ruleSetVersion: rule.ruleSetVersion,
      unit: rule.unit === "PER_BOOKING" ? "PER_BOOKING" : "PER_PERSON",
      priority: rule.priority,
      roomTypeId: boundRoom(rule),
      season: rule.season
        ? { id: rule.season.id, startsOn: dateOnly(rule.season.startsOn), endsOn: dateOnly(rule.season.endsOn) }
        : null,
      ageRuleId: rule.ageRuleId,
      occupancy: rule.occupancy,
      minTravelers: rule.minTravelers,
      maxTravelers: rule.maxTravelers,
    });
    const rulesFor = (list: Row[]) => list.filter(usable).map(toRule);
    const items: PricedItem[] = [
      { kind: "PACKAGE", targetId: pkg.id, rules: rulesFor(pkg.priceRules) },
      ...(input.transportOptionId
        ? [
            {
              kind: "TRANSPORT" as const,
              targetId: input.transportOptionId,
              rules: rulesFor(targeted.filter((r) => r.transportOptionId === input.transportOptionId)),
            },
          ]
        : []),
      ...input.optionalTourIds.map((id) => ({
        kind: "TOUR" as const,
        targetId: id,
        rules: rulesFor(targeted.filter((r) => r.tourId === id)),
      })),
      ...input.addOnIds.map((id) => ({
        kind: "ADD_ON" as const,
        targetId: id,
        rules: rulesFor(targeted.filter((r) => r.addOnId === id)),
      })),
    ];
    const ageRules = input.childAges.length
      ? await client.ageRule.findMany({
          where: {
            isFictitious: false,
            active: true,
            tourId: null,
            OR: [
              { packageId: pkg.id },
              { packageId: null, destinationId: pkg.destinationId },
              { packageId: null, destinationId: null },
            ],
          },
          select: {
            id: true,
            category: true,
            basis: true,
            minValue: true,
            maxValue: true,
            packageId: true,
            destinationId: true,
          },
        })
      : [];
    const ageBands: AgeBand[] = ageRules.map((a) => ({
      id: a.id,
      category: a.category,
      basis: a.basis,
      minValue: a.minValue,
      maxValue: a.maxValue,
      scope: a.packageId ? "PACKAGE" : a.destinationId ? "DESTINATION" : "GLOBAL",
    }));
    const { promotion, notices } = await this.promotion(
      client,
      input.promotionCode,
      { now, packageId: pkg.id, destinationId: pkg.destinationId },
      options.dropPromotion,
    );
    const result = calculateCommercialQuote({
      adults: input.adults,
      childAges: input.childAges,
      travelDate: input.travelDate,
      roomTypeId: input.roomTypeId,
      roomMaxOccupancy: room?.maxOccupancy ?? null,
      ageBands,
      items,
      promotion,
      notices,
    });
    return { pkg, result };
  }
  /** Resolves a customer-entered code. Any problem is a non-blocking notice, never a pricing failure. */
  private async promotion(
    client: Awaited<ReturnType<DbService["client"]>>,
    raw: string | undefined,
    ctx: { now: Date; packageId: string; destinationId: string },
    drop?: PromotionRejection,
  ): Promise<{ promotion?: PromotionOffer; notices: string[] }> {
    const code = raw?.trim().toUpperCase();
    if (!code) return { notices: [] };
    if (drop) return { notices: [drop] };
    if (!/^[A-Z0-9_-]{1,40}$/.test(code)) return { notices: ["PROMOTION_CODE_INVALID"] };
    const rows = await client.promotion.findMany({
      where: { code: { equals: code, mode: "insensitive" } },
      take: 2,
      select: {
        id: true,
        code: true,
        name: true,
        discountType: true,
        percentBps: true,
        amountOffCents: true,
        startsAt: true,
        endsAt: true,
        maxRedemptions: true,
        redemptionCount: true,
        packageId: true,
        destinationId: true,
        active: true,
        isFictitious: true,
      },
    });
    const row = rows.length === 1 ? rows[0] : undefined;
    const rejection = row ? promotionRejection(row, ctx) : "PROMOTION_CODE_INVALID";
    if (!row || rejection) return { notices: [rejection ?? "PROMOTION_CODE_INVALID"] };
    return {
      promotion: {
        id: row.id,
        code: row.code ?? code,
        name: row.name,
        discountType: row.discountType,
        percentBps: row.percentBps,
        amountOffCents: row.amountOffCents,
      },
      notices: [],
    };
  }
  present(result: CommercialPricing) {
    const text = (reason: string) =>
      publicReasons[reason] ??
      (reason.startsWith("OPTIONAL_PRICE_RULE_REQUIRED")
        ? "Falta una tarifa aprobada para una opción seleccionada"
        : "Se requiere revisión manual");
    return {
      status: result.state === "CALCULATED" ? "PRICED" : "REQUIRES_MANUAL_REVIEW",
      currency: "COP",
      totalCents: result.totalCents?.toString() ?? null,
      lines: result.lines.map((line) => ({
        label: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitPriceCents.toString(),
        totalCents: line.totalCents.toString(),
      })),
      reasons: [...new Set(result.reasons.map(text))],
      travelDateRequired: result.reasons.includes("TRAVEL_DATE_REQUIRED"),
      notices: result.notices.map((notice) => publicNotices[notice] ?? "El código promocional no se aplicó"),
      promotion: result.appliedPromotion
        ? {
            code: result.appliedPromotion.code,
            name: result.appliedPromotion.name,
            discountCents: result.appliedPromotion.discountCents.toString(),
          }
        : null,
    };
  }
  async preview(input: PublicSelection) {
    const { result } = await this.pricing(input);
    return this.present(result);
  }
}
