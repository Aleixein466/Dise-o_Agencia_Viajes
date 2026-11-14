import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { ReservationsService } from "../reservations/reservations.service";

const uuid = z.uuid();
const decision = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]), expectedRevision: z.number().int().min(1) });
const reservation = z.object({
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelers: z
    .array(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        category: z.enum(["ADULT", "CHILD", "INFANT"]),
        ageYears: z.number().int().min(0).max(120).optional(),
      }),
    )
    .min(1)
    .max(30),
  notes: z.string().trim().max(1000).optional(),
});
const cancel = z.object({ reason: z.string().trim().min(3).max(500), expectedVersion: z.number().int().min(0) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
function id(value: string): string {
  return parse(uuid, value);
}
function cookie(request: FastifyRequest, name: string): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Customer portal. Every query is scoped to the signed-in customer; foreign ids answer 404. */
@Controller("me")
export class PortalController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ReservationsService) private readonly reservations: ReservationsService,
  ) {}

  private reader(request: FastifyRequest, permission: string) {
    return this.auth.requireCustomer(cookie(request, this.auth.cookieName()), permission);
  }
  private writer(request: FastifyRequest, csrf: string | undefined, origin: string | undefined, permission: string) {
    return this.auth.requireCustomerMutation(cookie(request, this.auth.cookieName()), csrf, origin, permission);
  }

  @Get("quotes")
  async quotes(@Req() request: FastifyRequest) {
    const principal = await this.reader(request, "quotes:read_own");
    return this.reservations.customerQuotes(principal.user.id);
  }

  @Get("quotes/:id")
  async quote(@Param("id") quoteId: string, @Req() request: FastifyRequest) {
    const principal = await this.reader(request, "quotes:read_own");
    return this.reservations.customerQuote(principal.user.id, id(quoteId));
  }

  @Post("quotes/:id/decision")
  async decide(
    @Param("id") quoteId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(decision, body);
    const principal = await this.writer(request, csrf, origin, "quotes:read_own");
    return this.reservations.decide(principal.user.id, id(quoteId), input.decision, input.expectedRevision);
  }

  @Post("quotes/:id/reservation")
  async reserve(
    @Param("id") quoteId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(reservation, body);
    const principal = await this.writer(request, csrf, origin, "quotes:create_own");
    const result = await this.reservations.requestReservation(principal.user.id, id(quoteId), input);
    reply.status(result.created ? 201 : 200);
    return { id: result.id, code: result.code, status: result.status };
  }

  @Get("reservations")
  async list(@Req() request: FastifyRequest) {
    const principal = await this.reader(request, "reservations:read_own");
    return this.reservations.customerReservations(principal.user.id);
  }

  @Get("reservations/:id")
  async detail(@Param("id") reservationId: string, @Req() request: FastifyRequest) {
    const principal = await this.reader(request, "reservations:read_own");
    return this.reservations.customerReservation(principal.user.id, id(reservationId));
  }

  @Post("reservations/:id/cancel")
  async cancel(
    @Param("id") reservationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(cancel, body);
    const principal = await this.writer(request, csrf, origin, "reservations:read_own");
    return this.reservations.customerCancel(principal.user.id, id(reservationId), input.reason, input.expectedVersion);
  }
}
