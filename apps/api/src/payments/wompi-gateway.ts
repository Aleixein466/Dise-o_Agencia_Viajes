import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiEnv } from "../config/env";
import type { PaymentGateway, ProviderEvent, ProviderTransaction } from "./sandbox-gateway";

/**
 * Wompi SANDBOX adapter (PAYMENT_ADAPTER=wompi_sandbox). Test keys only; production keys and URLs are refused.
 * NOT validated against the real sandbox yet (docs/operations/WOMPI_SANDBOX.md).
 * Docs consulted 2026-11-14: https://docs.wompi.co/docs/colombia/widget-checkout-web/ ,
 * https://docs.wompi.co/docs/colombia/eventos/ , https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
 */
export const WOMPI_SANDBOX_BASE_URL = "https://sandbox.wompi.co/v1";
export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
/** Wompi retries a failed delivery up to 3 times within 24 h; the window covers that plus margin. */
export const WOMPI_EVENT_MAX_AGE_S = 25 * 3600;
export const WOMPI_EVENT_MAX_SKEW_S = 5 * 60;

export type WompiConfig = {
  publicKey?: string;
  privateKey?: string;
  eventsSecret?: string;
  integritySecret?: string;
  baseUrl: string;
  /** Public web origin: same-origin checkout hop and the redirect back to the portal. */
  webOrigin: string;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
};

export type WompiFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type WompiCheckoutIntent = {
  reference: string;
  amountCents: bigint;
  currency: string;
  expiresAt: Date | null;
  reservationId: string;
};

const PREFIXES = {
  publicKey: "pub_test_",
  privateKey: "prv_test_",
  eventsSecret: "test_events_",
  integritySecret: "test_integrity_",
} as const;

const STATUS_MAP: Record<string, string> = {
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  VOIDED: "VOIDED",
  ERROR: "ERROR",
  PENDING: "PENDING",
};

const SIGNED = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
const LOOKUP_TIMEOUT_MS = 10_000;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function valueAt(event: ProviderEvent, path: string): string {
  let cursor: unknown = event.data;
  for (const key of path.split("."))
    cursor = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>)[key] : undefined;
  return cursor === undefined || cursor === null ? "" : String(cursor);
}

export class WompiSandboxGateway implements PaymentGateway {
  readonly provider = "WOMPI" as const;

  static fromEnv(env: ApiEnv, fetchImpl?: WompiFetch): WompiSandboxGateway {
    return new WompiSandboxGateway(
      {
        publicKey: env.WOMPI_PUBLIC_KEY,
        privateKey: env.WOMPI_PRIVATE_KEY,
        eventsSecret: env.WOMPI_EVENTS_SECRET,
        integritySecret: env.WOMPI_INTEGRITY_SECRET,
        baseUrl: WOMPI_SANDBOX_BASE_URL,
        webOrigin: env.WEB_ORIGIN,
      },
      fetchImpl,
    );
  }

  constructor(
    private readonly config: WompiConfig,
    private readonly fetchImpl: WompiFetch = (url, init) => fetch(url, init),
  ) {
    if (config.baseUrl !== WOMPI_SANDBOX_BASE_URL)
      throw new Error(`Wompi baseUrl must be the sandbox URL ${WOMPI_SANDBOX_BASE_URL}`);
    for (const [field, prefix] of Object.entries(PREFIXES)) {
      const value = config[field as keyof typeof PREFIXES];
      if (value && !value.startsWith(prefix))
        throw new Error(`Wompi ${field} must start with "${prefix}" (production keys are refused)`);
    }
  }

  enabled(): boolean {
    return Object.keys(PREFIXES).every((field) => Boolean(this.config[field as keyof typeof PREFIXES]));
  }

  private require(field: keyof typeof PREFIXES): string {
    const value = this.config[field];
    if (!value) throw new Error(`Wompi ${field} is not configured`);
    return value;
  }

  private nowMs(): number {
    return this.config.now ? this.config.now() : Date.now();
  }

  /** sha256(reference + amountInCents + currency [+ expirationTime] + integritySecret), hex. */
  integritySignature(
    reference: string,
    amountInCents: number | bigint,
    currency: string,
    expirationTime?: string,
  ): string {
    return sha256(`${reference}${amountInCents}${currency}${expirationTime ?? ""}${this.require("integritySecret")}`);
  }

  /** Same-origin hop (GET /api/v1/payments/wompi/checkout/:reference) that redirects to the signed Web Checkout. */
  checkoutUrl(reference: string): string {
    return `${this.config.webOrigin}/api/v1/payments/wompi/checkout/${encodeURIComponent(reference)}`;
  }

  /** Portal page Wompi sends the payer back to (it appends ?id=<transaction id>). */
  returnUrl(reservationId: string): string {
    return `${this.config.webOrigin}/mi-cuenta/reservas/${encodeURIComponent(reservationId)}`;
  }

  /** Signed https://checkout.wompi.co/p/ URL. Every value comes from the stored payment, never from the client. */
  signedCheckoutUrl(intent: WompiCheckoutIntent): string {
    const expirationTime = intent.expiresAt?.toISOString();
    const params: Record<string, string> = {
      "public-key": this.require("publicKey"),
      currency: intent.currency,
      "amount-in-cents": intent.amountCents.toString(),
      reference: intent.reference,
      "signature:integrity": this.integritySignature(
        intent.reference,
        intent.amountCents,
        intent.currency,
        expirationTime,
      ),
      "redirect-url": this.returnUrl(intent.reservationId),
    };
    if (expirationTime) params["expiration-time"] = expirationTime;
    return `${WOMPI_CHECKOUT_URL}?${new URLSearchParams(params).toString()}`;
  }

  checksum(event: Pick<ProviderEvent, "data" | "signature" | "timestamp">): string {
    const values = event.signature.properties.map((p) => valueAt(event as ProviderEvent, p)).join("");
    return sha256(`${values}${event.timestamp}${this.require("eventsSecret")}`);
  }

  /** Signed id/status/amount, sandbox environment, fresh timestamp, constant-time checksum comparison. */
  verify(event: ProviderEvent): boolean {
    const props = event?.signature?.properties;
    if (!Array.isArray(props) || !SIGNED.every((p) => props.includes(p))) return false;
    if (event.environment !== "test") return false;
    if (typeof event.timestamp !== "number" || !Number.isInteger(event.timestamp)) return false;
    const ageS = this.nowMs() / 1000 - event.timestamp;
    if (ageS > WOMPI_EVENT_MAX_AGE_S || ageS < -WOMPI_EVENT_MAX_SKEW_S) return false;
    const expected = Buffer.from(this.checksum(event), "hex");
    const given = Buffer.from(String(event.signature.checksum ?? "").toLowerCase(), "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** GET {baseUrl}/transactions/{id} with the private key; null when Wompi answers 404. */
  async lookup(transactionId: string): Promise<ProviderTransaction | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { Authorization: `Bearer ${this.require("privateKey")}` },
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Wompi lookup failed with HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Record<string, unknown> };
      const d = body?.data;
      if (!d || typeof d.id !== "string") return null;
      const amount = d.amount_in_cents;
      return {
        id: d.id,
        reference: String(d.reference ?? ""),
        amountCents: typeof amount === "number" && Number.isSafeInteger(amount) ? BigInt(amount) : -1n,
        currency: String(d.currency ?? ""),
        status: STATUS_MAP[String(d.status)] ?? "ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
