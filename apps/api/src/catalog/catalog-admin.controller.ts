import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { CatalogAdminService } from "./catalog-admin.service";
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const packageInput = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    summary: z.string().trim().max(10_000).optional(),
    description: z.string().trim().max(20_000).optional(),
    includes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
    excludes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
    itinerary: z
      .array(
        z.object({
          day: z.number().int().min(1).max(30),
          title: z.string().trim().min(1).max(160),
          description: z.string().trim().min(1).max(20_000),
        }),
      )
      .max(30)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const hotelInput = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(20_000).optional(),
    stars: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const rateInput = z.object({
  amountCents: z
    .string()
    .regex(/^(0|[1-9]\d{0,12})$/)
    .transform((v) => BigInt(v))
    .refine((v) => v > 0n && v <= 999_999_999_999n),
});
const priceRuleTransition = z.object({ expectedUpdatedAt: z.string().datetime() });
const instant = z.iso
  .datetime()
  .nullable()
  .optional()
  .transform((value) => (value == null ? value : new Date(value)));
const priceRuleCommercial = {
  name: z.string().trim().min(2).max(160),
  unit: z.enum(["PER_PERSON", "PER_PERSON_NIGHT", "PER_ROOM_NIGHT", "PER_BOOKING"]),
  amountCents: z
    .string()
    .regex(/^(0|[1-9]\d{0,12})$/)
    .transform((value) => BigInt(value)),
  priority: z.number().int().min(-1000).max(1000),
  seasonId: z.uuid().nullable(),
  ageRuleId: z.uuid().nullable(),
  roomTypeId: z.uuid().nullable(),
  occupancy: z.number().int().min(1).max(50).nullable(),
  minTravelers: z.number().int().min(1).max(99).nullable(),
  maxTravelers: z.number().int().min(1).max(99).nullable(),
};
const priceRuleCreate = z
  .object({
    ...priceRuleCommercial,
    priority: priceRuleCommercial.priority.optional(),
    seasonId: priceRuleCommercial.seasonId.optional(),
    ageRuleId: priceRuleCommercial.ageRuleId.optional(),
    roomTypeId: priceRuleCommercial.roomTypeId.optional(),
    occupancy: priceRuleCommercial.occupancy.optional(),
    minTravelers: priceRuleCommercial.minTravelers.optional(),
    maxTravelers: priceRuleCommercial.maxTravelers.optional(),
    validFrom: instant,
    validTo: instant,
    ruleSetVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
    packageId: z.uuid().optional(),
    tourId: z.uuid().optional(),
    transportOptionId: z.uuid().optional(),
    addOnId: z.uuid().optional(),
  })
  .strict();
const priceRulePatch = z
  .object({
    ...z.object(priceRuleCommercial).partial().shape,
    validFrom: instant,
    validTo: instant,
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
const invalid = () =>
  new BadRequestException({ statusCode: 400, code: "VALIDATION_FAILED", message: "Datos inválidos" });
const packageCreate = z.object({
  destinationId: z.uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160),
  title: z.string().trim().min(2).max(160),
  durationDays: z.number().int().min(1).max(30),
  hotelIds: z.array(z.uuid()).max(30).default([]),
});
const hotelCreate = z.object({
  destinationId: z.uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160),
  name: z.string().trim().min(2).max(160),
  stars: z.number().int().min(1).max(5).optional(),
});
const tourCreate = z.object({
  destinationId: z.uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160),
  name: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(10_000).optional(),
  packageId: z.uuid().optional(),
  included: z.boolean().default(false),
});
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}
@Controller("catalog")
export class CatalogAdminController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CatalogAdminService) private readonly catalog: CatalogAdminService,
  ) {}
  private write(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, "catalog:write");
  }
  private publish(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, "catalog:publish");
  }
  @Get("packages") async packages(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    const p = pagination.safeParse(query);
    if (!p.success) throw new BadRequestException();
    const q = query as { q?: string; destinationId?: string };
    return this.catalog.packages(q.q?.trim(), q.destinationId, p.data.page, p.data.pageSize);
  }
  @Get("packages/:id/preview") async preview(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    return this.catalog.packageDetail(id);
  }
  @Post("packages") async packageCreate(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = packageCreate.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.createPackage(parsed.data, actor.user.id);
  }
  @Patch("packages/:id") async packageUpdate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = packageInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.updatePackage(id, parsed.data, actor.user.id);
  }
  @Get("hotels") async hotels(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    const p = pagination.safeParse(query);
    if (!p.success) throw new BadRequestException();
    const q = query as { q?: string; destinationId?: string };
    return this.catalog.hotels(q.q?.trim(), q.destinationId, p.data.page, p.data.pageSize);
  }
  @Post("hotels") async hotelCreate(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = hotelCreate.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.createHotel(parsed.data, actor.user.id);
  }
  @Patch("hotels/:id") async hotelUpdate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = hotelInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.updateHotel(id, parsed.data, actor.user.id);
  }
  @Patch("rates/:id") async rateUpdate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = rateInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.updateRate(id, parsed.data.amountCents, actor.user.id);
  }
  @Get("rates/:id/history") async rateHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    return this.catalog.rateHistory(id);
  }
  @Post("price-rules") async createPriceRule(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.write(request, csrf, origin);
    const parsed = priceRuleCreate.safeParse(body);
    if (!parsed.success) throw invalid();
    return this.catalog.createPriceRule(parsed.data, actor.user.id);
  }
  @Patch("price-rules/:id") async updatePriceRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.write(request, csrf, origin);
    const parsed = priceRulePatch.safeParse(body);
    if (!z.uuid().safeParse(id).success || !parsed.success) throw invalid();
    const { expectedUpdatedAt, ...patch } = parsed.data;
    if (!Object.keys(patch).length) throw invalid();
    return this.catalog.updatePriceRule(id, patch, new Date(expectedUpdatedAt), actor.user.id);
  }
  @Post("price-rules/:id/approve") async approvePriceRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = priceRuleTransition.safeParse(body);
    if (!z.uuid().safeParse(id).success || !parsed.success) throw new BadRequestException();
    const actor = await this.publish(request, csrf, origin);
    return this.catalog.approvePriceRule(id, new Date(parsed.data.expectedUpdatedAt), actor.user.id);
  }
  @Post("price-rules/:id/deactivate") async deactivatePriceRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = priceRuleTransition.safeParse(body);
    if (!z.uuid().safeParse(id).success || !parsed.success) throw new BadRequestException();
    const actor = await this.publish(request, csrf, origin);
    return this.catalog.deactivatePriceRule(id, new Date(parsed.data.expectedUpdatedAt), actor.user.id);
  }
  @Get("tours") async tours(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    const p = pagination.safeParse(query);
    if (!p.success) throw new BadRequestException();
    return this.catalog.tours((query as { destinationId?: string }).destinationId, p.data.page, p.data.pageSize);
  }
  @Post("tours") async tourCreate(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = tourCreate.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.catalog.createTour(parsed.data, actor.user.id);
  }
}
