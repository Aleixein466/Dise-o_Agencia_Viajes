import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CustomersService, maskDocument } from "./customers.service";

type Row = Record<string, unknown> & { id: string };
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const ACTOR = "00000000-0000-4000-8000-0000000000ff";
const STAMP = new Date("2026-11-01T00:00:00.000Z");

function customer(id: string, over: Record<string, unknown> = {}): Row {
  return {
    id,
    name: `Cliente ${id.slice(-2)}`,
    email: `${id.slice(-2)}@cliente.test`,
    phone: "3001234567",
    country: "CO",
    documentType: "CC",
    documentNumber: "1012345678",
    userId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  };
}

function fake(seed: { customers?: Row[]; users?: Row[] } = {}) {
  const customers = (seed.customers ?? [customer(A), customer(B)]).map((r) => ({ ...r }));
  const users = seed.users ?? [];
  const audits: Row[] = [];
  const notes: Row[] = [];
  const locks: string[] = [];
  const text = (value: unknown) => String(value ?? "").toLowerCase();
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "OR") return (value as Record<string, unknown>[]).some((part) => matches(row, part));
      if (value instanceof Date) return (row[key] as Date).getTime() === value.getTime();
      if (value && typeof value === "object") {
        if ("not" in value) return row[key] !== value.not;
        if ("equals" in value) return text(row[key]) === text(value.equals);
        if ("contains" in value) return text(row[key]).includes(text(value.contains));
        return true;
      }
      return (row[key] ?? null) === (value ?? null);
    });
  const relations = (row: Row) => ({
    ...row,
    _count: { quotes: 2, reservations: 1, payments: 0, pqrsTickets: 0 },
    quotes: [
      { id: "q", reference: "COT-1", status: "NEW", totalCents: BigInt(150000), currency: "COP", createdAt: STAMP },
    ],
    reservations: [],
    payments: [],
    pqrsTickets: [],
  });
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("?").includes("pg_advisory_xact_lock")) locks.push(String(values[0]));
      return [];
    },
    customer: {
      count: async ({ where }: { where: Record<string, unknown> }) => customers.filter((r) => matches(r, where)).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        customers.filter((r) => matches(r, where)).map(relations),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = customers.find((r) => matches(r, where));
        return row ? relations(row) : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = customers.filter((r) => matches(r, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date(Date.now()) });
        return { count: rows.length };
      },
    },
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => users.find((u) => matches(u, where)) ?? null,
    },
    crmNote: {
      count: async ({ where }: { where: Record<string, unknown> }) => notes.filter((n) => matches(n, where)).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) => notes.filter((n) => matches(n, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          quoteId: null,
          reservationId: null,
          pqrsTicketId: null,
          createdAt: new Date(),
          author: { id: ACTOR, name: "Asesora" },
          ...data,
        };
        notes.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => audits.push({ id: randomUUID(), ...data }),
    },
  };
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[]),
  };
  return { customers, audits, notes, locks, service: new CustomersService({ client: async () => client } as never) };
}

describe("maskDocument", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskDocument("1012345678")).toBe("••••5678");
    expect(maskDocument(" 10 12 34 ")).toBe("••••1234");
    expect(maskDocument("123")).toBe("••••");
    expect(maskDocument(null)).toBeNull();
  });
});

describe("CustomersService", () => {
  it("lists with search, masks the document and never returns its full number", async () => {
    const { service } = fake();
    const result = await service.list("A1@CLIENTE", 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: A, documentNumberMasked: "••••5678", quotesCount: 2 });
    expect(JSON.stringify(result)).not.toContain("1012345678");
    expect(result.items[0]).not.toHaveProperty("userId");
  });
  it("excludes deleted customers from list and profile", async () => {
    const { service } = fake({ customers: [customer(A, { deletedAt: new Date() }), customer(B)] });
    expect((await service.list(undefined, 1, 20)).items.map((item) => item.id)).toEqual([B]);
    await expect(service.get(A)).rejects.toMatchObject({ status: 404 });
  });
  it("profile carries history summaries as strings and no full document", async () => {
    const { service } = fake();
    const profile = await service.get(A);
    expect(profile.counts).toEqual({ quotes: 2, reservations: 1, payments: 0, pqrs: 0, notes: 0 });
    expect(profile.quotes[0].totalCents).toBe("150000");
    expect(JSON.stringify(profile)).not.toContain("1012345678");
  });
  it("edits contact data, audits only field names for contact data", async () => {
    const { service, audits, customers } = fake();
    await service.update(A, { name: "Nuevo Nombre", phone: "3110000000", country: "PE" }, STAMP, ACTOR);
    expect(customers[0]).toMatchObject({ name: "Nuevo Nombre", phone: "3110000000", country: "PE" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "customers.updated",
      details: { changed: ["name", "phone", "country"] },
    });
    expect(audits[0]).not.toHaveProperty("before");
    expect(audits[0]).not.toHaveProperty("after");
    expect(JSON.stringify(audits)).not.toMatch(/3110000000|3001234567|1012345678|Nuevo Nombre|Cliente a1/);
  });
  it("rejects a stale stamp with STALE_UPDATE", async () => {
    const { service, audits } = fake();
    await expect(
      service.update(A, { name: "Otro" }, new Date("2026-10-01T00:00:00.000Z"), ACTOR),
    ).rejects.toMatchObject({ response: { code: "STALE_UPDATE" } });
    expect(audits).toHaveLength(0);
  });
  it("rejects an email already used by another customer or account, case-insensitively, under a lock", async () => {
    const { service, customers, locks } = fake();
    await expect(service.update(A, { email: "B2@Cliente.test" }, STAMP, ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "DUPLICATE_CUSTOMER" },
    });
    expect(customers[0].email).toBe("a1@cliente.test");
    expect(locks).toEqual(["customers:email:b2@cliente.test"]);
    const withUser = fake({ users: [{ id: "u", email: "staff@agencia.test" }] });
    await expect(withUser.service.update(A, { email: "staff@agencia.test" }, STAMP, ACTOR)).rejects.toMatchObject({
      response: { code: "DUPLICATE_CUSTOMER" },
    });
  });
  it("changes a free email (lowercased) and refuses it for customers with a portal account", async () => {
    const { service, customers } = fake();
    await service.update(A, { email: "Nuevo@Cliente.test" }, STAMP, ACTOR);
    expect(customers[0].email).toBe("nuevo@cliente.test");
    const linked = fake({ customers: [customer(A, { userId: "user-1" })] });
    await expect(linked.service.update(A, { email: "otro@cliente.test" }, STAMP, ACTOR)).rejects.toMatchObject({
      response: { code: "CUSTOMER_HAS_ACCOUNT" },
    });
    await linked.service.update(A, { email: "a1@cliente.test", name: "Mismo correo" }, STAMP, ACTOR);
    expect(linked.customers[0].name).toBe("Mismo correo");
  });
  it("no-op edits write nothing", async () => {
    const { service, audits } = fake();
    await service.update(A, { name: "Cliente a1" }, STAMP, ACTOR);
    expect(audits).toHaveLength(0);
  });
  it("adds internal notes scoped to the customer and audits without the text", async () => {
    const { service, audits, notes } = fake();
    const note = await service.addNote(A, "Prefiere llamadas en la tarde", ACTOR);
    expect(note).toMatchObject({ body: "Prefiere llamadas en la tarde", author: { id: ACTOR } });
    expect(notes[0]).toMatchObject({ customerId: A, authorId: ACTOR });
    expect(audits[0]).toMatchObject({ action: "customers.note_added", details: { noteId: note.id } });
    expect(JSON.stringify(audits)).not.toContain("Prefiere");
    const profile = await service.get(A);
    expect(profile.counts.notes).toBe(1);
    expect(profile.notes[0].body).toBe("Prefiere llamadas en la tarde");
    expect((await service.get(B)).notes).toEqual([]);
    await expect(service.addNote("00000000-0000-4000-8000-000000000999", "x", ACTOR)).rejects.toMatchObject({
      status: 404,
    });
  });
});
