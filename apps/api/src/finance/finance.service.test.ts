import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service";
import { validateReceipt } from "./receipt-storage";
import { allocateInstallments, validateSchedule } from "./savings";

const registrar = "00000000-0000-4000-8000-0000000000f1";
const approver = "00000000-0000-4000-8000-0000000000f2";
const resId = "00000000-0000-4000-8000-000000000002";
const abonoId = "00000000-0000-4000-8000-0000000000ab";
const service = (client: object) => new FinanceService({ client: vi.fn().mockResolvedValue(client) } as never);
const pdf = (body = "1 0 obj << /Type /Catalog >> endobj") =>
  Buffer.from(`%PDF-1.4\n${body}\ntrailer\n%%EOF\n`, "latin1");
let dir: string;
let png: Buffer;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rt-receipts-"));
  process.env.MEDIA_STORAGE_DIR = dir;
  png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ffffff" } })
    .png()
    .toBuffer();
});
afterAll(async () => {
  delete process.env.MEDIA_STORAGE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("receipt validation (by content)", () => {
  it("accepts a plain PDF byte-for-byte and re-encodes images to WebP", async () => {
    await expect(validateReceipt(pdf())).resolves.toMatchObject({ mimeType: "application/pdf" });
    const image = await validateReceipt(png);
    expect(image.mimeType).toBe("image/webp");
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects PDFs with active content, truncated PDFs, disguised text and empty files", async () => {
    await expect(
      validateReceipt(pdf("<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>")),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(validateReceipt(Buffer.from("%PDF-1.4\nno end", "latin1"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validateReceipt(Buffer.from("<html><script>alert(1)</script></html>"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validateReceipt(Buffer.alloc(0))).rejects.toBeInstanceOf(BadRequestException);
  });
});

function registerClient(
  overrides: { balance?: bigint; status?: string; duplicateReceipt?: boolean; createError?: unknown } = {},
) {
  const tx = {
    mediaAsset: { create: vi.fn().mockResolvedValue({ id: "m1" }) },
    manualAbono: {
      create: overrides.createError
        ? vi.fn().mockRejectedValue(overrides.createError)
        : vi.fn().mockResolvedValue({ id: abonoId, status: "SUBMITTED" }),
    },
    auditLog: { create: vi.fn() },
  };
  const client = {
    reservation: {
      findUnique: vi.fn().mockResolvedValue({
        id: resId,
        code: "RES-1",
        status: overrides.status ?? "PENDING_PAYMENT",
        totalCents: 100000n,
        customerId: "c1",
        currency: "COP",
      }),
    },
    ledgerEntry: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 100000n - (overrides.balance ?? 100000n) } }),
    },
    manualAbono: { findFirst: vi.fn().mockResolvedValue(overrides.duplicateReceipt ? { id: "x" } : null) },
    $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { client, tx };
}
const input = {
  reservationId: resId,
  amountCents: 30000n,
  method: "BANK_TRANSFER" as const,
  bankReference: "BANCO-123",
  paidAt: "2026-11-01",
};

describe("registerAbono", () => {
  it("stores a private receipt and a SUBMITTED abono (no money yet)", async () => {
    const { client, tx } = registerClient();
    await expect(service(client).registerAbono(registrar, input, pdf())).resolves.toEqual({
      id: abonoId,
      status: "SUBMITTED",
    });
    expect(tx.mediaAsset.create.mock.calls[0][0].data).toMatchObject({
      visibility: "PRIVATE",
      mimeType: "application/pdf",
    });
    expect(tx.manualAbono.create.mock.calls[0][0].data).toMatchObject({
      registeredById: registrar,
      amountCents: 30000n,
      customerId: "c1",
    });
  });

  it("refuses over-balance, non-payable targets, duplicate receipts, missing bank reference and future dates", async () => {
    await expect(
      service(registerClient({ balance: 1000n }).client).registerAbono(registrar, input, pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(registerClient({ status: "CANCELLED" }).client).registerAbono(registrar, input, pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(registerClient({ duplicateReceipt: true }).client).registerAbono(registrar, input, pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(registerClient().client).registerAbono(registrar, { ...input, bankReference: "" }, pdf()),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service(registerClient().client).registerAbono(registrar, { ...input, paidAt: "2999-01-01" }, pdf()),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service(registerClient().client).registerAbono(registrar, { ...input, savingsPlanId: resId }, pdf()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps the bank-reference unique index to 409 and removes the orphaned file", async () => {
    const before = (await readdir(join(dir, "receipts")).catch(() => [])).length;
    const { client } = registerClient({ createError: Object.assign(new Error("dup"), { code: "P2002" }) });
    await expect(service(client).registerAbono(registrar, input, pdf("unique body 1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await readdir(join(dir, "receipts"))).length).toBe(before);
  });
});

function approveClient(
  overrides: { registeredById?: string; status?: string; claimed?: number; balance?: bigint } = {},
) {
  const tx = {
    $queryRaw: vi.fn(),
    reservation: {
      findUnique: vi.fn().mockResolvedValue({
        id: resId,
        code: "RES-1",
        status: "PENDING_PAYMENT",
        totalCents: 100000n,
        customerId: "c1",
        currency: "COP",
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        status: "PENDING_PAYMENT",
        version: 2,
        totalCents: 100000n,
        requiredDepositCents: 30000n,
        availabilityValidatedAt: new Date(),
      }),
      update: vi.fn(),
    },
    ledgerEntry: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 100000n - (overrides.balance ?? 100000n) } }),
      create: vi.fn(),
    },
    manualAbono: { updateMany: vi.fn().mockResolvedValue({ count: overrides.claimed ?? 1 }), update: vi.fn() },
    payment: { create: vi.fn().mockResolvedValue({ id: "pay1" }) },
    auditLog: { create: vi.fn() },
    reservationStatusHistory: { create: vi.fn() },
  };
  const client = {
    manualAbono: {
      findUnique: vi.fn().mockResolvedValue({
        id: abonoId,
        status: overrides.status ?? "SUBMITTED",
        registeredById: overrides.registeredById ?? registrar,
        amountCents: 30000n,
        currency: "COP",
        method: "BANK_TRANSFER",
        customerId: "c1",
        reservationId: resId,
        savingsPlanId: null,
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: abonoId, status: "APPROVED" }),
    },
    $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { client, tx };
}

describe("approveAbono (four eyes)", () => {
  it("the registrar can never approve or reject their own abono", async () => {
    const { client } = approveClient();
    await expect(service(client).approveAbono(registrar, abonoId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service(client).rejectAbono(registrar, abonoId, "No coincide")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("approval writes MANUAL payment + one MANUAL_ABONO ledger entry and settles the reservation as FINANCE", async () => {
    const { client, tx } = approveClient();
    // Before the entry nothing is paid; settlement re-reads the ledger and sees the new 30.000.
    tx.ledgerEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 0n } })
      .mockResolvedValue({ _sum: { amountCents: 30000n } });
    await expect(service(client).approveAbono(approver, abonoId)).resolves.toEqual({ id: abonoId, status: "APPROVED" });
    expect(tx.manualAbono.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: abonoId, status: "SUBMITTED" },
      data: { approvedById: approver },
    });
    expect(tx.payment.create.mock.calls[0][0].data).toMatchObject({
      provider: "MANUAL",
      status: "APPROVED",
      idempotencyKey: `manual-abono:${abonoId}`,
    });
    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toMatchObject({
      kind: "MANUAL_ABONO",
      amountCents: 30000n,
      manualAbonoId: abonoId,
      createdById: approver,
    });
    expect(tx.reservationStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      event: "PAYMENT_SETTLED",
      role: "FINANCE",
      actorId: approver,
    });
    expect(tx.reservation.update.mock.calls[0][0].data.status).toBe("PARTIALLY_PAID");
  });

  it("a concurrent approval that loses the conditional claim gets 409 and writes nothing", async () => {
    const { client, tx } = approveClient({ claimed: 0 });
    await expect(service(client).approveAbono(approver, abonoId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it("re-checks the balance at approval time and refuses already processed abonos", async () => {
    await expect(
      service(approveClient({ balance: 1000n }).client).approveAbono(approver, abonoId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(approveClient({ status: "APPROVED" }).client).approveAbono(approver, abonoId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("adjustments and savings", () => {
  it("a negative adjustment cannot push the paid amount below zero", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      reservation: {
        findUnique: vi.fn().mockResolvedValue({
          id: resId,
          code: "R",
          status: "PARTIALLY_PAID",
          totalCents: 100n,
          customerId: "c1",
          currency: "COP",
        }),
      },
      ledgerEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 50n } }), create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = { $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)) };
    await expect(
      service(client).adjust(approver, { reservationId: resId }, -51n, "Corrección de abono duplicado"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it("validates schedules and allocates paid money in sequence order", () => {
    const today = new Date("2026-11-14T10:00:00Z");
    expect(
      validateSchedule(
        [
          { dueOn: "2026-12-01", amountCents: 50n },
          { dueOn: "2027-01-01", amountCents: 50n },
        ],
        100n,
        today,
      ),
    ).toBeNull();
    expect(validateSchedule([{ dueOn: "2026-12-01", amountCents: 50n }], 100n, today)).toMatch(/suma/);
    expect(validateSchedule([{ dueOn: "2026-11-01", amountCents: 100n }], 100n, today)).toMatch(/pasado/);
    expect(
      validateSchedule(
        [
          { dueOn: "2027-01-01", amountCents: 50n },
          { dueOn: "2026-12-01", amountCents: 50n },
        ],
        100n,
        today,
      ),
    ).toMatch(/crecientes/);
    const rows = [
      { sequence: 1, dueOn: new Date("2026-11-01"), amountCents: 50n },
      { sequence: 2, dueOn: new Date("2026-12-01"), amountCents: 50n },
      { sequence: 3, dueOn: new Date("2027-01-01"), amountCents: 50n },
    ];
    const result = allocateInstallments(rows, 70n, today);
    expect(result.installments.map((i) => [i.status, i.paidCents])).toEqual([
      ["PAID", "50"],
      ["PARTIAL", "20"],
      ["PENDING", "0"],
    ]);
    expect(result.nextDue).toEqual({ sequence: 2, dueOn: "2026-12-01", amountCents: "50" });
    expect(allocateInstallments(rows, 0n, today).installments[0].status).toBe("OVERDUE");
  });

  it("a customer's savings plan lookup is owner-scoped (foreign → 404)", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      service({ savingsPlan: { findFirst } }).planDetail({ id: resId, userId: registrar }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: resId, customer: { userId: registrar, deletedAt: null } });
  });
});
