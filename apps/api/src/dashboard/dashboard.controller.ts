import { Controller, Get, Inject, Req, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { DashboardService } from "./dashboard.service";

function cookie(request: FastifyRequest, name: string): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("admin/dashboard")
export class DashboardController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}

  @Get()
  async summary(@Req() request: FastifyRequest) {
    const principal = await this.auth.requireStaff(cookie(request, this.auth.cookieName()));
    return this.dashboard.summary(principal.permissions);
  }
}
