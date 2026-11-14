import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, Optional } from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";
import { DbService } from "../db/db.service";
import { NotificationsService } from "../notifications/notifications.service";
import { notifyCustomer } from "../notifications/notify";
import { PublicCatalogService, type PublicSelection } from "./public-catalog.service";

type RequestInput = PublicSelection & { travelDate?: string; contact: { name: string; email: string; phone: string }; notes?: string; dataConsent: true; marketingConsent?: boolean; idempotencyKey: string; website: string };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base32 = (bytes: Buffer) => [...bytes].map((byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[byte & 31]).join("");
const trackingCode = () => base32(randomBytes(16)).match(/.{1,4}/g)?.join("-") ?? "";

@Injectable()
export class PublicQuotesService {
  constructor(@Inject(DbService) private readonly db: DbService, @Inject(PublicCatalogService) private readonly catalog: PublicCatalogService, @Inject(ENV) private readonly env: ApiEnv, @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService) {}
  private enabled(origin: string | undefined) {
    if (this.env.PUBLIC_QUOTE_REQUESTS_ENABLED !== "true") throw new ServiceUnavailableException("Servicio no disponible");
    if (origin && origin !== this.env.WEB_ORIGIN) throw new ForbiddenException();
  }
  async create(input: RequestInput, ip: string, origin?: string) {
    this.enabled(origin);
    if (input.website) return { reference: "", trackingCode: null, status: "NEW" };
    if (input.travelDate && new Date(`${input.travelDate}T00:00:00.000Z`) <= new Date()) throw new BadRequestException("La fecha debe ser futura");
    const client = await this.db.client();
    const replay = await client.quote.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { reference: true, status: true } });
    if (replay) return { reference: replay.reference, trackingCode: null, status: replay.status };
    const prepared = await this.catalog.pricing(input); const preview = await this.catalog.preview(input);
    const code = trackingCode(); const codeHash = sha256(code); const status = preview.status === "PRICED" ? "NEW" : "REQUIRES_MANUAL_REVIEW";
    try {
      const quote = await client.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { name: input.contact.name, email: input.contact.email.trim().toLowerCase(), phone: input.contact.phone } });
        const legal = await tx.legalDocument.findFirst({ where: { type: "DATA_TREATMENT_AUTHORIZATION", status: "APPROVED", OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }] }, orderBy: { approvedAt: "desc" }, select: { id: true, version: true } });
        if (!legal) throw new ServiceUnavailableException("Servicio no disponible");
        const created = await tx.quote.create({ data: { reference: `PUB-${randomBytes(6).toString("hex").toUpperCase()}`, trackingCodeHash: codeHash, idempotencyKey: input.idempotencyKey, source: "PUBLIC", name: input.contact.name, email: input.contact.email.trim().toLowerCase(), phone: input.contact.phone, travelDate: input.travelDate ? new Date(`${input.travelDate}T00:00:00.000Z`) : null, travelers: input.adults + input.childAges.length, adults: input.adults, children: input.childAges.length, notes: input.notes, dataConsentAt: new Date(), marketingConsentAt: input.marketingConsent ? new Date() : null, customerId: customer.id, destinationId: prepared.pkg.destinationId, packageId: input.packageId, transportOptionId: input.transportOptionId, status, totalCents: preview.totalCents === null ? null : BigInt(preview.totalCents), currency: "COP", pricingVersion: prepared.result.lines[0]?.ruleSetVersion ?? null, priceSnapshot: { selection: { packageId: input.packageId, hotelId: input.hotelId, roomTypeId: input.roomTypeId, transportOptionId: input.transportOptionId, adults: input.adults, childAges: input.childAges, optionalTourIds: input.optionalTourIds, addOnIds: input.addOnIds }, preview }, reviewReasons: preview.reasons, isFictitious: false } });
        await tx.consentRecord.create({ data: { purpose: "DATA_PROCESSING", legalDocumentId: legal.id, legalDocumentVersion: legal.version, granted: true, customerId: customer.id, quoteId: created.id, source: "public_quote", ipHash: sha256(ip) } });
        await notifyCustomer(this.notifications, tx, customer.id, "quote.received", { reference: created.reference }, `quote.received:${created.id}`);
        if (input.marketingConsent) await tx.consentRecord.create({ data: { purpose: "MARKETING", legalDocumentId: legal.id, legalDocumentVersion: legal.version, granted: true, customerId: customer.id, quoteId: created.id, source: "public_quote", ipHash: sha256(ip) } });
        if (prepared.result.lines.length) await tx.quoteLine.createMany({ data: prepared.result.lines.map((line, index) => ({ quoteId: created.id, lineNo: index + 1, kind: index === 0 ? "PACKAGE" : "ADD_ON", priceRuleId: line.priceRuleId, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, totalCents: line.totalCents, breakdown: { ruleSetVersion: line.ruleSetVersion }, pricingVersion: line.ruleSetVersion, isFictitious: false })) });
        await tx.auditLog.create({ data: { action: "quote.public_requested", entity: "quote", entityId: created.id, after: { status } } });
        return created;
      });
      return { reference: quote.reference, trackingCode: code, status: quote.status };
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") { const existing = await client.quote.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { reference: true, status: true } }); if (existing) return { reference: existing.reference, trackingCode: null, status: existing.status }; }
      throw error;
    }
  }
  async track(reference: string, code: string) {
    const client = await this.db.client(); const quote = await client.quote.findFirst({ where: { reference, source: "PUBLIC" }, select: { reference: true, trackingCodeHash: true, status: true, createdAt: true, travelDate: true, totalCents: true, currency: true, package: { select: { title: true } } } });
    const expected = quote?.trackingCodeHash; const actual = sha256(code);
    if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new NotFoundException("No encontrado");
    return { reference: quote.reference, status: quote.status, packageName: quote.package?.title ?? null, createdAt: quote.createdAt, travelDate: quote.travelDate?.toISOString().slice(0, 10) ?? null, totalCents: quote.totalCents?.toString() ?? null, currency: quote.currency };
  }
}
