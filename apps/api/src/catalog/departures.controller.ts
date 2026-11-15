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
import { badRequest, notFound } from "./commercial-rules.service";
import { DeparturesService } from "./departures.service";

const MAX_SEATS = 10_000;
const listQuery = z.object({
  packageId: z.uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const capacity = z.number().int().min(0).max(MAX_SEATS);
const availability = z.enum(["AVAILABLE", "SOLD_OUT", "TO_CONFIRM"]);
const reason = z.string().trim().min(3).max(300);
const createBody = z
  .object({
    packageId: z.uuid(),
    startsAt: instant,
    endsAt: instant,
    capacity,
    availabilityStatus: availability.default("TO_CONFIRM"),
  })
  .strict();
const patchBody = z
  .object({
    startsAt: instant.optional(),
    endsAt: instant.optional(),
    capacity: capacity.optional(),
    availabilityStatus: availability.optional(),
    reason: reason.optional(),
    expectedUpdatedAt: z.iso.datetime().transform((value) => new Date(value)),
  })
  .strict();
const seatsBody = z.object({ seats: z.number().int().min(1).max(MAX_SEATS), reason }).strict();

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest("VALIDATION_FAILED", "Datos inválidos");
  return parsed.data;
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

/** Staff manual cupos per package departure (same permission convention as the other catalog modules). */
@Controller("catalog/departures")
export class DeparturesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DeparturesService) private readonly departures: DeparturesService,
  ) {}
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
  }
  private async actor(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    const principal = await this.auth.requirePermission(
      token(request, this.auth.cookieName()),
      csrf,
      origin,
      "catalog:write",
    );
    return principal.user.id;
  }

  @Get() async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { packageId, page, pageSize } = parse(listQuery, query);
    return this.departures.list(packageId, page, pageSize);
  }
  @Get(":id") async get(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.departures.get(uuidParam(id));
  }
  @Get(":id/history") async history(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.departures.history(uuidParam(id));
  }
  @Post() async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.departures.create(parse(createBody, body), actorId);
  }
  @Patch(":id") async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const { expectedUpdatedAt, ...patch } = parse(patchBody, body);
    if (!Object.keys(patch).some((key) => key !== "reason")) throw badRequest("VALIDATION_FAILED", "No hay cambios");
    return this.departures.update(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post(":id/hold") async hold(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const { seats, reason: why } = parse(seatsBody, body);
    return this.departures.hold(uuidParam(id), seats, why, actorId);
  }
  @Post(":id/release") async release(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const { seats, reason: why } = parse(seatsBody, body);
    return this.departures.release(uuidParam(id), seats, why, actorId);
  }
}
