import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { ProfileService } from "./profile.service";

const nameSchema = z.object({ name: z.string().trim().min(2).max(120) });
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});
const emailRequestSchema = z.object({ currentPassword: z.string().min(1).max(128), newEmail: z.email().max(254) });
const codeSchema = z.object({ code: z.string().trim().min(1).max(64) });
const credentialsSchema = z.object({ currentPassword: z.string().min(1).max(128) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "INVALID_PAYLOAD" });
  return result.data;
}
function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}
const ip = (request: FastifyRequest) => request.ip || undefined;

/** The signed-in staff member's own account. All routes act on the session's principal only (no ids in the URL). */
@Controller("auth/me")
export class ProfileController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileService) private readonly profile: ProfileService,
  ) {}
  private token(request: FastifyRequest): string {
    const value = cookieValue(request, this.auth.cookieName());
    if (!value) throw new UnauthorizedException();
    return value;
  }

  @Get()
  async me(@Req() request: FastifyRequest) {
    return this.profile.me(this.token(request));
  }

  @Get("activity")
  async activity(@Req() request: FastifyRequest) {
    return this.profile.activity(this.token(request));
  }

  @Patch()
  async updateName(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.profile.updateName(this.token(request), csrf, origin, parse(nameSchema, body).name);
  }

  @Post("password")
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.profile.changePassword(this.token(request), csrf, origin, parse(passwordSchema, body), ip(request));
  }

  @Post("email/request")
  @HttpCode(202)
  async requestEmailChange(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const result = await this.profile.requestEmailChange(
      this.token(request),
      csrf,
      origin,
      parse(emailRequestSchema, body),
      ip(request),
    );
    return { accepted: true, expiresAt: result.expiresAt };
  }

  @Post("email/confirm")
  @HttpCode(200)
  async confirmEmailChange(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.profile.confirmEmailChange(
      this.token(request),
      csrf,
      origin,
      parse(codeSchema, body).code,
      ip(request),
    );
  }

  @Post("recovery-codes")
  @HttpCode(200)
  async regenerateRecoveryCodes(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.profile.regenerateRecoveryCodes(
      this.token(request),
      csrf,
      origin,
      parse(credentialsSchema, body),
      ip(request),
    );
  }

  @Post("sessions/revoke-others")
  @HttpCode(200)
  async revokeOtherSessions(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.profile.revokeOtherSessions(this.token(request), csrf, origin, ip(request));
  }
}
