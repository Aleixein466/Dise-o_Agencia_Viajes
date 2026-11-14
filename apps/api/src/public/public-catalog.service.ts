import { calculateDraftQuote, isApprovedPublicPriceRule, type DraftPriceRule } from "@ricaurte/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

export type PublicSelection = { packageId: string; hotelId?: string; roomTypeId?: string; transportOptionId?: string; adults: number; childAges: number[]; optionalTourIds: string[]; addOnIds: string[] };
const jsonStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const ruleSelect = { id: true, name: true, amountCents: true, unit: true, ruleSetVersion: true, active: true, isFictitious: true, validFrom: true, validTo: true, conditions: true, transportOptionId: true, tourId: true, addOnId: true } as const;
const publicReasons: Record<string, string> = { BASE_RATE_REQUIRED: "Falta una tarifa aprobada para el paquete", CHILD_PRICE_RULE_REQUIRED: "Se requiere revisión manual para menores", TRANSPORT_PRICE_RULE_REQUIRED: "Falta una tarifa aprobada para el transporte" };

@Injectable()
export class PublicCatalogService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async destinations() {
    const client = await this.db.client();
    const rows = await client.destination.findMany({ where: { status: "PUBLISHED", deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, description: true, packages: { where: { status: "PUBLISHED", deletedAt: null }, select: { id: true, slug: true, title: true, durationDays: true } } } });
    return rows.map((d) => ({ id: d.id, slug: d.slug, name: d.name, summary: d.description, packages: d.packages.map((p) => ({ id: p.id, slug: p.slug, name: p.title, durationDays: p.durationDays, durationNights: null })) }));
  }
  async builder(id: string) {
    const client = await this.db.client();
    const pkg = await client.tourPackage.findFirst({ where: { id, status: "PUBLISHED", deletedAt: null }, select: { id: true, slug: true, title: true, durationDays: true, includes: true, excludes: true, destination: { select: { name: true } }, components: { orderBy: { sortOrder: "asc" }, select: { type: true, included: true, hotel: { select: { id: true, name: true, status: true, deletedAt: true, roomTypes: { where: { active: true, deletedAt: null }, select: { id: true, name: true, maxOccupancy: true } } }, }, transportOption: { select: { id: true, mode: true, name: true, active: true, deletedAt: true } }, tour: { select: { id: true, name: true, description: true, status: true, deletedAt: true } }, addOn: { select: { id: true, name: true, active: true, deletedAt: true } } } }, priceRules: { select: { active: true, isFictitious: true, validFrom: true, validTo: true } } } });
    if (!pkg) throw new NotFoundException();
    const hotels = pkg.components.flatMap((c) => c.hotel && c.hotel.status === "PUBLISHED" && !c.hotel.deletedAt ? [{ id: c.hotel.id, name: c.hotel.name, roomTypes: c.hotel.roomTypes.map((r) => ({ id: r.id, name: r.name, occupancy: r.maxOccupancy ?? null })) }] : []);
    return { package: { id: pkg.id, slug: pkg.slug, name: pkg.title, destinationName: pkg.destination.name, durationDays: pkg.durationDays, durationNights: null, inclusions: jsonStrings(pkg.includes), exclusions: jsonStrings(pkg.excludes) }, hotels, transportOptions: pkg.components.flatMap((c) => c.transportOption && c.transportOption.active && !c.transportOption.deletedAt ? [{ id: c.transportOption.id, mode: c.transportOption.mode, label: c.transportOption.name }] : []), optionalTours: pkg.components.flatMap((c) => c.tour && !c.included && c.tour.status === "PUBLISHED" && !c.tour.deletedAt ? [{ id: c.tour.id, name: c.tour.name, description: c.tour.description }] : []), addOns: pkg.components.flatMap((c) => c.addOn && c.addOn.active && !c.addOn.deletedAt ? [{ id: c.addOn.id, name: c.addOn.name }] : []), pricingAvailable: pkg.priceRules.some((rule) => isApprovedPublicPriceRule(rule)) };
  }
  async pricing(input: PublicSelection) {
    const client = await this.db.client(); const now = new Date();
    const pkg = await client.tourPackage.findFirst({ where: { id: input.packageId, status: "PUBLISHED", deletedAt: null }, select: { id: true, title: true, destinationId: true, priceRules: { select: ruleSelect }, components: { select: { type: true, included: true, hotelId: true, transportOptionId: true, tourId: true, addOnId: true, hotel: { select: { roomTypes: { where: { active: true, deletedAt: null }, select: { id: true } } } } } } } });
    if (!pkg) throw new NotFoundException();
    const has = (field: "hotelId" | "transportOptionId" | "tourId" | "addOnId", id: string) => pkg.components.some((c) => c[field] === id && (field !== "tourId" || !c.included));
    // A room type is valid when it belongs to one of the package's hotels (and to the chosen hotel, if any).
    const roomOk = (id: string) => pkg.components.some((c) => c.hotel?.roomTypes.some((r) => r.id === id) && (!input.hotelId || c.hotelId === input.hotelId));
    if (input.hotelId && !has("hotelId", input.hotelId)) throw new BadRequestException("Selección inválida");
    if (input.roomTypeId && !roomOk(input.roomTypeId)) throw new BadRequestException("Selección inválida");
    if (input.transportOptionId && !has("transportOptionId", input.transportOptionId)) throw new BadRequestException("Selección inválida");
    if (input.optionalTourIds.some((id) => !has("tourId", id)) || input.addOnIds.some((id) => !has("addOnId", id))) throw new BadRequestException("Selección inválida");
    // A price rule has exactly one target (DB check price_rules_target_valid): tour/transport/add-on rules are not
    // package rows, so they are loaded by their own ids.
    const targeted = input.transportOptionId || input.optionalTourIds.length || input.addOnIds.length
      ? await client.priceRule.findMany({ where: { OR: [...(input.transportOptionId ? [{ transportOptionId: input.transportOptionId }] : []), ...(input.optionalTourIds.length ? [{ tourId: { in: input.optionalTourIds } }] : []), ...(input.addOnIds.length ? [{ addOnId: { in: input.addOnIds } }] : [])] }, select: ruleSelect })
      : [];
    const approved = <T extends Parameters<typeof isApprovedPublicPriceRule>[0]>(list: T[]) => list.filter((rule) => isApprovedPublicPriceRule(rule, now));
    const packageRules = approved(pkg.priceRules);
    const rules = approved(targeted);
    type Row = (typeof packageRules)[number];
    const asRule = (rule: Row | undefined): DraftPriceRule | undefined => rule && (rule.unit === "PER_PERSON" || rule.unit === "PER_BOOKING") ? { id: rule.id, description: rule.name, amountCents: rule.amountCents, ruleSetVersion: rule.ruleSetVersion, isFictitious: false, unit: rule.unit } : undefined;
    const by = (field: "transportOptionId" | "tourId" | "addOnId", id: string) => rules.find((rule) => rule[field] === id);
    // Base: the approved package rate bound to the chosen accommodation (conditions.roomTypeId); otherwise the single
    // approved unbound package rate. Several unbound candidates are ambiguous and go to manual review — never guessed.
    const boundRoom = (rule: Row) => (rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions) ? (rule.conditions as Record<string, unknown>).roomTypeId : undefined);
    const forRoom = input.roomTypeId ? packageRules.filter((r) => boundRoom(r) === input.roomTypeId) : [];
    const unbound = packageRules.filter((r) => !boundRoom(r));
    const baseRule = asRule(forRoom.length === 1 ? forRoom[0] : forRoom.length === 0 && unbound.length === 1 ? unbound[0] : undefined);
    const transportRule = input.transportOptionId ? by("transportOptionId", input.transportOptionId) : undefined;
    const extras = [...input.optionalTourIds.map((id) => ["tourId", id] as const), ...input.addOnIds.map((id) => ["addOnId", id] as const)];
    const optionalRules = [transportRule, ...extras.map(([field, id]) => by(field, id))].map(asRule).filter((r): r is DraftPriceRule => Boolean(r));
    const missing = extras.filter(([field, id]) => !asRule(by(field, id))).map(([, id]) => id);
    const result = calculateDraftQuote({ adults: input.adults, childAges: input.childAges, baseRule, optionalRules, missingOptionalRuleIds: missing, transportSelectedWithoutRule: Boolean(input.transportOptionId && !asRule(transportRule)) });
    return { pkg, result };
  }
  async preview(input: PublicSelection) {
    const { result } = await this.pricing(input);
    return { status: result.state === "CALCULATED" ? "PRICED" : "REQUIRES_MANUAL_REVIEW", currency: "COP", totalCents: result.totalCents?.toString() ?? null, lines: result.lines.map((line) => ({ label: line.description, quantity: line.quantity, unitAmountCents: line.unitPriceCents.toString(), totalCents: line.totalCents.toString() })), reasons: result.reasons.map((reason) => publicReasons[reason] ?? (reason.startsWith("OPTIONAL_PRICE_RULE_REQUIRED") ? "Falta una tarifa aprobada para una opción seleccionada" : "Se requiere revisión manual")) };
  }
}
