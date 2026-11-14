import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { ReservationsService } from "../reservations/reservations.service";
import { PaymentsService } from "./payments.service";
import { SandboxTestGateway } from "./sandbox-gateway";

const env = parseEnv({ PAYMENT_ADAPTER: "sandbox_test", WEB_ORIGIN: "http://127.0.0.1:3201" });
const gateway = new SandboxTestGateway(env);
const user = "00000000-0000-4000-8000-00000000000a";
const resId = "00000000-0000-4000-8000-000000000002";
const txId = "00000000-0000-4000-8000-0000000000aa";
const payment = {
  id: "p1",
  reference: "TEST-0123456789ABCDEF",
  amountCents: 3000n,
  currency: "COP",
  status: "PENDING",
  customerId: "c1",
  reservationId: resId,
  provider: "SANDBOX_TEST",
};
const service = (client: object, g = gateway) =>
  new PaymentsService({ client: vi.fn().mockResolvedValue(client) } as never, g);

function webhookClient(
  lookupStatus: string,
  reservation = {
    status: "PENDING_PAYMENT",
    version: 2,
    totalCents: 10000n,
    requiredDepositCents: 3000n,
    availabilityValidatedAt: new Date(),
  },
) {
  const tx = {
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ledgerEntry: { create: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 3000n } }) },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue(reservation), update: vi.fn() },
    reservationStatusHistory: { create: vi.fn() },
    paymentWebhookEvent: { update: vi.fn() },
  };
  const client = {
    paymentWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "evt1" }), update: vi.fn() },
    sandboxTestTransaction: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: txId,
          paymentReference: payment.reference,
          amountCents: 3000n,
          currency: "COP",
          status: lookupStatus,
        }),
    },
    payment: { findUnique: vi.fn().mockResolvedValue(payment) },
    $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { client, tx };
}
const event = (status: string) =>
  gateway.signedEvent({ id: txId, reference: payment.reference, amountCents: 3000n, currency: "COP", status });

describe("sandbox gateway", () => {
  it("is refused in production", () => {
    expect(() => new SandboxTestGateway({ ...env, NODE_ENV: "production" })).toThrow();
    expect(() =>
      parseEnv({ NODE_ENV: "production", CUSTOMER_CODE_SECRET: "x".repeat(32), PAYMENT_ADAPTER: "sandbox_test" }),
    ).toThrow(/PAYMENT_ADAPTER/);
  });

  it("verifies the checksum and requires id, status and amount to be signed", () => {
    expect(gateway.verify(event("APPROVED"))).toBe(true);
    const tampered = event("APPROVED");
    tampered.data.transaction.amount_in_cents = 1;
    expect(gateway.verify(tampered)).toBe(false);
    const partial = event("APPROVED");
    partial.signature.properties = ["transaction.id"];
    partial.signature.checksum = gateway.checksum(partial);
    expect(gateway.verify(partial)).toBe(false);
  });
});

describe("PaymentsService.handleEvent", () => {
  it("rejects a forged event with 401 and stores it outside the idempotency slot", async () => {
    const { client } = webhookClient("APPROVED");
    const forged = event("APPROVED");
    forged.signature.checksum = "00".repeat(32);
    await expect(service(client).handleEvent(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(client.paymentWebhookEvent.create.mock.calls[0][0].data).toMatchObject({
      checksumValid: false,
      providerEventId: expect.stringMatching(/^invalid:/),
    });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("treats a repeated event as a no-op", async () => {
    const { client } = webhookClient("APPROVED");
    client.paymentWebhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    Object.assign(client.paymentWebhookEvent, {
      findUnique: vi.fn().mockResolvedValue({ id: "evt0", processedAt: new Date() }),
    });
    await expect(service(client).handleEvent(event("APPROVED"))).resolves.toBe("duplicate");
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("ignores an event the provider lookup contradicts (no money moves)", async () => {
    const { client } = webhookClient("DECLINED");
    await expect(service(client).handleEvent(event("APPROVED"))).resolves.toBe("ignored");
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingError: "EVENT_LOOKUP_MISMATCH" }) }),
    );
  });

  it("approved: one ledger entry, reservation PARTIALLY_PAID via PAYMENT_SETTLED, never CONFIRMED", async () => {
    const { client, tx } = webhookClient("APPROVED");
    await expect(service(client).handleEvent(event("APPROVED"))).resolves.toBe("processed");
    expect(tx.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "p1", status: "PENDING" },
      data: { status: "APPROVED" },
    });
    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toMatchObject({
      kind: "PAYMENT_APPROVED",
      amountCents: 3000n,
      paymentId: "p1",
    });
    expect(tx.reservation.update.mock.calls[0][0].data.status).toBe("PARTIALLY_PAID");
    expect(tx.reservationStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      event: "PAYMENT_SETTLED",
      role: "SYSTEM",
    });
  });

  it("declined: no ledger entry and no reservation change", async () => {
    const { client, tx } = webhookClient("DECLINED");
    await expect(service(client).handleEvent(event("DECLINED"))).resolves.toBe("processed");
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it("money for a cancelled reservation is held for review, not applied", async () => {
    const { client, tx } = webhookClient("APPROVED", {
      status: "CANCELLED",
      version: 3,
      totalCents: 10000n,
      requiredDepositCents: 0n,
      availabilityValidatedAt: new Date(),
    });
    await service(client).handleEvent(event("APPROVED"));
    expect(tx.reservation.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "payment.settlement_review" }) }),
    );
  });

  it("is unavailable when the adapter is disabled", async () => {
    const off = new SandboxTestGateway(parseEnv({}));
    await expect(service({}, off).handleEvent(event("APPROVED"))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("PaymentsService.createIntent", () => {
  const key = "00000000-0000-4000-8000-0000000000f1";
  function intentClient(reservation: object, paid = 0n) {
    const tx = {
      $queryRaw: vi.fn(),
      reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue(reservation) },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: paid } }) },
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
    return { client, tx };
  }
  const payable = { status: "PENDING_PAYMENT", totalCents: 10000n, currency: "COP", payments: [] };

  it("scopes to the owner (404) and is 503 when disabled", async () => {
    const { client } = intentClient(payable);
    client.reservation.findFirst.mockResolvedValue(null);
    await expect(service(client).createIntent(user, resId, 100n, key)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: resId, customer: { userId: user, deletedAt: null } } }),
    );
    await expect(
      service(client, new SandboxTestGateway(parseEnv({}))).createIntent(user, resId, 100n, key),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("refuses amounts above the verified balance and non-payable states", async () => {
    await expect(
      service(intentClient(payable, 9000n).client).createIntent(user, resId, 1001n, key),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(intentClient({ ...payable, status: "PENDING_VALIDATION" }).client).createIntent(user, resId, 100n, key),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows only one live pending payment per reservation", async () => {
    const live = {
      ...payable,
      payments: [{ ...payment, createdAt: new Date(), approvedAt: null, expiresAt: new Date(Date.now() + 60_000) }],
    };
    await expect(service(intentClient(live).client).createIntent(user, resId, 100n, key)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("creates a TEST- payment under a row lock; the same key replays it", async () => {
    const { client, tx } = intentClient(payable);
    const created = await service(client).createIntent(user, resId, 3000n, key);
    expect(created).toMatchObject({
      created: true,
      reference: payment.reference,
      checkoutUrl: `http://127.0.0.1:3201/pagos/prueba/${payment.reference}`,
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create.mock.calls[0][0].data).toMatchObject({
      provider: "SANDBOX_TEST",
      amountCents: 3000n,
      reference: expect.stringMatching(/^TEST-[0-9A-F]{16}$/),
    });
    client.payment.findUnique.mockResolvedValue({
      reference: payment.reference,
      amountCents: 3000n,
      status: "PENDING",
      reservationId: resId,
    });
    await expect(service(client).createIntent(user, resId, 3000n, key)).resolves.toMatchObject({
      created: false,
      reference: payment.reference,
    });
    client.payment.findUnique.mockResolvedValue({
      reference: payment.reference,
      amountCents: 3000n,
      status: "PENDING",
      reservationId: "other",
    });
    await expect(service(client).createIntent(user, resId, 3000n, key)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("staff CONFIRM uses verified ledger money", () => {
  function confirmClient(paid: bigint, deposit: bigint) {
    return {
      reservation: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            status: "PARTIALLY_PAID",
            version: 5,
            totalCents: 10000n,
            requiredDepositCents: deposit,
            availabilityValidatedAt: new Date(),
          }),
      },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: paid } }) },
      $transaction: vi.fn().mockRejectedValue(new Error("reached write")),
    };
  }
  const staff = { id: "00000000-0000-4000-8000-000000000003", role: "ADMIN" as const };

  it("is refused while the deposit is not covered", async () => {
    const value = new ReservationsService({ client: vi.fn().mockResolvedValue(confirmClient(2000n, 3000n)) } as never);
    await expect(value.staffEvent(resId, staff, "CONFIRM", 5)).rejects.toBeInstanceOf(ConflictException);
  });

  it("proceeds to the write once the deposit is covered", async () => {
    const value = new ReservationsService({ client: vi.fn().mockResolvedValue(confirmClient(3000n, 3000n)) } as never);
    await expect(value.staffEvent(resId, staff, "CONFIRM", 5)).rejects.toThrow("reached write");
  });

  it("only fixes a deposit within 0..total when approving availability", async () => {
    const value = new ReservationsService({ client: vi.fn().mockResolvedValue(confirmClient(0n, 0n)) } as never);
    await expect(value.staffEvent(resId, staff, "CONFIRM", 5, undefined, 100n)).rejects.toThrow(/abono mínimo/);
  });
});

describe("review fixes", () => {
  it("re-processes a retried event whose first processing did not finish", async () => {
    const { client, tx } = webhookClient("APPROVED");
    client.paymentWebhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    Object.assign(client.paymentWebhookEvent, {
      findUnique: vi.fn().mockResolvedValue({ id: "evt1", processedAt: null }),
    });
    await expect(service(client).handleEvent(event("APPROVED"))).resolves.toBe("processed");
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("a concurrent delivery that loses the conditional update writes no ledger entry and no error", async () => {
    const { client, tx } = webhookClient("APPROVED");
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service(client).handleEvent(event("APPROVED"))).resolves.toBe("processed");
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  function decideClient(paymentStatus: string, reservationStatus: string, paid = 0n) {
    return {
      payment: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...payment, status: paymentStatus, expiresAt: new Date(Date.now() + 60_000) }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ status: paymentStatus }),
      },
      sandboxTestTransaction: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      reservation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: reservationStatus, totalCents: 10000n }) },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: paid } }) },
    };
  }

  it("the simulated provider refuses to capture for a closed or fully paid reservation", async () => {
    const closed = decideClient("PENDING", "CANCELLED");
    await expect(service(closed).sandboxDecide(user, payment.reference, "APPROVED")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(closed.sandboxTestTransaction.create).not.toHaveBeenCalled();
    const paidUp = decideClient("PENDING", "PARTIALLY_PAID", 8000n);
    await expect(service(paidUp).sandboxDecide(user, payment.reference, "APPROVED")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("a repeated decision on a settled payment returns its status without re-delivering", async () => {
    const settled = decideClient("APPROVED", "PARTIALLY_PAID");
    settled.sandboxTestTransaction.findUnique.mockResolvedValue({
      id: txId,
      paymentReference: payment.reference,
      amountCents: 3000n,
      currency: "COP",
      status: "APPROVED",
    });
    await expect(service(settled).sandboxDecide(user, payment.reference, "APPROVED")).resolves.toEqual({
      status: "APPROVED",
      reservationId: resId,
    });
  });
});

describe("closing a reservation voids pending payment intents", () => {
  it("CANCEL marks PENDING payments VOIDED in the same transaction", async () => {
    const tx = {
      reservation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      payment: { updateMany: vi.fn() },
      reservationStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = {
      reservation: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            status: "PENDING_PAYMENT",
            version: 2,
            totalCents: 10000n,
            requiredDepositCents: 0n,
            availabilityValidatedAt: new Date(),
          })
          .mockResolvedValue(null),
      },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: null } }) },
      $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const value = new ReservationsService({ client: vi.fn().mockResolvedValue(client) } as never);
    await expect(value.staffEvent(resId, { id: user, role: "ADMIN" }, "CANCEL", 2, "Sin cupo")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { reservationId: resId, status: "PENDING" },
      data: expect.objectContaining({ status: "VOIDED" }),
    });
  });
});
