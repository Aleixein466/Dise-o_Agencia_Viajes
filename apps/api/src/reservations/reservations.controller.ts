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
import { RESERVATION_STATES } from "@ricaurte/domain";
import { AuthService } from "../auth/auth.service";
import { ReservationsService } from "./reservations.service";

const uuid = z.uuid();
const list = z.object({
  status: z.enum(RESERVATION_STATES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const event = z.object({
  event: z.enum(["START_VALIDATION", "APPROVE_FOR_PAYMENT", "CONFIRM", "REJECT", "CANCEL"]),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().max(500).optional(),
  requiredDepositCents: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
});
const note = z.object({ body: z.string().trim().min(1).max(2000) });
const assign = z.object({ advisorId: z.uuid(), expectedVersion: z.number().int().min(0) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
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

/** Staff reservations. MFA + reservations:read|write; contact data only with customers:read. */
@Controller("reservations")
export class ReservationsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ReservationsService) private readonly reservations: ReservationsService,
  ) {}

  private reader(request: FastifyRequest) {
    return this.auth.requireReadPermission(cookie(request, this.auth.cookieName()), "reservations:read");
  }
  private writer(request: FastifyRequest, csrf?: string, origin?: string) {
    return this.auth.requirePermission(cookie(request, this.auth.cookieName()), csrf, origin, "reservations:write");
  }

  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    const principal = await this.reader(request);
    return this.reservations.adminList(parse(list, query), principal.permissions.includes("customers:read"));
  }

  @Get(":id")
  async detail(@Param("id") reservationId: string, @Req() request: FastifyRequest) {
    const principal = await this.reader(request);
    return this.reservations.adminDetail(parse(uuid, reservationId), principal.permissions.includes("customers:read"));
  }

  @Post(":id/events")
  async event(
    @Param("id") reservationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(event, body);
    const principal = await this.writer(request, csrf, origin);
    const role = principal.roles.includes("ADMIN") ? "ADMIN" : "ADVISOR";
    await this.reservations.staffEvent(
      parse(uuid, reservationId),
      { id: principal.user.id, role },
      input.event,
      input.expectedVersion,
      input.reason,
      input.requiredDepositCents === undefined ? undefined : BigInt(input.requiredDepositCents),
    );
    return this.reservations.adminDetail(parse(uuid, reservationId), principal.permissions.includes("customers:read"));
  }

  @Post(":id/notes")
  async note(
    @Param("id") reservationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(note, body);
    const principal = await this.writer(request, csrf, origin);
    return this.reservations.addNote(
      parse(uuid, reservationId),
      input.body,
      principal.user.id,
      principal.permissions.includes("customers:read"),
    );
  }

  @Post(":id/assign")
  async assign(
    @Param("id") reservationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(assign, body);
    const principal = await this.writer(request, csrf, origin);
    return this.reservations.assign(
      parse(uuid, reservationId),
      input.advisorId,
      input.expectedVersion,
      principal.user.id,
      principal.permissions.includes("customers:read"),
    );
  }
}
