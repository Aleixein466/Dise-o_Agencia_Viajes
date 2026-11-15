import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TransportOptionsService } from "./transport-options.service";

type Row = Record<string, unknown> & { id: string };
const D1 = "00000000-0000-4000-8000-0000000000d1";
const D2 = "00000000-0000-4000-8000-0000000000d2";
const ACTOR = "00000000-0000-4000-8000-0000000000ff";
let clock = Date.parse("2026-11-01T00:00:00.000Z");
const tick = () => new Date(++clock);

function fake(seed: { components?: Row[]; options?: Row[] } = {}) {
  const options = (seed.options ?? []).map((r) => ({ ...r }));
  const audits: Row[] = [];
  const destinations = [
    { id: D1, name: "Uno", deletedAt: null },
    { id: D2, name: "Dos", deletedAt: null },
  ];
  const eq = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("not" in value) return row[key] !== value.not;
        if ("equals" in value) return String(row[key]).toLowerCase() === String(value.equals).toLowerCase();
        return true;
      }
      if (value instanceof Date) return (row[key] as Date).getTime() === value.getTime();
      return eq(row[key], value);
    });
  const withDestination = (row: Row) => ({ ...row, destination: destinations.find((d) => d.id === row.destinationId) });
  const tx = {
    destination: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        destinations.find((d) => matches(d as Row, where)) ?? null,
    },
    packageComponent: {
      count: async ({ where }: { where: { transportOptionId: string } }) =>
        (seed.components ?? []).filter((c) => c.transportOptionId === where.transportOptionId && c.published).length,
    },
    transportOption: {
      count: async ({ where }: { where: Record<string, unknown> }) => options.filter((r) => matches(r, where)).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        options.filter((r) => matches(r, where)).map(withDestination),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = options.find((r) => matches(r, where));
        return row ? withDestination(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        withDestination(options.find((r) => r.id === where.id)!),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = tick();
        const row = { id: randomUUID(), deletedAt: null, createdAt: now, updatedAt: now, ...data } as Row;
        options.push(row);
        return withDestination(row);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = options.filter((r) => matches(r, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: tick() });
        return { count: rows.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => audits.push({ id: randomUUID(), ...data }),
      findMany: async ({ where }: { where: Record<string, unknown> }) => audits.filter((a) => matches(a, where)),
    },
  };
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[]),
  };
  return { options, audits, service: new TransportOptionsService({ client: async () => client } as never) };
}
const input = (over: Record<string, unknown> = {}) => ({
  destinationId: D1,
  mode: "GROUND" as const,
  name: "Bus Cartagena",
  ...over,
});

describe("TransportOptionsService", () => {
  it("creates an active option and audits it in the same transaction", async () => {
    const { service, audits } = fake();
    const created = await service.create(input({ description: "Bus directo" }), ACTOR);
    expect(created).toMatchObject({ status: "active", name: "Bus Cartagena", conditions: null });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "transport_options.created",
      entity: "transport_option",
      actorId: ACTOR,
    });
  });
  it("rejects an unknown destination and a duplicate (destination, mode, name), ignoring case", async () => {
    const { service } = fake();
    await expect(service.create(input({ destinationId: randomUUID() }), ACTOR)).rejects.toMatchObject({
      response: { code: "DESTINATION_NOT_FOUND" },
    });
    await service.create(input(), ACTOR);
    await expect(service.create(input({ name: "bus cartagena" }), ACTOR)).rejects.toMatchObject({
      response: { code: "TRANSPORT_NAME_TAKEN" },
    });
    await expect(service.create(input({ mode: "AIR" }), ACTOR)).resolves.toMatchObject({ mode: "AIR" });
    await expect(service.create(input({ destinationId: D2 }), ACTOR)).resolves.toBeDefined();
  });
  it("updates with audit before/after, detects stale stamps and name clashes", async () => {
    const { service, audits } = fake();
    const a = await service.create(input(), ACTOR);
    const b = await service.create(input({ name: "Otro bus" }), ACTOR);
    await expect(service.update(a.id, { name: "x" }, new Date(0), ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    await expect(service.update(b.id, { name: "Bus Cartagena" }, b.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "TRANSPORT_NAME_TAKEN" },
    });
    const updated = await service.update(a.id, { description: "Nueva", conditions: null }, a.updatedAt, ACTOR);
    expect(updated.description).toBe("Nueva");
    const last = audits.at(-1)!;
    expect(last).toMatchObject({ action: "transport_options.updated" });
    expect((last.before as { description: unknown }).description).toBeNull();
    expect((last.after as { description: unknown }).description).toBe("Nueva");
    await expect(service.update(a.id, { description: "again" }, a.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
  });
  it("deactivates and reactivates without deleting, refusing no-ops", async () => {
    const { service, options } = fake();
    const a = await service.create(input(), ACTOR);
    const off = await service.deactivate(a.id, a.updatedAt, ACTOR);
    expect(off.status).toBe("inactive");
    expect(options).toHaveLength(1);
    await expect(service.deactivate(a.id, off.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "ALREADY_INACTIVE" },
    });
    const on = await service.activate(a.id, off.updatedAt, ACTOR);
    expect(on.status).toBe("active");
    await expect(service.activate(a.id, on.updatedAt, ACTOR)).rejects.toMatchObject({
      response: { code: "ALREADY_ACTIVE" },
    });
  });
  it("refuses to deactivate while a published package uses it", async () => {
    const id = randomUUID();
    const now = new Date("2026-11-01T00:00:00.000Z");
    const { service } = fake({
      options: [{ id, destinationId: D1, mode: "GROUND", name: "Bus", active: true, deletedAt: null, updatedAt: now }],
      components: [
        { id: randomUUID(), transportOptionId: id, published: true },
        { id: randomUUID(), transportOptionId: id, published: false },
      ],
    });
    await expect(service.deactivate(id, now, ACTOR)).rejects.toMatchObject({
      response: { code: "TRANSPORT_IN_USE", count: 1 },
    });
  });
  it("hides the history of a deleted option and redacts sensitive keys in it", async () => {
    const { service, options, audits } = fake();
    const created = await service.create(input(), "actor");
    audits.push({
      id: "x",
      entity: "transport_option",
      entityId: created.id,
      before: null,
      after: { contactEmail: "a@b.co" },
    });
    const rows = (await service.history(created.id)) as { after: unknown }[];
    expect(JSON.stringify(rows)).not.toContain("a@b.co");
    options[0]!.deletedAt = new Date();
    await expect(service.history(created.id)).rejects.toMatchObject({ status: 404 });
  });
  it("lists filtered and paginated, hiding soft-deleted rows", async () => {
    const { service, options } = fake();
    await service.create(input({ name: "A bus" }), ACTOR);
    await service.create(input({ name: "B vuelo", mode: "AIR" }), ACTOR);
    const hidden = await service.create(input({ name: "C oculto" }), ACTOR);
    options.find((r) => r.id === hidden.id)!.deletedAt = new Date();
    const all = await service.list({}, 1, 10);
    expect(all.total).toBe(2);
    expect((await service.list({ mode: "AIR" }, 1, 10)).items.map((i) => i.name)).toEqual(["B vuelo"]);
    expect((await service.list({ status: "inactive" }, 1, 10)).total).toBe(0);
    await expect(service.get(hidden.id)).rejects.toMatchObject({ status: 404 });
  });
});
