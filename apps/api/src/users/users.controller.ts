import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { UsersService } from "./users.service";

const createSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
  roles: z.array(z.enum(["ADVISOR", "FINANCE", "ADMIN"])).min(1),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});
const rolesSchema = z.object({ roles: z.array(z.enum(["ADVISOR", "FINANCE", "ADMIN"])).min(1) });
function token(request: FastifyRequest): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-rt_session="))
    ?.slice("__Host-rt_session=".length);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("users")
export class UsersController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}
  private actor(request: FastifyRequest, csrf: string | undefined, origin: string | undefined, permission: string) {
    return this.auth.requirePermission(token(request), csrf, origin, permission);
  }
  @Get()
  async list(@Req() request: FastifyRequest, @Query("q") q: string | undefined) {
    await this.auth.requireReadPermission(token(request), "staff:read");
    return this.users.list(q?.trim());
  }
  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const actor = await this.actor(request, csrf, origin, "staff:write");
    if (!actor.permissions.includes("roles:assign")) throw new UnauthorizedException();
    const input = createSchema.parse(body);
    return this.users.create(input, actor.user.id);
  }
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const actor = await this.actor(request, csrf, origin, "staff:write");
    return this.users.update(id, updateSchema.parse(body), actor.user.id);
  }
  @Put(":id/roles")
  async roles(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const actor = await this.actor(request, csrf, origin, "roles:assign");
    await this.users.assignRoles(id, rolesSchema.parse(body).roles, actor.user.id);
    return { ok: true };
  }
}
