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
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { FinanceService } from "./finance.service";
import { RECEIPT_MAX_BYTES } from "./receipt-storage";

const uuid = z.uuid();
const cents = z.string().regex(/^[1-9]\d{0,14}$/);
const signedCents = z.string().regex(/^-?[1-9]\d{0,14}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reservationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^RES-[0-9A-F]{12}$/);
const abonoFields = z.object({
  reservationId: z.uuid().optional(),
  reservationCode: reservationCode.optional(),
  savingsPlanId: z.uuid().optional(),
  amountCents: cents,
  method: z.enum(["BANK_TRANSFER", "CASH"]),
  bankReference: z.string().trim().max(120).optional(),
  paidAt: date,
});
const reason = z.object({ reason: z.string().trim().min(3).max(300) });
const adjustment = z.object({
  reservationId: z.uuid().optional(),
  reservationCode: reservationCode.optional(),
  savingsPlanId: z.uuid().optional(),
  amountCents: signedCents,
  reason: z.string().trim().min(10).max(300),
});
const plan = z.object({
  customerId: z.uuid().optional(),
  customerEmail: z.email().max(254).optional(),
  name: z.string().trim().min(3).max(160),
  goalCents: cents,
  reservationId: z.uuid().optional(),
  packageId: z.uuid().optional(),
  installments: z
    .array(z.object({ dueOn: date, amountCents: cents }))
    .min(1)
    .max(60),
});
const listQuery = z.object({
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
const targetQuery = z.object({ reservationId: z.uuid().optional(), savingsPlanId: z.uuid().optional() });

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
type Part = { type: "file" | "field"; fieldname: string; value?: unknown; toBuffer?: () => Promise<Buffer> };

/** Finance back office. MFA + RBAC on every route; mutations need CSRF + Origin. */
@Controller()
export class FinanceController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}

  private reader(request: FastifyRequest) {
    return this.auth.requireReadPermission(cookie(request, this.auth.cookieName()), "payments:read");
  }
  private writer(request: FastifyRequest, csrf: string | undefined, origin: string | undefined, permission: string) {
    return this.auth.requirePermission(cookie(request, this.auth.cookieName()), csrf, origin, permission);
  }

  @Post("finance/abonos")
  async register(
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    // Authorise before reading the upload so anonymous callers never make the server buffer a file.
    const principal = await this.writer(request, csrf, origin, "payments:register_abono");
    const fields: Record<string, unknown> = {};
    let raw: Buffer | null = null;
    const parts = (request as FastifyRequest & { parts: () => AsyncIterable<Part> }).parts();
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname !== "receipt" || raw) throw new BadRequestException("Adjunta un único comprobante");
        raw = await part.toBuffer!();
      } else if (typeof part.value === "string" && part.value !== "") fields[part.fieldname] = part.value;
    }
    if (!raw || raw.length > RECEIPT_MAX_BYTES) throw new BadRequestException("Adjunta el comprobante");
    const { reservationCode: code, ...input } = parse(abonoFields, fields);
    if (code && input.reservationId) throw new BadRequestException("Indica el código o el ID de la reserva, no ambos");
    const reservationId = code ? await this.finance.reservationIdByCode(code) : input.reservationId;
    return this.finance.registerAbono(
      principal.user.id,
      { ...input, reservationId, amountCents: BigInt(input.amountCents) },
      raw,
    );
  }

  @Get("finance/abonos")
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    const principal = await this.reader(request);
    const input = parse(listQuery, query);
    return this.finance.listAbonos(input.status, input.page, principal.permissions.includes("customers:read"));
  }

  @Get("finance/abonos/:id/receipt")
  async receipt(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.reader(request);
    const file = await this.finance.receipt(parse(uuid, id));
    reply
      .header("content-type", file.mimeType)
      .header("cache-control", "no-store")
      .header(
        "content-disposition",
        `attachment; filename="comprobante.${file.mimeType === "application/pdf" ? "pdf" : "webp"}"`,
      )
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox");
    return file.data;
  }

  @Post("finance/abonos/:id/approve")
  async approve(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const principal = await this.writer(request, csrf, origin, "payments:approve");
    return this.finance.approveAbono(principal.user.id, parse(uuid, id));
  }

  @Post("finance/abonos/:id/reject")
  async reject(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(reason, body);
    const principal = await this.writer(request, csrf, origin, "payments:approve");
    return this.finance.rejectAbono(principal.user.id, parse(uuid, id), input.reason);
  }

  @Post("finance/adjustments")
  async adjust(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const { reservationCode: code, ...input } = parse(adjustment, body);
    if (code && input.reservationId) throw new BadRequestException("Indica el código o el ID de la reserva, no ambos");
    const principal = await this.writer(request, csrf, origin, "payments:approve");
    const reservationId = code ? await this.finance.reservationIdByCode(code) : input.reservationId;
    return this.finance.adjust(
      principal.user.id,
      { reservationId, savingsPlanId: input.savingsPlanId },
      BigInt(input.amountCents),
      input.reason,
    );
  }

  @Get("finance/ledger")
  async ledger(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.reader(request);
    return this.finance.ledger(parse(targetQuery, query));
  }

  @Post("finance/savings-plans")
  async createPlan(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const { customerEmail, ...input } = parse(plan, body);
    if (Boolean(customerEmail) === Boolean(input.customerId))
      throw new BadRequestException("Indica el correo o el ID del cliente, solo uno");
    const principal = await this.writer(request, csrf, origin, "payments:approve");
    const customerId = input.customerId ?? (await this.finance.customerIdByEmail(customerEmail!));
    return this.finance.createPlan(principal.user.id, {
      ...input,
      customerId,
      goalCents: BigInt(input.goalCents),
      installments: input.installments.map((row) => ({ dueOn: row.dueOn, amountCents: BigInt(row.amountCents) })),
    });
  }

  @Get("finance/savings-plans")
  async plans(@Req() request: FastifyRequest, @Query("customerId") customerId?: string) {
    await this.reader(request);
    return this.finance.listPlans(customerId ? parse(uuid, customerId) : undefined);
  }

  @Get("finance/savings-plans/:id")
  async planDetail(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.reader(request);
    return this.finance.planDetail({ id: parse(uuid, id) });
  }

  @Post("finance/savings-plans/:id/cancel")
  async cancelPlan(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const input = parse(reason, body);
    const principal = await this.writer(request, csrf, origin, "payments:approve");
    return this.finance.cancelPlan(principal.user.id, parse(uuid, id), input.reason);
  }

  // ---------- Customer (owner-scoped) ----------

  @Get("me/savings-plans")
  async myPlans(@Req() request: FastifyRequest) {
    const principal = await this.auth.requireCustomer(cookie(request, this.auth.cookieName()), "payments:read_own");
    return this.finance.customerPlans(principal.user.id);
  }

  @Get("me/savings-plans/:id")
  async myPlan(@Param("id") id: string, @Req() request: FastifyRequest) {
    const principal = await this.auth.requireCustomer(cookie(request, this.auth.cookieName()), "payments:read_own");
    return this.finance.planDetail({ id: parse(uuid, id), userId: principal.user.id });
  }
}
