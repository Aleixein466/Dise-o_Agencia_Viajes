import { Body, Controller, Get, Headers, Inject, Patch, Req, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { badRequest } from "../catalog/commercial-rules.service";
import { SECRET_KEY, agencyPatch } from "./agency-schema";
import { SettingsService } from "./settings.service";

function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Agency profile admin. Permission: settings:write. */
@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "settings:write");
  }

  @Get("agency") async get(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.settings.get();
  }
  @Get("agency/history") async history(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.settings.history();
  }
  @Get("agency/media") async media(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.settings.media();
  }
  @Patch("agency") async update(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.auth.requirePermission(
      token(request, this.auth.cookieName()),
      csrf,
      origin,
      "settings:write",
    );
    // Secrets never belong in the database: refuse them by name before anything else is looked at.
    if (body && typeof body === "object" && Object.keys(body).some((key) => SECRET_KEY.test(key)))
      throw badRequest("SECRETS_NOT_ALLOWED", "Las claves y secretos se configuran en variables de entorno");
    const parsed = agencyPatch.safeParse(body);
    if (!parsed.success) throw badRequest("VALIDATION_FAILED", "Datos inválidos");
    const { expectedUpdatedAt, ...patch } = parsed.data;
    if (!Object.values(patch).some((value) => value !== undefined))
      throw badRequest("VALIDATION_FAILED", "No hay cambios");
    return this.settings.update(patch, expectedUpdatedAt, principal.user.id);
  }
}

/** Unauthenticated, non-sensitive agency profile. */
@Controller("public/agency")
export class PublicAgencyController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}
  @Get() profile() {
    return this.settings.publicProfile();
  }
}
