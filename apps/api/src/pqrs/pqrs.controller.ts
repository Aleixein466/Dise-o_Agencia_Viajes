import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { PublicRateLimiter } from "../public/public-rate-limiter";
import { PQRS_STATUSES, PQRS_TYPES, PqrsService } from "./pqrs.service";

const TEN_MINUTES = 10 * 60_000;
const subject = z.string().trim().min(5).max(160);
const description = z.string().trim().min(20).max(5000);
const message = z.string().trim().min(2).max(5000);
const publicInput = z.object({
  type: z.enum(PQRS_TYPES),
  subject,
  description,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(25).optional(),
  dataConsent: z.literal(true),
  idempotencyKey: z.uuid(),
  website: z.string().max(200).default(""),
});
const tracking = z.object({
  reference: z.string().trim().min(1).max(24),
  trackingCode: z.string().trim().min(1).max(200),
});
const customerInput = z.object({ type: z.enum(PQRS_TYPES), subject, description, idempotencyKey: z.uuid() });
const listQuery = z.object({
  status: z.enum(PQRS_STATUSES).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
const assignInput = z.object({ assigneeId: z.uuid().nullable() });
const staffMessage = z.object({ message, internal: z.boolean() });
const statusInput = z.object({ status: z.enum(PQRS_STATUSES), expectedVersion: z.number().int().min(0) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
const id = (value: string) => parse(z.uuid(), value);
const ip = (request: FastifyRequest) => request.ip || "unknown";
function cookie(request: FastifyRequest, name: string): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("public/pqrs")
export class PublicPqrsController {
  constructor(
    @Inject(PqrsService) private readonly pqrs: PqrsService,
    @Inject(PublicRateLimiter) private readonly limiter: PublicRateLimiter,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(publicInput, body);
    this.limiter.check(ip(request), "pqrs", 5, TEN_MINUTES);
    const result = await this.pqrs.createPublic(input, ip(request), origin);
    // Idempotent replay: 200, same reference, no tracking code (contract pqrs.md).
    if (result.reference && result.trackingCode === null) reply.status(200);
    return result;
  }

  @Post("track")
  @HttpCode(200)
  track(@Body() body: unknown, @Req() request: FastifyRequest) {
    const input = parse(tracking, body);
    this.limiter.check(ip(request), "pqrs-track", 20, TEN_MINUTES);
    return this.pqrs.track(input.reference, input.trackingCode);
  }
}

/** Customer portal: every query is scoped to the signed-in customer; foreign ids answer 404. */
@Controller("me/pqrs")
export class CustomerPqrsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PqrsService) private readonly pqrs: PqrsService,
  ) {}

  private reader(request: FastifyRequest) {
    return this.auth.requireCustomer(cookie(request, this.auth.cookieName()), "pqrs:read_own");
  }
  private writer(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requireCustomerMutation(cookie(request, this.auth.cookieName()), csrf, origin, "pqrs:create_own");
  }

  @Get()
  async list(@Req() request: FastifyRequest) {
    const principal = await this.reader(request);
    return this.pqrs.customerList(principal.user.id);
  }

  @Get(":id")
  async detail(@Req() request: FastifyRequest, @Param("id") ticketId: string) {
    const principal = await this.reader(request);
    return this.pqrs.customerDetail(principal.user.id, id(ticketId));
  }

  @Post()
  async create(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin);
    return this.pqrs.customerCreate(principal.user.id, parse(customerInput, body), origin);
  }

  @Post(":id/messages")
  async reply(
    @Req() request: FastifyRequest,
    @Param("id") ticketId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin);
    const input = parse(z.object({ message }), body);
    return this.pqrs.customerReply(principal.user.id, id(ticketId), input.message);
  }
}

/** Staff inbox: MFA session; reads need pqrs:read, mutations pqrs:respond + CSRF + Origin. */
@Controller("pqrs")
export class StaffPqrsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PqrsService) private readonly pqrs: PqrsService,
  ) {}

  private reader(request: FastifyRequest) {
    return this.auth.requireReadPermission(cookie(request, this.auth.cookieName()), "pqrs:read");
  }
  private writer(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(cookie(request, this.auth.cookieName()), csrf, origin, "pqrs:respond");
  }

  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.reader(request);
    const input = parse(listQuery, query);
    return this.pqrs.staffList({ status: input.status, overdue: input.overdue === "true", page: input.page });
  }

  @Get(":id")
  async detail(@Req() request: FastifyRequest, @Param("id") ticketId: string) {
    await this.reader(request);
    return this.pqrs.staffDetail(id(ticketId));
  }

  @Post(":id/assign")
  @HttpCode(200)
  async assign(
    @Req() request: FastifyRequest,
    @Param("id") ticketId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin);
    return this.pqrs.assign(principal.user.id, id(ticketId), parse(assignInput, body).assigneeId);
  }

  @Post(":id/messages")
  async message(
    @Req() request: FastifyRequest,
    @Param("id") ticketId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin);
    const input = parse(staffMessage, body);
    return this.pqrs.staffMessage(principal.user.id, id(ticketId), input.message, input.internal);
  }

  @Post(":id/status")
  @HttpCode(200)
  async status(
    @Req() request: FastifyRequest,
    @Param("id") ticketId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin);
    const input = parse(statusInput, body);
    return this.pqrs.changeStatus(principal.user.id, id(ticketId), input.status, input.expectedVersion);
  }
}
