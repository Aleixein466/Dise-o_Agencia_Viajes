import { BadRequestException, Controller, Get, Inject, Query, Req, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "./audit.service";

const text = (max: number) => z.string().trim().min(1).max(max);
const listQuery = z
  .object({
    entity: text(120).optional(),
    action: text(120).optional(),
    actorId: z.uuid().optional(),
    entityId: text(120).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    // Bounded offset: deeper history is reached by narrowing the filters (dates, entity), not by paging.
    page: z.coerce.number().int().min(1).max(200).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

function cookie(request: FastifyRequest, name: string): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Read-only audit log for ADMIN (audit:read, MFA-verified session). */
@Controller("admin/audit")
export class AuditController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(cookie(request, this.auth.cookieName()), "audit:read");
  }

  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const parsed = listQuery.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({ statusCode: 400, code: "VALIDATION_FAILED", message: "Filtros inválidos" });
    const { page, pageSize, ...filter } = parsed.data;
    return this.audit.list(filter, page, pageSize);
  }

  @Get("facets")
  async facets(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.audit.facets();
  }
}
