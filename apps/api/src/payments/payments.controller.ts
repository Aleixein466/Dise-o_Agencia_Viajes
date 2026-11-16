import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { PublicRateLimiter } from "../public/public-rate-limiter";
import { PaymentsService } from "./payments.service";

const uuid = z.uuid();
const reference = z.string().regex(/^TEST-[0-9A-F]{16}$/);
const intent = z.object({ amountCents: z.string().regex(/^[1-9]\d{0,14}$/), idempotencyKey: z.uuid() });
const decision = z.object({ outcome: z.enum(["APPROVED", "DECLINED"]) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
function cookie(request: FastifyRequest, name: string): string {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Online abonos. Customer routes are owner-scoped; the webhook is provider-facing and checksum-verified. */
@Controller()
export class PaymentsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PublicRateLimiter) private readonly limiter: PublicRateLimiter,
  ) {}

  @Post("me/reservations/:id/payments")
  async create(
    @Param("id") reservationId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(intent, body);
    const principal = await this.auth.requireCustomerMutation(
      cookie(request, this.auth.cookieName()),
      csrf,
      origin,
      "payments:read_own",
    );
    const result = await this.payments.createIntent(
      principal.user.id,
      parse(uuid, reservationId),
      BigInt(input.amountCents),
      input.idempotencyKey,
    );
    reply.status(result.created ? 201 : 200);
    return {
      reference: result.reference,
      amountCents: result.amountCents,
      status: result.status,
      checkoutUrl: result.checkoutUrl,
    };
  }

  @Get("payments/sandbox/:reference")
  async sandbox(@Param("reference") ref: string, @Req() request: FastifyRequest) {
    const principal = await this.auth.requireCustomer(cookie(request, this.auth.cookieName()), "payments:read_own");
    return this.payments.sandboxView(principal.user.id, parse(reference, ref));
  }

  @Post("payments/sandbox/:reference/decision")
  @HttpCode(200)
  async decide(
    @Param("reference") ref: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(decision, body);
    const principal = await this.auth.requireCustomerMutation(
      cookie(request, this.auth.cookieName()),
      csrf,
      origin,
      "payments:read_own",
    );
    return this.payments.sandboxDecide(principal.user.id, parse(reference, ref), input.outcome);
  }

  /** Same-origin hop to Wompi's Web Checkout; the signed URL is rebuilt from the stored payment on every visit. */
  @Get("payments/wompi/checkout/:reference")
  @Redirect()
  async wompiCheckout(
    @Param("reference") ref: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const principal = await this.auth.requireCustomer(cookie(request, this.auth.cookieName()), "payments:read_own");
    const url = await this.payments.wompiCheckoutTarget(principal.user.id, parse(reference, ref));
    reply.header("Cache-Control", "no-store");
    return { url, statusCode: 303 };
  }

  /** Simulated provider (PAYMENT_ADAPTER=sandbox_test only). */
  @Post("payments/webhooks/sandbox")
  @HttpCode(200)
  async webhook(@Body() body: unknown, @Req() request: FastifyRequest) {
    this.limiter.check(request.ip || "unknown", "payments-webhook", 120);
    return { result: await this.payments.handleEvent(body, "SANDBOX_TEST") };
  }

  /** Wompi SANDBOX events (PAYMENT_ADAPTER=wompi_sandbox only; 404 otherwise). No session: checksum-verified. */
  @Post("payments/webhooks/wompi")
  @HttpCode(200)
  async wompiWebhook(@Body() body: unknown, @Req() request: FastifyRequest) {
    this.limiter.check(request.ip || "unknown", "payments-webhook", 120);
    return { result: await this.payments.handleEvent(body, "WOMPI") };
  }
}
