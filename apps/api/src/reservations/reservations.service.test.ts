import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ReservationsService } from "./reservations.service";

const userA = "00000000-0000-4000-8000-00000000000a";
const quoteId = "00000000-0000-4000-8000-000000000001";
const resId = "00000000-0000-4000-8000-000000000002";
const staff = "00000000-0000-4000-8000-000000000003";
const service = (client: object) => new ReservationsService({ client: vi.fn().mockResolvedValue(client) } as never);
const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const acceptedQuote = (extra: object = {}) => ({
  id: quoteId,
  reference: "PUB-1",
  status: "ACCEPTED",
  revision: 3,
  adults: 2,
  children: 0,
  totalCents: 100n,
  currency: "COP",
  customerId: "c1",
  priceSnapshot: {},
  package: { title: "P", durationDays: 3, includes: ["Hotel"], excludes: [] },
  reservation: null,
  lines: [],
  ...extra,
});
const travelers = [
  { fullName: "Ana Uno", category: "ADULT" as const },
  { fullName: "Beto Dos", category: "ADULT" as const },
];

describe("ReservationsService — customer ownership", () => {
  it("scopes every customer quote/reservation lookup to the signed-in user and answers 404 for foreign rows", async () => {
    const client = {
      quote: { findFirst: vi.fn().mockResolvedValue(null) },
      reservation: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn() },
    };
    const value = service(client);
    await expect(value.customerQuote(userA, quoteId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(value.customerReservation(userA, resId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(value.customerCancel(userA, resId, "Cambio de planes", 0)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: quoteId, customer: { userId: userA, deletedAt: null } } }),
    );
    expect(client.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: resId, customer: { userId: userA, deletedAt: null } } }),
    );
    // A foreign cancellation never reaches the state machine or any write.
    expect(client.reservation.findUnique).not.toHaveBeenCalled();
  });

  it("allows a decision only while the proposal is PROPOSAL_SENT", async () => {
    const client = { quote: { findFirst: vi.fn().mockResolvedValue(acceptedQuote({ status: "NEW" })) } };
    await expect(service(client).decide(userA, quoteId, "ACCEPT", 3)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ReservationsService — reservation requests", () => {
  it("refuses a reservation unless the quote is ACCEPTED with a definitive total", async () => {
    for (const extra of [{ status: "PROPOSAL_SENT" }, { totalCents: null }]) {
      const client = { quote: { findFirst: vi.fn().mockResolvedValue(acceptedQuote(extra)) } };
      await expect(
        service(client).requestReservation(userA, quoteId, { startsOn: tomorrow, travelers }),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it("returns the existing reservation instead of creating a duplicate", async () => {
    const existing = { id: resId, code: "RES-1", status: "REQUEST_RECEIVED" };
    const client = {
      quote: { findFirst: vi.fn().mockResolvedValue(acceptedQuote({ reservation: existing })) },
      $transaction: vi.fn(),
    };
    await expect(
      service(client).requestReservation(userA, quoteId, { startsOn: tomorrow, travelers }),
    ).resolves.toEqual({ created: false, ...existing });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("resolves a concurrent duplicate (unique quoteId race) to the winning reservation", async () => {
    const winner = { id: resId, code: "RES-2", status: "REQUEST_RECEIVED" };
    const client = {
      quote: { findFirst: vi.fn().mockResolvedValue(acceptedQuote()) },
      $transaction: vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" })),
      reservation: { findUnique: vi.fn().mockResolvedValue(winner) },
    };
    await expect(
      service(client).requestReservation(userA, quoteId, { startsOn: tomorrow, travelers }),
    ).resolves.toEqual({ created: false, ...winner });
  });

  it("creates REQUEST_RECEIVED with a frozen snapshot of conditions and history", async () => {
    const tx = {
      reservation: { create: vi.fn().mockResolvedValue({ id: resId, code: "RES-3", status: "REQUEST_RECEIVED" }) },
      auditLog: { create: vi.fn() },
    };
    const client = {
      quote: { findFirst: vi.fn().mockResolvedValue(acceptedQuote()) },
      $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const result = await service(client).requestReservation(userA, quoteId, { startsOn: tomorrow, travelers });
    expect(result).toMatchObject({ created: true, status: "REQUEST_RECEIVED" });
    const data = tx.reservation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: "REQUEST_RECEIVED",
      totalCents: 100n,
      priceSnapshot: { conditions: { inclusions: ["Hotel"] } },
    });
    expect(data.statusHistory.create).toMatchObject({
      toStatus: "REQUEST_RECEIVED",
      event: "SUBMIT_REQUEST",
      role: "CUSTOMER",
    });
    expect(data.code).toMatch(/^RES-[0-9A-F]{12}$/);
  });
});

describe("ReservationsService — staff transitions", () => {
  const row = {
    status: "PENDING_VALIDATION",
    version: 4,
    totalCents: 100n,
    requiredDepositCents: 0n,
    availabilityValidatedAt: null,
  };

  it("rejects a stale version with 409 before any write", async () => {
    const client = { reservation: { findUnique: vi.fn().mockResolvedValue(row) }, $transaction: vi.fn() };
    await expect(
      service(client).staffEvent(resId, { id: staff, role: "ADMIN" }, "APPROVE_FOR_PAYMENT", 3),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("only staff may confirm availability; a customer is forbidden", async () => {
    const client = { reservation: { findUnique: vi.fn().mockResolvedValue(row) }, $transaction: vi.fn() };
    await expect(
      service(client).staffEvent(resId, { id: userA, role: "CUSTOMER" }, "APPROVE_FOR_PAYMENT", 4),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("records manual availability validation and never jumps to CONFIRMED without verified payment", async () => {
    const tx = {
      reservation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reservationStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = {
      reservation: { findUnique: vi.fn().mockResolvedValueOnce(row).mockResolvedValue(null) },
      $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
    };
    await expect(
      service(client).staffEvent(resId, { id: staff, role: "ADVISOR" }, "APPROVE_FOR_PAYMENT", 4),
    ).rejects.toBeInstanceOf(NotFoundException);
    const update = tx.reservation.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: resId, version: 4, status: "PENDING_VALIDATION" });
    expect(update.data).toMatchObject({ status: "PENDING_PAYMENT", validatedById: staff });
    expect(update.data.availabilityValidatedAt).toBeInstanceOf(Date);
    expect(tx.reservationStatusHistory.create).toHaveBeenCalled();
  });

  it("rejects an invalid transition (CONFIRM is not offered; START_VALIDATION from PENDING_VALIDATION) with 409", async () => {
    const client = { reservation: { findUnique: vi.fn().mockResolvedValue(row) }, $transaction: vi.fn() };
    await expect(
      service(client).staffEvent(resId, { id: staff, role: "ADMIN" }, "START_VALIDATION", 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("admin detail selects only id/name for people (no password hashes or MFA data)", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await expect(service({ reservation: { findUnique } }).adminDetail(resId, false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const select = findUnique.mock.calls[0][0].select;
    for (const key of ["validatedBy", "assignedAdvisor"])
      expect(select[key]).toEqual({ select: { id: true, name: true } });
    expect(select.statusHistory.select.actor).toEqual({ select: { id: true, name: true } });
    expect(select.crmNotes.select.author).toEqual({ select: { id: true, name: true } });
  });
});
