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
import { badRequest, notFound } from "../catalog/commercial-rules.service";
import { CustomersService } from "./customers.service";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});
const patchBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email())
      .transform((value) => value.toLowerCase())
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{7,25}$/)
      .refine((value) => value.replace(/\D/g, "").length >= 7)
      .optional(),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    expectedUpdatedAt: z.iso.datetime().transform((value) => new Date(value)),
  })
  .strict();
const noteBody = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

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

/** Staff customer records: search, profile with linked history, contact edits and internal notes. */
@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "customers:read");
  }
  private async actor(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    const principal = await this.auth.requirePermission(
      token(request, this.auth.cookieName()),
      csrf,
      origin,
      "customers:write",
    );
    return principal.user.id;
  }

  @Get() async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { q, page, pageSize } = parse(listQuery, query);
    return this.customers.list(q || undefined, page, pageSize);
  }
  @Get(":id") async get(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.customers.get(uuidParam(id));
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
    return this.customers.update(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post(":id/notes") async addNote(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.customers.addNote(uuidParam(id), parse(noteBody, body).body, actorId);
  }
}
