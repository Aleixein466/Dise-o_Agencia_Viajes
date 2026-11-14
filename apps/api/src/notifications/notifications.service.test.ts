import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { MAX_ATTEMPTS, NotificationsService } from "./notifications.service";
import { renderNotification } from "./templates";

const env = parseEnv({
  CUSTOMER_CODE_SECRET: "test-secret-test-secret-test-secret-00",
  WEB_ORIGIN: "https://web.example.test",
});

afterEach(() => vi.restoreAllMocks());

type Row = { id: string; kind: string; recipientEmail: string; templateData: unknown; attempts: number };

function setup(rows: Row[] = []) {
  const outbox = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: rows.length }),
    update: vi.fn().mockResolvedValue({}),
  };
  const tx = { $queryRaw: vi.fn().mockResolvedValue(rows), notificationOutbox: outbox };
  const client = {
    notificationOutbox: outbox,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    savingsPlan: { findMany: vi.fn() },
    ledgerEntry: { groupBy: vi.fn() },
  };
  const mail = { send: vi.fn().mockResolvedValue(undefined), enabled: true };
  const service = new NotificationsService({ client: async () => client } as never, mail as never, env);
  return { service, client, tx, outbox, mail };
}

const row = (over: Partial<{ id: string; kind: string; attempts: number }> = {}): Row => ({
  id: over.id ?? "n1",
  kind: over.kind ?? "reservation.confirmed",
  recipientEmail: "cliente@example.test",
  templateData: { firstName: "Ana", reference: "RES-1" },
  attempts: over.attempts ?? 0,
});

describe("enqueue", () => {
  it.each(["code", "loginCode", "token", "password", "client_secret"])("rejects secret-like key %s", async (key) => {
    const { service, outbox } = setup();
    await expect(service.enqueue("quote.received", "a@example.test", { [key]: "x" }, "k1")).rejects.toThrow(/secret/);
    await expect(
      service.enqueue("quote.received", "a@example.test", { nested: { [key]: "x" } }, "k1"),
    ).rejects.toThrow();
    expect(outbox.createMany).not.toHaveBeenCalled();
  });

  it("writes a normalised row and uses the caller's transaction", async () => {
    const { service, client } = setup();
    const txOutbox = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    await expect(
      service.enqueue("quote.received", " Ana@Example.test ", { reference: "C-1" }, "quote.received:1", {
        notificationOutbox: txOutbox,
      } as never),
    ).resolves.toBe(true);
    expect(txOutbox.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ recipientEmail: "ana@example.test", dedupeKey: "quote.received:1" })],
      }),
    );
    expect(client.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("treats a duplicate as a no-op", async () => {
    const { service, outbox } = setup();
    outbox.createMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.enqueue("quote.received", "a@example.test", {}, "dup")).resolves.toBe(false);
    outbox.createMany.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(service.enqueue("quote.received", "a@example.test", {}, "dup")).resolves.toBe(false);
  });

  it("rethrows other database errors", async () => {
    const { service, outbox } = setup();
    outbox.createMany.mockRejectedValueOnce(new Error("down"));
    await expect(service.enqueue("quote.received", "a@example.test", {}, "k")).rejects.toThrow("down");
  });
});

describe("dispatch", () => {
  it("claims with a lease, sends and marks SENT", async () => {
    const { service, tx, outbox, mail } = setup([row()]);
    const result = await service.dispatch(10);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(outbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) }),
    );
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "cliente@example.test", kind: "reservation.confirmed" }),
    );
    expect(outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" }, data: expect.objectContaining({ status: "SENT" }) }),
    );
    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
  });

  it("retries with backoff and a truncated, body-free error", async () => {
    const { service, outbox, mail } = setup([row({ attempts: 1 })]);
    mail.send.mockRejectedValue(
      Object.assign(new Error("550 cliente@example.test rejected " + "x".repeat(500)), { code: "EENVELOPE" }),
    );
    const before = Date.now();
    const result = await service.dispatch(10);
    const data = outbox.update.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING");
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(before + 60_000);
    expect(data.lastError.length).toBeLessThanOrEqual(300);
    expect(data.lastError).not.toContain("cliente@example.test");
    expect(result.retried).toBe(1);
  });

  it(`marks FAILED after ${MAX_ATTEMPTS} attempts`, async () => {
    const { service, outbox, mail } = setup([row({ attempts: MAX_ATTEMPTS - 1 })]);
    mail.send.mockRejectedValue(new Error("boom"));
    const result = await service.dispatch(10);
    expect(outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(result.failed).toBe(1);
  });

  it("marks unknown kinds SKIPPED without sending", async () => {
    const { service, outbox, mail } = setup([row({ kind: "nope.unknown" })]);
    const result = await service.dispatch(10);
    expect(mail.send).not.toHaveBeenCalled();
    expect(outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
    );
    expect(result.skipped).toBe(1);
  });

  it("keeps going when one row's bookkeeping fails", async () => {
    const { service, outbox, mail } = setup([row(), row({ id: "n2" })]);
    outbox.update.mockRejectedValueOnce(new Error("db"));
    const result = await service.dispatch(10);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
  });

  it("leaves rows queued when the adapter is disabled", async () => {
    const { service, client, mail } = setup([row()]);
    mail.enabled = false;
    expect((await service.dispatch(10)).claimed).toBe(0);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("never passes codes or message bodies to a logger", async () => {
    const calls: unknown[] = [];
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const)
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void calls.push(args));
    const { service, mail } = setup([row()]);
    mail.send.mockRejectedValue(
      Object.assign(new Error("Tu codigo es 12345678 para cliente@example.test"), { code: "ESOCKET" }),
    );
    await service.dispatch(10);
    expect(calls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("12345678");
    expect(logged).not.toContain("cliente@example.test");
  });
});

describe("enqueueInstallmentReminders", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  const plan = {
    id: "plan-1",
    name: "Cartagena",
    currency: "COP",
    customer: { email: "ana@example.test", name: "Ana Maria Perez" },
    installments: [
      { sequence: 1, dueOn: new Date("2026-11-13"), amountCents: 100_000n },
      { sequence: 2, dueOn: new Date("2026-11-16"), amountCents: 100_000n },
      { sequence: 3, dueOn: new Date("2026-12-30"), amountCents: 100_000n },
    ],
  };

  it("skips covered installments, reminds the outstanding part and ignores far-away ones", async () => {
    const { service, client, outbox } = setup();
    client.savingsPlan.findMany.mockResolvedValue([plan]);
    client.ledgerEntry.groupBy.mockResolvedValue([{ savingsPlanId: "plan-1", _sum: { amountCents: 150_000n } }]);
    const created = await service.enqueueInstallmentReminders(now);
    expect(created).toBe(1);
    const call = outbox.createMany.mock.calls[0][0].data[0];
    expect(call.dedupeKey).toBe("savings.reminder:plan-1:2");
    expect(call.templateData).toMatchObject({ amountCents: "50000", sequence: 2, firstName: "Ana" });
    expect(JSON.stringify(call.templateData)).not.toContain("ana@example.test");
  });

  it("sends nothing when the ledger covers the installments in the window", async () => {
    const { service, client, outbox } = setup();
    client.savingsPlan.findMany.mockResolvedValue([plan]);
    client.ledgerEntry.groupBy.mockResolvedValue([{ savingsPlanId: "plan-1", _sum: { amountCents: 200_000n } }]);
    expect(await service.enqueueInstallmentReminders(now)).toBe(0);
    expect(outbox.createMany).not.toHaveBeenCalled();
  });

  it("is deduplicated on a second run", async () => {
    const { service, client, outbox } = setup();
    client.savingsPlan.findMany.mockResolvedValue([plan]);
    client.ledgerEntry.groupBy.mockResolvedValue([]);
    expect(await service.enqueueInstallmentReminders(now)).toBe(2);
    outbox.createMany.mockResolvedValue({ count: 0 });
    expect(await service.enqueueInstallmentReminders(now)).toBe(0);
    const keys = outbox.createMany.mock.calls.map((c) => c[0].data[0].dedupeKey);
    expect(keys.slice(0, 2)).toEqual(["savings.reminder:plan-1:1", "savings.reminder:plan-1:2"]);
  });
});

describe("templates", () => {
  it("escapes HTML and links to WEB_ORIGIN", () => {
    const out = renderNotification(
      "pqrs.received",
      { firstName: "<b>Ana</b>", reference: 'PQ-1&"' },
      "https://web.example.test/",
    );
    expect(out?.html).not.toContain("<b>");
    expect(out?.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(out?.text).toContain("https://web.example.test/pqrs");
  });

  it("returns null for unknown kinds and renders every known kind", () => {
    expect(renderNotification("nope", {}, "https://x.test")).toBeNull();
    const kinds = [
      "quote.received",
      "quote.proposal_ready",
      "quote.status_changed",
      "reservation.requested",
      "reservation.status_changed",
      "reservation.confirmed",
      "payment.approved",
      "savings.installment_reminder",
      "pqrs.received",
    ];
    for (const kind of kinds)
      expect(renderNotification(kind, { reference: "R-1" }, "https://x.test")?.subject).toBeTruthy();
  });
});
