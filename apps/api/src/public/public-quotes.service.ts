import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Optional,
} from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";
import { DbService } from "../db/db.service";
import { NotificationsService } from "../notifications/notifications.service";
import { notifyCustomer } from "../notifications/notify";
import { PublicCatalogService, type PublicSelection } from "./public-catalog.service";

type RequestInput = PublicSelection & {
  contact: { name: string; email: string; phone: string };
  notes?: string;
  dataConsent: true;
  marketingConsent?: boolean;
  idempotencyKey: string;
  website: string;
};
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base32 = (bytes: Buffer) => [...bytes].map((byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[byte & 31]).join("");
const trackingCode = () =>
  base32(randomBytes(16))
    .match(/.{1,4}/g)
    ?.join("-") ?? "";
/** Raised inside the request transaction when the conditional redemption update matched no row. */
class PromotionExhausted extends Error {}

@Injectable()
export class PublicQuotesService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(PublicCatalogService) private readonly catalog: PublicCatalogService,
    @Inject(ENV) private readonly env: ApiEnv,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}
  private enabled(origin: string | undefined) {
    if (this.env.PUBLIC_QUOTE_REQUESTS_ENABLED !== "true")
      throw new ServiceUnavailableException("Servicio no disponible");
    if (origin && origin !== this.env.WEB_ORIGIN) throw new ForbiddenException();
  }
  async create(input: RequestInput, ip: string, origin?: string) {
    this.enabled(origin);
    if (input.website) return { reference: "", trackingCode: null, status: "NEW" };
    if (input.travelDate && new Date(`${input.travelDate}T00:00:00.000Z`) <= new Date())
      throw new BadRequestException("La fecha debe ser futura");
    const client = await this.db.client();
    const replay = await client.quote.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { reference: true, status: true },
    });
    if (replay) return { reference: replay.reference, trackingCode: null, status: replay.status };
    let prepared = await this.catalog.pricing(input);
    const code = trackingCode();
    const codeHash = sha256(code);
    for (;;) {
      try {
        const quote = await this.persist(client, input, ip, codeHash, prepared);
        return { reference: quote.reference, trackingCode: code, status: quote.status };
      } catch (error: unknown) {
        // The promotion ran out between preview and commit: price again without it (never fail the request).
        if (error instanceof PromotionExhausted && prepared.result.appliedPromotion) {
          prepared = await this.catalog.pricing(input, { dropPromotion: "PROMOTION_EXHAUSTED" });
          continue;
        }
        if ((error as { code?: string }).code === "P2002") {
          const existing = await client.quote.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: { reference: true, status: true },
          });
          if (existing) return { reference: existing.reference, trackingCode: null, status: existing.status };
        }
        throw error;
      }
    }
  }
  private persist(
    client: Awaited<ReturnType<DbService["client"]>>,
    input: RequestInput,
    ip: string,
    codeHash: string,
    prepared: Awaited<ReturnType<PublicCatalogService["pricing"]>>,
  ) {
    const { result } = prepared;
    const preview = this.catalog.present(result);
    const applied = result.appliedPromotion;
    const status = result.state === "CALCULATED" ? "NEW" : "REQUIRES_MANUAL_REVIEW";
    return client.$transaction(async (tx) => {
      if (applied) {
        // Atomic, conditional redemption: counted only while the promotion is still valid, in scope and below its cap.
        const now = new Date();
        const redeemed =
          await tx.$executeRaw`UPDATE "promotions" SET "redemption_count" = "redemption_count" + 1, "updated_at" = ${now} WHERE "id" = ${applied.id}::uuid AND "active" AND NOT "is_fictitious" AND "starts_at" <= ${now} AND "ends_at" >= ${now} AND ("max_redemptions" IS NULL OR "redemption_count" < "max_redemptions") AND ("package_id" IS NULL OR "package_id" = ${prepared.pkg.id}::uuid) AND ("destination_id" IS NULL OR "destination_id" = ${prepared.pkg.destinationId}::uuid)`;
        if (redeemed !== 1) throw new PromotionExhausted();
      }
      const customer = await tx.customer.create({
        data: { name: input.contact.name, email: input.contact.email.trim().toLowerCase(), phone: input.contact.phone },
      });
      const legal = await tx.legalDocument.findFirst({
        where: {
          type: "DATA_TREATMENT_AUTHORIZATION",
          status: "APPROVED",
          OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }],
        },
        orderBy: { approvedAt: "desc" },
        select: { id: true, version: true },
      });
      if (!legal) throw new ServiceUnavailableException("Servicio no disponible");
      const promotion = applied
        ? {
            id: applied.id,
            code: applied.code,
            name: applied.name,
            discountType: applied.discountType,
            percentBps: applied.percentBps,
            amountOffCents: applied.amountOffCents?.toString() ?? null,
            discountCents: applied.discountCents.toString(),
          }
        : null;
      const created = await tx.quote.create({
        data: {
          reference: `PUB-${randomBytes(6).toString("hex").toUpperCase()}`,
          trackingCodeHash: codeHash,
          idempotencyKey: input.idempotencyKey,
          source: "PUBLIC",
          name: input.contact.name,
          email: input.contact.email.trim().toLowerCase(),
          phone: input.contact.phone,
          travelDate: input.travelDate ? new Date(`${input.travelDate}T00:00:00.000Z`) : null,
          travelers: input.adults + input.childAges.length,
          adults: input.adults,
          children: input.childAges.length,
          notes: input.notes,
          dataConsentAt: new Date(),
          marketingConsentAt: input.marketingConsent ? new Date() : null,
          customerId: customer.id,
          destinationId: prepared.pkg.destinationId,
          packageId: input.packageId,
          transportOptionId: input.transportOptionId,
          status,
          totalCents: result.totalCents,
          currency: "COP",
          pricingVersion: result.lines[0]?.ruleSetVersion ?? null,
          priceSnapshot: {
            selection: {
              packageId: input.packageId,
              hotelId: input.hotelId,
              roomTypeId: input.roomTypeId,
              transportOptionId: input.transportOptionId,
              adults: input.adults,
              childAges: input.childAges,
              optionalTourIds: input.optionalTourIds,
              addOnIds: input.addOnIds,
              travelDate: input.travelDate,
              promotionCode: input.promotionCode,
            },
            preview,
            reasonCodes: result.reasons,
            noticeCodes: result.notices,
            subtotalCents: result.subtotalCents?.toString() ?? null,
            promotion,
          },
          reviewReasons: preview.reasons,
          isFictitious: false,
        },
      });
      await tx.consentRecord.create({
        data: {
          purpose: "DATA_PROCESSING",
          legalDocumentId: legal.id,
          legalDocumentVersion: legal.version,
          granted: true,
          customerId: customer.id,
          quoteId: created.id,
          source: "public_quote",
          ipHash: sha256(ip),
        },
      });
      await notifyCustomer(
        this.notifications,
        tx,
        customer.id,
        "quote.received",
        { reference: created.reference },
        `quote.received:${created.id}`,
      );
      if (input.marketingConsent)
        await tx.consentRecord.create({
          data: {
            purpose: "MARKETING",
            legalDocumentId: legal.id,
            legalDocumentVersion: legal.version,
            granted: true,
            customerId: customer.id,
            quoteId: created.id,
            source: "public_quote",
            ipHash: sha256(ip),
          },
        });
      if (result.lines.length)
        await tx.quoteLine.createMany({
          data: result.lines.map((line, index) => ({
            quoteId: created.id,
            lineNo: index + 1,
            kind: line.kind,
            priceRuleId: line.priceRuleId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            breakdown: {
              ruleSetVersion: line.ruleSetVersion,
              ageRuleId: line.ageRuleId,
              seasonId: line.seasonId,
              promotionId: line.promotionId,
            },
            pricingVersion: line.ruleSetVersion,
            isFictitious: false,
          })),
        });
      await tx.auditLog.create({
        data: {
          action: "quote.public_requested",
          entity: "quote",
          entityId: created.id,
          after: { status, promotionId: applied?.id ?? null },
        },
      });
      return created;
    });
  }
  async track(reference: string, code: string) {
    const client = await this.db.client();
    const quote = await client.quote.findFirst({
      where: { reference, source: "PUBLIC" },
      select: {
        reference: true,
        trackingCodeHash: true,
        status: true,
        createdAt: true,
        travelDate: true,
        totalCents: true,
        currency: true,
        package: { select: { title: true } },
      },
    });
    const expected = quote?.trackingCodeHash;
    const actual = sha256(code);
    if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
      throw new NotFoundException("No encontrado");
    return {
      reference: quote.reference,
      status: quote.status,
      packageName: quote.package?.title ?? null,
      createdAt: quote.createdAt,
      travelDate: quote.travelDate?.toISOString().slice(0, 10) ?? null,
      totalCents: quote.totalCents?.toString() ?? null,
      currency: quote.currency,
    };
  }
}
