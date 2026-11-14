import { createHash } from "node:crypto";
import { ROLE_PERMISSIONS } from "@ricaurte/domain";
import { describe, expect, it, vi } from "vitest";
import { addBusinessDays, PQRS_TRANSITIONS, PqrsService } from "./pqrs.service";

const env = { PQRS_INTAKE_ENABLED: "true", PQRS_RESPONSE_BUSINESS_DAYS: 15, WEB_ORIGIN: "http://127.0.0.1:3201" };
const KEY = "00000000-0000-4000-8000-000000000002";
const TICKET = "00000000-0000-4000-8000-0000000000aa";
const input = {
  type: "COMPLAINT" as const,
  subject: "Demora en respuesta",
  description: "Descripción ficticia de prueba con más de veinte caracteres.",
  name: "Ana Prueba",
  email: "Ana@Example.test",
  dataConsent: true as const,
  idempotencyKey: KEY,
  website: "",
};
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

function harness(overrides: Record<string, unknown> = {}, envOverrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    legalDocument: { findFirst: vi.fn(async () => ({ id: "legal", version: "1.0" })) },
    pqrsTicket: {
      findUnique: vi.fn(async () => null as unknown),
      findFirst: vi.fn(async () => null as unknown),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: TICKET,
        reference: data.reference,
        status: "RECEIVED",
        requesterEmail: data.requesterEmail,
        requesterName: data.requesterName,
      })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    pqrsMessage: { create: vi.fn(async () => ({ id: "msg-1" })), count: vi.fn(async () => 1) },
    consentRecord: { create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
    customer: {
      findUnique: vi.fn(async () => ({
        id: "cust-1",
        name: "Ana",
        email: "ana@example.test",
        phone: null,
        deletedAt: null,
      })),
    },
    user: { findMany: vi.fn(async () => [{ id: "advisor-1", name: "Asesora" }]) },
    ...overrides,
  };
  const client = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const db = { client: vi.fn(async () => client) };
  const notifications = { enqueue: vi.fn(async () => undefined) };
  const service = new PqrsService(db as never, { ...env, ...envOverrides } as never, notifications as never);
  return { tx, client, db, notifications, service };
}

describe("PQRS permissions", () => {
  it("lets ADMIN and ADVISOR answer, customers own-only, FINANCE nothing", () => {
    for (const role of ["ADMIN", "ADVISOR"] as const)
      expect(ROLE_PERMISSIONS[role]).toEqual(expect.arrayContaining(["pqrs:read", "pqrs:respond"]));
    expect(ROLE_PERMISSIONS.CUSTOMER).toEqual(expect.arrayContaining(["pqrs:create_own", "pqrs:read_own"]));
    expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain("pqrs:read");
    expect(ROLE_PERMISSIONS.FINANCE.filter((key) => key.startsWith("pqrs:"))).toEqual([]);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Friday 2026-11-13 + 1 business day = Monday 2026-11-16
    expect(addBusinessDays(new Date("2026-11-13T15:00:00Z"), 1).toISOString()).toBe("2026-11-16T15:00:00.000Z");
    expect(addBusinessDays(new Date("2026-11-16T15:00:00Z"), 15).toISOString()).toBe("2026-12-07T15:00:00.000Z");
  });
});

describe("PqrsService public intake", () => {
  it("returns 503 while intake is disabled", async () => {
    const { service } = harness({}, { PQRS_INTAKE_ENABLED: "false" });
    await expect(service.createPublic(input, "1.1.1.1")).rejects.toMatchObject({ status: 503 });
  });

  it("returns 503 without an approved data-treatment document", async () => {
    const { service, tx } = harness({ legalDocument: { findFirst: vi.fn(async () => null) } });
    await expect(service.createPublic(input, "1.1.1.1")).rejects.toMatchObject({ status: 503 });
    expect(tx.pqrsTicket.create).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin", async () => {
    const { service } = harness();
    await expect(service.createPublic(input, "1.1.1.1", "https://evil.example")).rejects.toMatchObject({ status: 403 });
  });

  it("stores nothing for a honeypot submission", async () => {
    const { service, db } = harness();
    await expect(service.createPublic({ ...input, website: "bot" }, "1.1.1.1")).resolves.toMatchObject({
      reference: "",
      trackingCode: null,
    });
    expect(db.client).not.toHaveBeenCalled();
  });

  it("creates the ticket, consent, audit and notification; stores only the code hash", async () => {
    const { service, tx, notifications } = harness();
    const result = await service.createPublic(input, "1.1.1.1", env.WEB_ORIGIN);
    expect(result.reference).toMatch(/^PQR-[0-9A-F]{12}$/);
    expect(result.trackingCode).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    const data = (tx.pqrsTicket.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.trackingCodeHash).toBe(sha(result.trackingCode!));
    expect(JSON.stringify(data)).not.toContain(result.trackingCode!);
    expect(data.requesterEmail).toBe("ana@example.test");
    expect(tx.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pqrsTicketId: TICKET, source: "public_pqrs", ipHash: sha("1.1.1.1") }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    // The mail never carries the tracking code.
    expect(JSON.stringify(notifications.enqueue.mock.calls)).not.toContain(result.trackingCode!);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "pqrs.received",
      "ana@example.test",
      expect.anything(),
      `pqrs.received:${TICKET}`,
      tx,
    );
  });

  it("replays an idempotency key without a new tracking code", async () => {
    const replay = { reference: "PQR-OLD", status: "IN_REVIEW", resolutionDueAt: null };
    const { service, tx } = harness({ pqrsTicket: { findUnique: vi.fn(async () => replay), create: vi.fn() } });
    await expect(service.createPublic(input, "1.1.1.1")).resolves.toEqual({
      reference: "PQR-OLD",
      trackingCode: null,
      status: "IN_REVIEW",
      responseDueAt: null,
    });
    expect(tx.pqrsTicket.create).not.toHaveBeenCalled();
  });
});

describe("PqrsService tracking", () => {
  const ticket = {
    id: TICKET,
    reference: "PQR-ABC",
    type: "PETITION",
    status: "ANSWERED",
    subject: "Asunto",
    createdAt: new Date("2026-11-14T00:00:00Z"),
    resolutionDueAt: null,
    trackingCodeHash: sha("AAAA-BBBB"),
    messages: [
      { id: "m", message: "Respuesta", isStaff: true, isInternal: false, createdAt: new Date(), author: { name: "X" } },
    ],
  };

  it("returns the public view for the right code and filters internal notes in the query", async () => {
    const findUnique = vi.fn(async () => ticket);
    const { service } = harness({ pqrsTicket: { findUnique } });
    const view = await service.track("pqr-abc", "aaaa-bbbb");
    expect(view).toMatchObject({ reference: "PQR-ABC", messages: [{ author: "AGENCY", message: "Respuesta" }] });
    expect(view.messages[0]).not.toHaveProperty("authorName");
    expect((findUnique.mock.calls[0] as unknown[])[0]).toMatchObject({
      where: { reference: "PQR-ABC" },
      select: { messages: { where: { isInternal: false } } },
    });
  });

  it("answers the same 404 for a wrong code and an unknown reference", async () => {
    const wrong = harness({ pqrsTicket: { findUnique: vi.fn(async () => ticket) } });
    const unknown = harness({ pqrsTicket: { findUnique: vi.fn(async () => null) } });
    const a = await wrong.service.track("PQR-ABC", "WRONG").catch((e: unknown) => e);
    const b = await unknown.service.track("PQR-NOPE", "WRONG").catch((e: unknown) => e);
    expect(a).toMatchObject({ status: 404 });
    expect(b).toMatchObject({ status: 404 });
    expect((a as Error).message).toBe((b as Error).message);
  });
});

describe("PqrsService customer portal", () => {
  it("answers 404 for another customer's ticket (scoped query)", async () => {
    const findFirst = vi.fn(async () => null);
    const { service } = harness({ pqrsTicket: { findFirst } });
    await expect(service.customerDetail("user-1", TICKET)).rejects.toMatchObject({ status: 404 });
    expect((findFirst.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { id: TICKET, customerId: "cust-1" } });
  });

  it("refuses a reply on a CLOSED ticket", async () => {
    const { service, tx } = harness({
      pqrsTicket: { findFirst: vi.fn(async () => ({ id: TICKET, status: "CLOSED" })) },
    });
    await expect(service.customerReply("user-1", TICKET, "Hola")).rejects.toMatchObject({ status: 409 });
    expect(tx.pqrsMessage.create).not.toHaveBeenCalled();
  });

  it("moves WAITING_FOR_CUSTOMER back to IN_REVIEW on a reply", async () => {
    const update = vi.fn(async () => ({}));
    const { service } = harness({
      pqrsTicket: { findFirst: vi.fn(async () => ({ id: TICKET, status: "WAITING_FOR_CUSTOMER" })), update },
    });
    await service.customerReply("user-1", TICKET, "Adjunto la información");
    expect(update).toHaveBeenCalledWith({
      where: { id: TICKET },
      data: { status: "IN_REVIEW", version: { increment: 1 } },
    });
  });

  it("maps a key collision with another customer to 409 without leaking it", async () => {
    const { service } = harness({
      pqrsTicket: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }),
      },
    });
    await expect(
      service.customerCreate("user-1", {
        type: "PETITION",
        subject: "Asunto largo",
        description: "x".repeat(20),
        idempotencyKey: KEY,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("PqrsService staff", () => {
  it("only allows the documented transitions", () => {
    expect(PQRS_TRANSITIONS.CLOSED).toEqual([]);
    expect(PQRS_TRANSITIONS.RECEIVED).toEqual(["IN_REVIEW"]);
  });

  const base = { id: TICKET, reference: "PQR-ABC", requesterEmail: "ana@example.test", requesterName: "Ana Prueba" };

  it("rejects a stale version with 409", async () => {
    const { service } = harness({
      pqrsTicket: { findUnique: vi.fn(async () => ({ ...base, status: "RECEIVED", version: 3 })) },
    });
    await expect(service.changeStatus("staff", TICKET, "IN_REVIEW", 2)).rejects.toMatchObject({
      status: 409,
      message: "La PQRS cambió; recarga",
    });
  });

  it("rejects a transition outside the graph", async () => {
    const { service } = harness({
      pqrsTicket: { findUnique: vi.fn(async () => ({ ...base, status: "RECEIVED", version: 0 })) },
    });
    await expect(service.changeStatus("staff", TICKET, "CLOSED", 0)).rejects.toMatchObject({ status: 409 });
  });

  it("requires a public staff answer before ANSWERED", async () => {
    const { service } = harness({
      pqrsTicket: {
        findUnique: vi.fn(async () => ({ ...base, status: "IN_REVIEW", version: 1 })),
        updateMany: vi.fn(),
      },
      pqrsMessage: { count: vi.fn(async () => 0) },
    });
    await expect(service.changeStatus("staff", TICKET, "ANSWERED", 1)).rejects.toMatchObject({ status: 409 });
  });

  it("loses a concurrent change (conditional update count 0)", async () => {
    const { service } = harness({
      pqrsTicket: {
        findUnique: vi.fn(async () => ({ ...base, status: "RECEIVED", version: 0 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    });
    await expect(service.changeStatus("staff", TICKET, "IN_REVIEW", 0)).rejects.toMatchObject({ status: 409 });
  });

  it("changes status, audits and notifies the requester", async () => {
    const { service, tx, notifications } = harness({
      pqrsTicket: {
        findUnique: vi.fn(async () => ({ ...base, status: "ANSWERED", version: 4 })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    });
    await expect(service.changeStatus("staff", TICKET, "CLOSED", 4)).resolves.toEqual({ status: "CLOSED", version: 5 });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "pqrs.status_changed",
        before: { status: "ANSWERED" },
        after: { status: "CLOSED" },
      }),
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "pqrs.status_changed",
      "ana@example.test",
      expect.objectContaining({ status: "CLOSED", firstName: "Ana" }),
      `pqrs.status:${TICKET}:5`,
      tx,
    );
  });

  it("does not notify on an internal note and notifies (without content) on a public answer", async () => {
    const found = vi.fn(async () => ({ ...base, status: "IN_REVIEW", firstRespondedAt: null }));
    const internal = harness({ pqrsTicket: { findUnique: found, update: vi.fn() } });
    await internal.service.staffMessage("staff", TICKET, "Nota secreta", true);
    expect(internal.notifications.enqueue).not.toHaveBeenCalled();
    expect(internal.tx.pqrsTicket.update).not.toHaveBeenCalled();

    const pub = harness({ pqrsTicket: { findUnique: found, update: vi.fn() } });
    await pub.service.staffMessage("staff", TICKET, "Respuesta confidencial", false);
    expect(pub.tx.pqrsTicket.update).toHaveBeenCalledWith({
      where: { id: TICKET },
      data: { firstRespondedAt: expect.any(Date) },
    });
    expect(JSON.stringify(pub.notifications.enqueue.mock.calls)).not.toContain("Respuesta confidencial");
  });

  it("refuses an assignee without pqrs:respond", async () => {
    const { service, tx } = harness({
      pqrsTicket: { findUnique: vi.fn(async () => ({ status: "IN_REVIEW", assignedToId: null })), update: vi.fn() },
    });
    await expect(service.assign("staff", TICKET, "00000000-0000-4000-8000-0000000000ff")).rejects.toMatchObject({
      status: 400,
    });
    expect(tx.pqrsTicket.update).not.toHaveBeenCalled();
    await expect(service.assign("staff", TICKET, "advisor-1")).resolves.toEqual({ assignedToId: "advisor-1" });
  });
});
