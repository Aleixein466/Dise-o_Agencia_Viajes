import {
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
import { badRequest, CommercialRulesService, notFound } from "./commercial-rules.service";

const scopeIds = { destinationId: z.uuid().nullable().optional(), packageId: z.uuid().nullable().optional() };
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["draft", "approved", "inactive"]).optional(),
  scope: z.enum(["GLOBAL", "DESTINATION", "PACKAGE"]).optional(),
  destinationId: z.uuid().optional(),
  packageId: z.uuid().optional(),
});
const stamp = { expectedUpdatedAt: z.iso.datetime().transform((value) => new Date(value)) };
const transition = z.object(stamp).strict();
const seasonFields = {
  name: z.string().trim().min(2).max(120),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  notes: z.string().trim().max(5000).nullable().optional(),
  ...scopeIds,
};
const seasonCreate = z.object(seasonFields).strict();
const seasonPatch = z.object({ ...seasonCreate.partial().shape, ...stamp }).strict();
const ageRuleFields = {
  name: z.string().trim().min(2).max(120),
  category: z.enum(["ADULT", "CHILD", "INFANT", "SENIOR"]),
  basis: z.enum(["AGE_YEARS", "HEIGHT_CM"]).optional(),
  minValue: z.number().int(),
  maxValue: z.number().int(),
  ...scopeIds,
};
const ageRuleCreate = z.object(ageRuleFields).strict();
const ageRulePatch = z.object({ ...ageRuleCreate.partial().shape, ...stamp }).strict();
const isoInstant = z.iso.datetime().transform((value) => new Date(value));
const promotionFields = {
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  percentBps: z.number().int().nullable().optional(),
  amountOffCents: z
    .string()
    .regex(/^(0|[1-9]\d{0,12})$/)
    .transform((value) => BigInt(value))
    .nullable()
    .optional(),
  startsAt: isoInstant,
  endsAt: isoInstant,
  maxRedemptions: z.number().int().nullable().optional(),
  ...scopeIds,
};
const promotionCreate = z.object(promotionFields).strict();
const promotionPatch = z.object({ ...promotionCreate.partial().shape, ...stamp }).strict();

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest("VALIDATION_FAILED", "Datos inválidos");
  return parsed.data;
}
function patchOf<T extends { expectedUpdatedAt: Date }>(value: T) {
  const { expectedUpdatedAt, ...patch } = value;
  if (!Object.keys(patch).length) throw badRequest("VALIDATION_FAILED", "No hay cambios");
  return { expectedUpdatedAt, patch };
}
function uuidParam(id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Staff CRUD for seasons, age rules and promotions. Contract: docs/orchestration/contracts/commercial-rules-admin.md */
@Controller("catalog")
export class CommercialRulesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CommercialRulesService) private readonly rules: CommercialRulesService,
  ) {}
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
  }
  private async actor(
    request: FastifyRequest,
    csrf: string | undefined,
    origin: string | undefined,
    permission: "catalog:write" | "catalog:publish",
  ) {
    const principal = await this.auth.requirePermission(
      token(request, this.auth.cookieName()),
      csrf,
      origin,
      permission,
    );
    return principal.user.id;
  }

  // Seasons
  @Get("seasons") async seasons(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { page, pageSize, ...filter } = parse(listQuery, query);
    return this.rules.seasons(filter, page, pageSize);
  }
  @Get("seasons/:id") async season(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.season(uuidParam(id));
  }
  @Get("seasons/:id/history") async seasonHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.history("season", uuidParam(id));
  }
  @Post("seasons") async createSeason(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    return this.rules.createSeason(parse(seasonCreate, body), actorId);
  }
  @Patch("seasons/:id") async updateSeason(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    const { patch, expectedUpdatedAt } = patchOf(parse(seasonPatch, body));
    return this.rules.updateSeason(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post("seasons/:id/approve") async approveSeason(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.approveSeason(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }
  @Post("seasons/:id/deactivate") async deactivateSeason(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.deactivateSeason(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }

  // Age rules
  @Get("age-rules") async ageRules(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { page, pageSize, ...filter } = parse(listQuery, query);
    return this.rules.ageRules(filter, page, pageSize);
  }
  @Get("age-rules/:id") async ageRule(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.ageRule(uuidParam(id));
  }
  @Get("age-rules/:id/history") async ageRuleHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.history("age_rule", uuidParam(id));
  }
  @Post("age-rules") async createAgeRule(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    return this.rules.createAgeRule(parse(ageRuleCreate, body), actorId);
  }
  @Patch("age-rules/:id") async updateAgeRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    const { patch, expectedUpdatedAt } = patchOf(parse(ageRulePatch, body));
    return this.rules.updateAgeRule(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post("age-rules/:id/approve") async approveAgeRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.approveAgeRule(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }
  @Post("age-rules/:id/deactivate") async deactivateAgeRule(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.deactivateAgeRule(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }

  // Promotions
  @Get("promotions") async promotions(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { page, pageSize, ...filter } = parse(listQuery, query);
    return this.rules.promotions(filter, page, pageSize);
  }
  @Get("promotions/:id") async promotion(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.promotion(uuidParam(id));
  }
  @Get("promotions/:id/history") async promotionHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.history("promotion", uuidParam(id));
  }
  @Post("promotions") async createPromotion(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    return this.rules.createPromotion(parse(promotionCreate, body), actorId);
  }
  @Patch("promotions/:id") async updatePromotion(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:write");
    const { patch, expectedUpdatedAt } = patchOf(parse(promotionPatch, body));
    return this.rules.updatePromotion(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post("promotions/:id/approve") async approvePromotion(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.approvePromotion(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }
  @Post("promotions/:id/deactivate") async deactivatePromotion(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin, "catalog:publish");
    return this.rules.deactivatePromotion(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }

  // Price rules: full audit trail (approve / deactivate / draft edits). Create and edit live in CatalogAdminController.
  @Get("price-rules/:id/history") async priceRuleHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.rules.history("price_rule", uuidParam(id));
  }
}
