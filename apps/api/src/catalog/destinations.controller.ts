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

const input = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(140),
  name: z.string().trim().min(2).max(140),
  country: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).optional(),
  description: z.string().trim().max(20_000).optional(),
  category: z.enum(["NACIONAL", "INTERNACIONAL", "PASADIA", "ESPECIAL"]),
});
const update = input.partial().refine((value) => Object.keys(value).length > 0);
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
    return this.destinations.update(id, parsed.data, actor.user.id);
  }
  @Post(":id/publish")
  async publish(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.mutation(request, csrf, origin, "catalog:publish");
    return this.destinations.setStatus(id, "PUBLISHED", actor.user.id);
  }
  @Post(":id/archive")
  async archive(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actor = await this.mutation(request, csrf, origin, "catalog:publish");
    return this.destinations.setStatus(id, "ARCHIVED", actor.user.id);
  }
}
