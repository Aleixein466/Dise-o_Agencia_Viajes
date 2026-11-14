import { BadRequestException, Body, Controller, Headers, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { PublicCatalogService, type PublicSelection } from "./public-catalog.service";
import { PublicQuotesService } from "./public-quotes.service";
import { PublicRateLimiter } from "./public-rate-limiter";

const selection = z.object({ packageId: z.uuid(), hotelId: z.uuid().optional(), roomTypeId: z.uuid().optional(), transportOptionId: z.uuid().optional(), adults: z.number().int().min(1).max(30), childAges: z.array(z.number().int().min(0).max(17)).max(20).default([]), optionalTourIds: z.array(z.uuid()).max(20).default([]), addOnIds: z.array(z.uuid()).max(20).default([]) });
const requestInput = selection.extend({ travelDate: z.string().date().optional(), contact: z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(254), phone: z.string().trim().min(7).max(25) }), notes: z.string().max(2000).optional(), dataConsent: z.literal(true), marketingConsent: z.boolean().optional(), idempotencyKey: z.uuid(), website: z.string().max(200).default("") });
const tracking = z.object({ reference: z.string().trim().min(1).max(24), trackingCode: z.string().trim().min(1).max(200) });
const ip = (request: FastifyRequest) => request.ip || "unknown";

@Controller("public")
export class PublicQuotesController {
  constructor(@Inject(PublicCatalogService) private readonly catalog: PublicCatalogService, @Inject(PublicQuotesService) private readonly quotes: PublicQuotesService, @Inject(PublicRateLimiter) private readonly limiter: PublicRateLimiter) {}
  @Post("quote-preview") @HttpCode(200) async preview(@Body() body: unknown) { const parsed = selection.safeParse(body); if (!parsed.success) throw new BadRequestException(); return this.catalog.preview(parsed.data); }
  @Post("quote-requests") async create(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Headers("origin") origin?: string) {
    const parsed = requestInput.safeParse(body); if (!parsed.success) throw new BadRequestException(); this.limiter.check(ip(request), "request");
    const result = await this.quotes.create(parsed.data as PublicSelection & z.infer<typeof requestInput>, ip(request), origin);
    // Idempotent replay of an existing request: 200, same reference, no tracking code (contract public-quotes.md).
    if (result.reference && result.trackingCode === null) reply.status(200);
    return result;
  }
  @Post("quote-requests/track") @HttpCode(200) async track(@Body() body: unknown, @Req() request: FastifyRequest) { const parsed = tracking.safeParse(body); if (!parsed.success) throw new BadRequestException(); this.limiter.check(ip(request), "track"); return this.quotes.track(parsed.data.reference, parsed.data.trackingCode); }
}
