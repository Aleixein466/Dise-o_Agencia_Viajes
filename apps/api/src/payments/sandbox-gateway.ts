import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";

/**
 * Wompi-shaped `transaction.updated` event. The checksum is
 * sha256(values of signature.properties + timestamp + events secret), as in Wompi's event integrity check.
 */
export type ProviderEvent = {
  event: string;
  data: { transaction: { id: string; reference: string; amount_in_cents: number; currency: string; status: string } };
  environment?: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at?: string;
};

export type ProviderTransaction = {
  id: string;
  reference: string;
  amountCents: bigint;
  currency: string;
  status: string;
};

/** Database value of Payment.provider / PaymentWebhookEvent.provider for each adapter. */
export type GatewayProvider = "SANDBOX_TEST" | "WOMPI";

/**
 * What PaymentsService needs from a provider. Every adapter goes through the same verified pipeline:
 * intent → checkoutUrl; webhook → verify (checksum) → lookup by id at the provider → applyPaymentEvent → ledger.
 */
export interface PaymentGateway {
  readonly provider: GatewayProvider;
  enabled(): boolean;
  /** Same-origin URL handed to the browser for a pending payment; the provider URL is built server-side. */
  checkoutUrl(reference: string): string;
  /** Checksum (and, for real providers, freshness/environment). Receives the raw, unstripped event body. */
  verify(event: ProviderEvent): boolean;
  /** The provider's own view of the transaction; null when it does not exist. */
  lookup(transactionId: string, client: SandboxLookupClient): Promise<ProviderTransaction | null>;
}

export type SandboxLookupClient = {
  sandboxTestTransaction: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ id: string; paymentReference: string; amountCents: bigint; currency: string; status: string } | null>;
  };
};

const PROPERTIES = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

function valueAt(event: ProviderEvent, path: string): string {
  let cursor: unknown = event.data;
  for (const key of path.split("."))
    cursor = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>)[key] : undefined;
  return cursor === undefined || cursor === null ? "" : String(cursor);
}

@Injectable()
export class SandboxTestGateway implements PaymentGateway {
  readonly provider = "SANDBOX_TEST" as const;
  constructor(@Inject(ENV) private readonly env: ApiEnv) {
    if (env.NODE_ENV === "production" && env.PAYMENT_ADAPTER === "sandbox_test")
      throw new Error("PAYMENT_ADAPTER=sandbox_test is not allowed in production");
  }

  enabled(): boolean {
    return this.env.PAYMENT_ADAPTER === "sandbox_test" && this.env.NODE_ENV !== "production";
  }

  checkoutUrl(reference: string): string {
    return `${this.env.WEB_ORIGIN}/pagos/prueba/${encodeURIComponent(reference)}`;
  }

  checksum(event: Pick<ProviderEvent, "data" | "signature" | "timestamp">): string {
    const values = event.signature.properties.map((path) => valueAt(event as ProviderEvent, path)).join("");
    return createHash("sha256")
      .update(`${values}${event.timestamp}${this.env.SANDBOX_PAYMENT_EVENTS_SECRET}`)
      .digest("hex");
  }

  verify(event: ProviderEvent): boolean {
    // The signed property list must cover id, status and amount; otherwise a forger could sign nothing useful.
    if (!PROPERTIES.every((p) => event.signature?.properties?.includes(p))) return false;
    const expected = Buffer.from(this.checksum(event), "hex");
    const given = Buffer.from(String(event.signature.checksum ?? ""), "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** Builds the event the simulated provider would send after the tester decides. */
  signedEvent(tx: {
    id: string;
    reference: string;
    amountCents: bigint;
    currency: string;
    status: string;
  }): ProviderEvent {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = {
      event: "transaction.updated",
      data: {
        transaction: {
          id: tx.id,
          reference: tx.reference,
          amount_in_cents: Number(tx.amountCents),
          currency: tx.currency,
          status: tx.status,
        },
      },
      environment: "test",
      signature: { properties: PROPERTIES, checksum: "" },
      timestamp,
      sent_at: new Date(timestamp * 1000).toISOString(),
    };
    body.signature.checksum = this.checksum(body);
    return body;
  }

  async lookup(transactionId: string, client: SandboxLookupClient): Promise<ProviderTransaction | null> {
    const row = await client.sandboxTestTransaction.findUnique({ where: { id: transactionId } });
    return row
      ? {
          id: row.id,
          reference: row.paymentReference,
          amountCents: row.amountCents,
          currency: row.currency,
          status: row.status,
        }
      : null;
  }
}
