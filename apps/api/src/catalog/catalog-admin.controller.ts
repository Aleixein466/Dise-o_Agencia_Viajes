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
    .regex(/^\d+$/)
    .transform((v) => BigInt(v))
    .refine((v) => v > 0n && v <= 999_999_999_999n),
});
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
