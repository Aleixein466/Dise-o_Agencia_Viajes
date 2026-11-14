import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
const email = z.object({ email: z.email().max(254) });
const verify = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{8}$/) });
const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
  const x = schema.safeParse(value);
  if (!x.success) throw new BadRequestException();
  return x.data;
};
@Controller("customer-auth")
export class CustomerAuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("request-code") @HttpCode(202) async request(@Body() body: unknown, @Req() req: FastifyRequest) {
    await this.auth.requestCustomerCode(parse(email, body).email, req.ip || "unknown");
    return { message: "Si existe una cuenta, recibirás un código de acceso." };
  }
  @Post("verify") async verify(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const x = parse(verify, body);
    const result = await this.auth.verifyCustomerCode(x.email, x.code, req.ip || "unknown");
    reply.header(
      "set-cookie",
      `${this.auth.cookieName()}=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${this.auth.secureCookie() ? "; Secure" : ""}`,
    );
    return this.auth.session(result.token);
  }
}
