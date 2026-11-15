import { createHash } from "node:crypto";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { createPaymentGateway } from "./gateway";
import { PaymentsService } from "./payments.service";
import { SandboxTestGateway, type ProviderEvent } from "./sandbox-gateway";
import { WOMPI_SANDBOX_BASE_URL, WompiSandboxGateway, type WompiFetch } from "./wompi-gateway";

// Clearly fake keys in Wompi's test format. Nothing here contacts Wompi: fetch is always injected.
const FAKE = "x".repeat(20);
const KEYS = {
  WOMPI_PUBLIC_KEY: `pub_test_${FAKE}`,
  WOMPI_PRIVATE_KEY: `prv_test_${FAKE}`,
  WOMPI_EVENTS_SECRET: `test_events_${FAKE}`,
  WOMPI_INTEGRITY_SECRET: `test_integrity_${FAKE}`,
};
const WEB = "https://staging.example.test";
const env = parseEnv({ PAYMENT_ADAPTER: "wompi_sandbox", WEB_ORIGIN: WEB, ...KEYS });
const PROD = { NODE_ENV: "production", CUSTOMER_CODE_SECRET: "y".repeat(32) };

const resId = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-00000000000a";
const wompiTxId = "1234-1610641025-49201";
const payment = {
  id: "p1",
  reference: "TEST-0123456789ABCDEF",
  amountCents: 3000n,
  currency: "COP",
  status: "PENDING",
  customerId: "c1",
  reservationId: resId,
  provider: "WOMPI",
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Lookup = { id: string; reference: string; amount_in_cents: number; currency: string; status: string };
function wompi(lookup: Lookup | null) {
  const calls: { url: string; auth: string }[] = [];
  const fetchImpl: WompiFetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization ?? "" });
    return lookup
      ? { ok: true, status: 200, json: async () => ({ data: { ...lookup, customer_email: "payer@example.test" } }) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  return { gateway: createPaymentGateway(env, fetchImpl), calls };
}

function event(status = "APPROVED", over: { timestamp?: number; amount?: number } = {}) {
  const timestamp = over.timestamp ?? Math.floor(Date.now() / 1000);
  const amount = over.amount ?? 3000;
  const body = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: wompiTxId,
        reference: payment.reference,
        amount_in_cents: amount,
        currency: "COP",
        status,
        customer_email: "payer@example.test",
        payment_method_type: "CARD",
      },
    },
    environment: "test",
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: sha(`${wompiTxId}${status}${amount}${timestamp}${KEYS.WOMPI_EVENTS_SECRET}`),
    },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
  };
  return body as ProviderEvent;
}

function db() {
  const tx = {
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ledgerEntry: { create: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 3000n } }) },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    reservation: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        status: "PENDING_PAYMENT",
        version: 2,
        totalCents: 10000n,
        requiredDepositCents: 3000n,
        availabilityValidatedAt: new Date(),
      }),
      update: vi.fn(),
    },
    reservationStatusHistory: { create: vi.fn() },
    paymentWebhookEvent: { update: vi.fn() },
  };
  const client = {
    paymentWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "evt1" }), update: vi.fn(), findUnique: vi.fn() },
    payment: { findUnique: vi.fn().mockResolvedValue(payment), findFirst: vi.fn().mockResolvedValue(payment) },
    reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "PENDING_PAYMENT", totalCents: 10000n }) },
    ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0n } }) },
    $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { client, tx };
}
const service = (client: object, gateway: ReturnType<typeof createPaymentGateway>) =>
  new PaymentsService({ client: vi.fn().mockResolvedValue(client) } as never, gateway);
const looked: Lookup = {
  id: wompiTxId,
  reference: payment.reference,
  amount_in_cents: 3000,
  currency: "COP",
  status: "APPROVED",
};

describe("PAYMENT_ADAPTER=wompi_sandbox configuration", () => {
  it("needs all four test keys; selects the Wompi gateway", () => {
    expect(createPaymentGateway(env)).toBeInstanceOf(WompiSandboxGateway);
    expect(() => parseEnv({ PAYMENT_ADAPTER: "wompi_sandbox", ...KEYS, WOMPI_EVENTS_SECRET: undefined })).toThrow(
      /WOMPI_EVENTS_SECRET/,
    );
    expect(() => parseEnv({ PAYMENT_ADAPTER: "wompi_sandbox", ...KEYS, WOMPI_PUBLIC_KEY: "pub_test_" })).toThrow(
      /WOMPI_PUBLIC_KEY/,
    );
  });

  it("refuses production keys at startup, whatever the adapter", () => {
    for (const [name, value] of [
      ["WOMPI_PUBLIC_KEY", `pub_prod_${FAKE}`],
      ["WOMPI_PRIVATE_KEY", `prv_prod_${FAKE}`],
      ["WOMPI_EVENTS_SECRET", `prod_events_${FAKE}`],
      ["WOMPI_INTEGRITY_SECRET", `prod_integrity_${FAKE}`],
    ]) {
      expect(() => parseEnv({ PAYMENT_ADAPTER: "wompi_sandbox", ...KEYS, [name]: value })).toThrow(name);
      expect(() => parseEnv({ PAYMENT_ADAPTER: "disabled", [name]: value })).toThrow(name);
    }
  });

  it("is allowed with NODE_ENV=production (sandbox-only staging), unlike sandbox_test", () => {
    expect(parseEnv({ ...PROD, PAYMENT_ADAPTER: "wompi_sandbox", ...KEYS }).PAYMENT_ADAPTER).toBe("wompi_sandbox");
    expect(() => parseEnv({ ...PROD, PAYMENT_ADAPTER: "sandbox_test" })).toThrow(/PAYMENT_ADAPTER/);
  });

  it("the default stays disabled and every webhook answers 404", async () => {
    const off = parseEnv({});
    expect(off.PAYMENT_ADAPTER).toBe("disabled");
    const gateway = createPaymentGateway(off);
    await expect(service({}, gateway).handleEvent(event(), "WOMPI")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({}, gateway).handleEvent(event(), "SANDBOX_TEST")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("/webhooks/wompi is 404 under sandbox_test and /webhooks/sandbox is 404 under wompi_sandbox", async () => {
    const sandbox = new SandboxTestGateway(parseEnv({ PAYMENT_ADAPTER: "sandbox_test" }));
    await expect(service({}, sandbox).handleEvent(event(), "WOMPI")).rejects.toBeInstanceOf(NotFoundException);
    const { gateway } = wompi(looked);
    await expect(service({}, gateway).handleEvent(event(), "SANDBOX_TEST")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({}, gateway).sandboxView(user, payment.reference)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Wompi sandbox webhook pipeline", () => {
  it("APPROVED: checksum ok, provider lookup by id, exactly one ledger entry and the reservation settles", async () => {
    const { client, tx } = db();
    const { gateway, calls } = wompi(looked);
    await expect(service(client, gateway).handleEvent(event(), "WOMPI")).resolves.toBe("processed");
    expect(calls).toEqual([
      { url: `${WOMPI_SANDBOX_BASE_URL}/transactions/${wompiTxId}`, auth: `Bearer ${KEYS.WOMPI_PRIVATE_KEY}` },
    ]);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "p1", status: "PENDING" },
      data: { status: "APPROVED", providerTransactionId: wompiTxId },
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toMatchObject({ kind: "PAYMENT_APPROVED", amountCents: 3000n });
    expect(tx.reservation.update.mock.calls[0][0].data.status).toBe("PARTIALLY_PAID");
    const stored = client.paymentWebhookEvent.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ provider: "WOMPI", checksumValid: true, providerTransactionId: wompiTxId });
    expect(JSON.stringify(stored.payload)).not.toContain("payer@example.test");
  });

  it("a bad checksum is 401, stored outside the idempotency slot, and never reaches the provider", async () => {
    const { client } = db();
    const { gateway, calls } = wompi(looked);
    const forged = event();
    forged.signature.checksum = "00".repeat(32);
    await expect(service(client, gateway).handleEvent(forged, "WOMPI")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(client.paymentWebhookEvent.create.mock.calls[0][0].data).toMatchObject({
      provider: "WOMPI",
      checksumValid: false,
      providerEventId: expect.stringMatching(/^invalid:/),
    });
    expect(calls).toHaveLength(0);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("a stale event (valid checksum, old timestamp) is 401", async () => {
    const { client } = db();
    const { gateway, calls } = wompi(looked);
    const stale = event("APPROVED", { timestamp: Math.floor(Date.now() / 1000) - 26 * 3600 });
    await expect(service(client, gateway).handleEvent(stale, "WOMPI")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["amount", { amount_in_cents: 1000 }],
    ["reference", { reference: "TEST-FFFFFFFFFFFFFFFF" }],
    ["status", { status: "PENDING" }],
    ["currency", { currency: "USD" }],
  ])("a lookup that contradicts the event (%s) is ignored: no money moves", async (_field, diff) => {
    const { client } = db();
    const { gateway } = wompi({ ...looked, ...diff });
    await expect(service(client, gateway).handleEvent(event(), "WOMPI")).resolves.toBe("ignored");
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingError: "EVENT_LOOKUP_MISMATCH" }) }),
    );
  });

  it("a signed event whose amount differs from the stored payment is not applied", async () => {
    const { client } = db();
    const { gateway } = wompi({ ...looked, amount_in_cents: 1000 });
    await expect(service(client, gateway).handleEvent(event("APPROVED", { amount: 1000 }), "WOMPI")).resolves.toBe(
      "ignored",
    );
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("an unknown transaction at the provider is ignored", async () => {
    const { client } = db();
    const { gateway } = wompi(null);
    await expect(service(client, gateway).handleEvent(event(), "WOMPI")).resolves.toBe("ignored");
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("a replay of a processed event is a duplicate", async () => {
    const { client } = db();
    client.paymentWebhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    client.paymentWebhookEvent.findUnique.mockResolvedValue({ id: "evt0", processedAt: new Date() });
    const { gateway, calls } = wompi(looked);
    await expect(service(client, gateway).handleEvent(event(), "WOMPI")).resolves.toBe("duplicate");
    expect(client.paymentWebhookEvent.findUnique.mock.calls[0][0].where.provider_providerEventId.provider).toBe(
      "WOMPI",
    );
    expect(calls).toHaveLength(0);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("a payment of another provider with the same reference is not touched", async () => {
    const { client } = db();
    client.payment.findUnique.mockResolvedValue({ ...payment, provider: "SANDBOX_TEST" });
    const { gateway } = wompi(looked);
    await expect(service(client, gateway).handleEvent(event(), "WOMPI")).resolves.toBe("ignored");
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});

describe("Wompi sandbox checkout", () => {
  it("the intent stores provider WOMPI and returns the same-origin hop", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      reservation: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ status: "PENDING_PAYMENT", totalCents: 10000n, currency: "COP", payments: [] }),
      },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0n } }) },
      payment: {
        create: vi.fn().mockResolvedValue({ reference: payment.reference, amountCents: 3000n, status: "PENDING" }),
      },
      auditLog: { create: vi.fn() },
    };
    const client = {
      reservation: { findFirst: vi.fn().mockResolvedValue({ id: resId, customerId: "c1" }) },
      payment: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const { gateway } = wompi(looked);
    const created = await service(client, gateway).createIntent(
      user,
      resId,
      3000n,
      "00000000-0000-4000-8000-0000000000f1",
    );
    expect(tx.payment.create.mock.calls[0][0].data).toMatchObject({ provider: "WOMPI", amountCents: 3000n });
    expect(created.checkoutUrl).toBe(`${WEB}/api/v1/payments/wompi/checkout/${payment.reference}`);
  });

  it("redirects to a Web Checkout signed from the stored amount, currency and PENDING_TTL expiry", async () => {
    const { client } = db();
    const expiresAt = new Date(Date.now() + 20 * 60_000);
    client.payment.findFirst.mockResolvedValue({ ...payment, expiresAt });
    const { gateway } = wompi(looked);
    const u = new URL(await service(client, gateway).wompiCheckoutTarget(user, payment.reference));
    expect(client.payment.findFirst.mock.calls[0][0].where).toEqual({
      reference: payment.reference,
      provider: "WOMPI",
      customer: { userId: user, deletedAt: null },
    });
    expect(u.origin).toBe("https://checkout.wompi.co");
    expect(u.searchParams.get("amount-in-cents")).toBe("3000");
    expect(u.searchParams.get("expiration-time")).toBe(expiresAt.toISOString());
    expect(u.searchParams.get("signature:integrity")).toBe(
      sha(`${payment.reference}3000COP${expiresAt.toISOString()}${KEYS.WOMPI_INTEGRITY_SECRET}`),
    );
    expect(u.searchParams.get("redirect-url")).toBe(`${WEB}/mi-cuenta/reservas/${resId}`);
  });

  it("sends the customer back to the reservation when the payment expired or is no longer payable", async () => {
    const { gateway } = wompi(looked);
    const back = `${WEB}/mi-cuenta/reservas/${resId}`;
    const expired = db().client;
    expired.payment.findFirst.mockResolvedValue({ ...payment, expiresAt: new Date(Date.now() - 1000) });
    await expect(service(expired, gateway).wompiCheckoutTarget(user, payment.reference)).resolves.toBe(back);
    const paidUp = db().client;
    paidUp.payment.findFirst.mockResolvedValue({ ...payment, expiresAt: new Date(Date.now() + 60_000) });
    paidUp.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountCents: 9000n } });
    await expect(service(paidUp, gateway).wompiCheckoutTarget(user, payment.reference)).resolves.toBe(back);
  });

  it("is 404 for another customer's payment and when the adapter is not wompi_sandbox", async () => {
    const { client } = db();
    client.payment.findFirst.mockResolvedValue(null);
    await expect(
      service(client, wompi(looked).gateway).wompiCheckoutTarget(user, payment.reference),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service(db().client, createPaymentGateway(parseEnv({}))).wompiCheckoutTarget(user, payment.reference),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
