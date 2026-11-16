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
import { TransportOptionsService } from "./transport-options.service";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  destinationId: z.uuid().optional(),
  mode: z.enum(["GROUND", "AIR", "SEA"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});
const stamp = { expectedUpdatedAt: z.iso.datetime().transform((value) => new Date(value)) };
const transition = z.object(stamp).strict();
const text = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null));
const fields = {
  destinationId: z.uuid(),
  mode: z.enum(["GROUND", "AIR", "SEA"]),
  name: z.string().trim().min(2).max(120),
  description: text,
  conditions: text,
};
const createBody = z.object(fields).strict();
const editable = {
  mode: fields.mode,
  name: fields.name,
  description: fields.description,
  conditions: fields.conditions,
};
const patchBody = z.object({ ...z.object(editable).partial().shape, ...stamp }).strict();

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

/** Staff CRUD for transport options. Contract: docs/orchestration/contracts/transport-options-admin.md */
@Controller("catalog/transport-options")
export class TransportOptionsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TransportOptionsService) private readonly options: TransportOptionsService,
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
    const { page, pageSize, ...filter } = parse(listQuery, query);
    return this.options.list(filter, page, pageSize);
  }
  @Get(":id") async get(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.options.get(uuidParam(id));
  }
  @Get(":id/history") async history(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.options.history(uuidParam(id));
  }
  @Post() async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.options.create(parse(createBody, body), actorId);
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
    if (!Object.keys(patch).length) throw badRequest("VALIDATION_FAILED", "No hay cambios");
    return this.options.update(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post(":id/deactivate") async deactivate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.options.deactivate(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }
  @Post(":id/activate") async activate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.options.activate(uuidParam(id), parse(transition, body).expectedUpdatedAt, actorId);
  }
}
