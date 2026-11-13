import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const codeSchema = z.object({ code: z.string().min(1).max(128) });
const resetSchema = z.object({ token: z.string().min(32).max(512), password: z.string().min(12).max(128) });
const emailSchema = z.object({ email: z.email().max(254) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
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
function cookie(token: string, secure: boolean): string {
  return `__Host-rt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? "; Secure" : ""}`;
}
function clearCookie(secure: boolean): string {
  return `__Host-rt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
function ip(request: FastifyRequest): string | undefined {
  return request.ip || undefined;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private token(request: FastifyRequest): string {
    const value = cookieValue(request, this.auth.cookieName());
    if (!value) throw new UnauthorizedException();
    return value;
  }
  private secure(): boolean {
    return process.env.NODE_ENV === "production";
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const input = parse(loginSchema, body);
    const result = await this.auth.login(input.email, input.password, ip(request));
    reply.header("set-cookie", cookie(result.token, this.secure()));
    return { mfaRequired: result.mfaRequired };
  }

  @Get("session")
  async session(@Req() request: FastifyRequest) {
    return this.auth.session(this.token(request));
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(this.token(request), csrf, origin);
    reply.header("set-cookie", clearCookie(this.secure()));
  }

  @Post("logout-all")
  @HttpCode(204)
  async logoutAll(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(this.token(request), csrf, origin, true);
    reply.header("set-cookie", clearCookie(this.secure()));
  }

  @Post("password/forgot")
  @HttpCode(202)
  async forgot(@Body() body: unknown, @Req() request: FastifyRequest) {
    await this.auth.forgotPassword(parse(emailSchema, body).email, ip(request));
    return { accepted: true };
  }

  @Post("password/reset")
  @HttpCode(204)
  async reset(@Body() body: unknown, @Req() request: FastifyRequest) {
    const input = parse(resetSchema, body);
    await this.auth.resetPassword(input.token, input.password, ip(request));
  }

  @Post("mfa/setup")
  async setup(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.auth.beginMfa(this.token(request), csrf, origin);
  }

  @Post("mfa/totp/verify")
  @HttpCode(204)
  async verifyTotp(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    await this.auth.verifyTotp(this.token(request), parse(codeSchema, body).code, csrf, origin);
  }

  @Post("mfa/recovery")
  @HttpCode(204)
  async recovery(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    await this.auth.useRecoveryCode(this.token(request), parse(codeSchema, body).code, csrf, origin);
  }
}
