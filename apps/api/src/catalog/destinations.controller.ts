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
import { DestinationsService } from "./destinations.service";
import { PortfolioImportService } from "./portfolio-import.service";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .optional();
const fields = {
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(140),
  name: z.string().trim().min(2).max(140),
  country: z.string().trim().min(2).max(100),
  region: optionalText(100),
  description: optionalText(20_000),
  category: z.enum(["NACIONAL", "INTERNACIONAL", "PASADIA", "ESPECIAL"]),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
  noindex: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
};
const input = z.object(fields).strict();
const stamp = z.iso.datetime().transform((value) => new Date(value));
const update = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.optional()])),
    expectedUpdatedAt: stamp,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"));
const transition = z.object({ expectedUpdatedAt: stamp }).strict();
const uuid = z.uuid();
function uuidParam(value: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("catalog/destinations")
export class DestinationsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DestinationsService) private readonly destinations: DestinationsService,
    @Inject(PortfolioImportService) private readonly portfolio: PortfolioImportService,
  ) {}
  private mutation(request: FastifyRequest, csrf: string | undefined, origin: string | undefined, permission: string) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, permission);
  }
  @Get()
  async list(@Req() request: FastifyRequest, @Query("q") q?: string) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    return this.destinations.list(q?.trim());
  }
  @Get(":id/history")
  async history(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    return this.destinations.history(uuidParam(id));
  }
  @Get("portfolio/preview")
  async portfolioPreview(@Req() request: FastifyRequest) {
    await this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
    return this.portfolio.preview();
  }
  @Post("portfolio/import")
  async portfolioImport(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.mutation(request, csrf, origin, "catalog:write");
    return this.portfolio.import(actor.user.id);
  }
  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = input.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.mutation(request, csrf, origin, "catalog:write");
    return this.destinations.create(parsed.data, actor.user.id);
  }
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = update.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.mutation(request, csrf, origin, "catalog:write");
    const { expectedUpdatedAt, ...patch } = parsed.data;
    return this.destinations.update(uuidParam(id), patch, expectedUpdatedAt, actor.user.id);
  }
  @Post(":id/publish")
  async publish(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.mutation(request, csrf, origin, "catalog:publish");
    const parsed = transition.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.destinations.setStatus(uuidParam(id), "PUBLISHED", parsed.data.expectedUpdatedAt, actor.user.id);
  }
  @Post(":id/unpublish")
  async unpublish(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = transition.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.mutation(request, csrf, origin, "catalog:publish");
    return this.destinations.setStatus(uuidParam(id), "DRAFT", parsed.data.expectedUpdatedAt, actor.user.id);
  }
  @Post(":id/archive")
  async archive(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.mutation(request, csrf, origin, "catalog:publish");
    const parsed = transition.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.destinations.setStatus(uuidParam(id), "ARCHIVED", parsed.data.expectedUpdatedAt, actor.user.id);
  }
}
