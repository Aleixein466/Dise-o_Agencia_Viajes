import { createHash, timingSafeEqual } from "node:crypto";
import type { ProviderEvent, ProviderTransaction } from "./sandbox-gateway";

/**
 * Wompi sandbox adapter, prepared but NOT wired (blocked on PC-5: real sandbox keys).
 * Docs consulted 2026-11-14: https://docs.wompi.co/docs/colombia/widget-checkout-web/ ,
 * https://docs.wompi.co/docs/colombia/eventos/ , https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
 */
export const WOMPI_SANDBOX_BASE_URL = "https://sandbox.wompi.co/v1";
export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";

export type WompiConfig = {
  publicKey?: string;
  privateKey?: string;
  eventsSecret?: string;
  integritySecret?: string;
  baseUrl: string;
  redirectUrl: string;
};

export type WompiFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

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

export class WompiSandboxGateway {
  readonly provider = "WOMPI_SANDBOX" as const;

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

  /** sha256(reference + amountInCents + currency [+ expirationTime] + integritySecret), hex. */
  integritySignature(
    reference: string,
    amountInCents: number | bigint,
    currency: string,
    expirationTime?: string,
  ): string {
    return sha256(`${reference}${amountInCents}${currency}${expirationTime ?? ""}${this.require("integritySecret")}`);
  }

  /** GET parameters for https://checkout.wompi.co/p/ (Web Checkout). */
  checkoutParams(
    reference: string,
    amountInCents: number | bigint,
    currency: string,
    expirationTime?: string,
  ): Record<string, string> {
    const params: Record<string, string> = {
      "public-key": this.require("publicKey"),
      currency,
      "amount-in-cents": String(amountInCents),
      reference,
      "signature:integrity": this.integritySignature(reference, amountInCents, currency, expirationTime),
      "redirect-url": this.config.redirectUrl,
    };
    if (expirationTime) params["expiration-time"] = expirationTime;
    return params;
  }

  checkoutUrl(reference: string, amountInCents: number | bigint, currency: string, expirationTime?: string): string {
    const query = new URLSearchParams(this.checkoutParams(reference, amountInCents, currency, expirationTime));
    return `${WOMPI_CHECKOUT_URL}?${query.toString()}`;
  }

  checksum(event: Pick<ProviderEvent, "data" | "signature" | "timestamp">): string {
    const values = event.signature.properties.map((p) => valueAt(event as ProviderEvent, p)).join("");
    return sha256(`${values}${event.timestamp}${this.require("eventsSecret")}`);
  }

  verify(event: ProviderEvent): boolean {
    const props = event?.signature?.properties;
    const needed = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    if (!Array.isArray(props) || !needed.every((p) => props.includes(p))) return false;
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
      return {
        id: d.id,
        reference: String(d.reference ?? ""),
        amountCents: BigInt(Number(d.amount_in_cents ?? 0)),
        currency: String(d.currency ?? ""),
        status: STATUS_MAP[String(d.status)] ?? "ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
