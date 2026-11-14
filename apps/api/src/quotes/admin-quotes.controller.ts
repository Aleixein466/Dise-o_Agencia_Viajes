import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { AdminQuotesService, type QuoteInput } from "./admin-quotes.service";

const quoteInput = z.object({
  packageId: z.uuid(),
  hotelId: z.uuid().optional(),
  transportOptionId: z.uuid().optional(),
  priceRuleId: z.uuid().optional(),
  adults: z.number().int().min(1).max(30),
  childAges: z.array(z.number().int().min(0).max(17)).max(20).default([]),
  optionalTourIds: z.array(z.uuid()).max(20).default([]),
  addOnIds: z.array(z.uuid()).max(20).default([]),
});
const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["DRAFT", "REQUIRES_MANUAL_REVIEW"]).optional(),
});
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("quotes")
export class AdminQuotesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AdminQuotesService) private readonly quotes: AdminQuotesService,
  ) {}
  private write(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, "quotes:write");
  }
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "quotes:read");
  }
  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const parsed = page.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return this.quotes.list(parsed.data.page, parsed.data.pageSize, parsed.data.status);
  }
  @Get("catalog/:packageId")
  async options(@Param("packageId") packageId: string, @Req() request: FastifyRequest) {
    await this.read(request);
    if (!z.uuid().safeParse(packageId).success) throw new BadRequestException();
    return this.quotes.options(packageId);
  }
  @Post("preview")
  async preview(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = quoteInput.safeParse(body);
    if (!input.success) throw new BadRequestException();
    await this.write(request, csrf, origin);
    return this.quotes.preview(input.data);
  }
  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = quoteInput.safeParse(body);
    if (!input.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.quotes.create(input.data, actor.user.id);
  }
  @Get(":id/history")
  async history(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    if (!z.uuid().safeParse(id).success) throw new BadRequestException();
    return this.quotes.history(id);
  }
  @Get(":id")
  async get(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    if (!z.uuid().safeParse(id).success) throw new BadRequestException();
    return this.quotes.get(id);
  }
  @Post(":id/recalculate")
  async recalculate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = z.object({ expectedRevision: z.number().int().min(1), selection: quoteInput }).safeParse(body);
    if (!parsed.success || !z.uuid().safeParse(id).success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.quotes.recalculate(
      id,
      parsed.data.selection as QuoteInput,
      parsed.data.expectedRevision,
      actor.user.id,
    );
  }
}
