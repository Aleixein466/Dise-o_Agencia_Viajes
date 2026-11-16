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
import { CRM_QUOTE_STATUSES } from "@ricaurte/domain";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { CrmService } from "./crm.service";

const idSchema = z.uuid();
const requestQuery = z.object({
  status: z.enum(CRM_QUOTE_STATUSES).optional(),
  assigneeId: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  source: z.enum(["PUBLIC", "ADMIN"]).optional(),
  q: z.string().trim().min(1).max(254).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const assignSchema = z.object({
  advisorId: z.uuid(),
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().min(1).max(300).optional(),
});
const statusSchema = z.object({ status: z.enum(CRM_QUOTE_STATUSES), expectedRevision: z.number().int().min(1) });
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("crm")
export class CrmController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CrmService) private readonly crm: CrmService,
  ) {}

  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "quotes:read");
  }

  private write(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, "quotes:write");
  }

  @Get("requests")
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    const parsed = requestQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    const actor = await this.read(request);
    return this.crm.list({ ...parsed.data, canReadContact: actor.permissions.includes("customers:read") });
  }

  @Get("requests/:id")
  async get(@Param("id") id: string, @Req() request: FastifyRequest) {
    if (!idSchema.safeParse(id).success) throw new BadRequestException();
    const actor = await this.read(request);
    return this.crm.get(id, actor.permissions.includes("customers:read"));
  }

  @Get("advisors")
  async advisors(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.crm.advisors();
  }

  @Post("requests/:id/assign")
  async assign(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = assignSchema.safeParse(body);
    if (!idSchema.safeParse(id).success || !parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.crm.assign(id, parsed.data.advisorId, parsed.data.expectedRevision, parsed.data.reason, actor.user.id);
  }

  @Post("requests/:id/status")
  async status(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = statusSchema.safeParse(body);
    if (!idSchema.safeParse(id).success || !parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.crm.changeStatus(id, parsed.data.status, parsed.data.expectedRevision, actor.user.id);
  }

  @Post("requests/:id/notes")
  async note(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const parsed = noteSchema.safeParse(body);
    if (!idSchema.safeParse(id).success || !parsed.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.crm.addNote(id, parsed.data.body, actor.user.id);
  }

  @Get("stats")
  async stats(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.crm.stats();
  }
}
