import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DeparturesService } from "./departures.service";

type Row = Record<string, unknown> & { id: string };
const PKG = "00000000-0000-4000-8000-0000000000a1";
const GONE = "00000000-0000-4000-8000-0000000000a2";
const DEP = "00000000-0000-4000-8000-0000000000d1";
const ACTOR = "00000000-0000-4000-8000-0000000000ff";
let clock = Date.parse("2026-11-01T00:00:00.000Z");
const tick = () => new Date(++clock);
const day = (value: string) => new Date(`${value}T05:00:00Z`);

function departure(over: Record<string, unknown> = {}): Row {
  return {
    id: DEP,
    packageId: PKG,
    startsAt: day("2027-01-10"),
    endsAt: day("2027-01-14"),
    capacity: 10,
    heldSeats: 2,
    soldSeats: 3,
    availabilityStatus: "AVAILABLE",
    published: false,
    priceCents: BigInt(990000),
    updatedAt: tick(),
    ...over,
  };
}

/**
 * In-memory stand-in. The conditional seat UPDATEs are emulated from their SQL text, so a test fails if the guard
 * (held + sold + n <= capacity / held - n >= 0) is ever dropped from the statement.
 */
function fake(rows: Row[] = [departure()]) {
  const departures = rows.map((r) => ({ ...r }));
  const packages = [
    { id: PKG, title: "Cartagena", deletedAt: null },
    { id: GONE, title: "Borrado", deletedAt: new Date() },
  ];
  const changes: Row[] = [];
  const audits: Row[] = [];
  const sql: string[] = [];
  const pkg = (row: Row) => packages.find((p) => p.id === row.packageId)!;
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "package") return pkg(row).deletedAt === null;
      if (value instanceof Date) return (row[key] as Date).getTime() === value.getTime();
      if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
      return (row[key] ?? null) === (value ?? null);
    });
  const view = (row: Row) => {
    const rest = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "priceCents"));
    return { ...rest, package: { id: PKG, title: pkg(row).title } };
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      sql.push(text);
      if (text.includes("pg_advisory_xact_lock")) return [];
      if (text.includes("FOR UPDATE")) return departures.filter((d) => d.id === values[0]).map((d) => ({ id: d.id }));
      if (text.startsWith('UPDATE "departures"')) {
        const [delta, now, id] = values as [number, Date, string];
        const row = departures.find((d) => d.id === id && pkg(d).deletedAt === null);
        if (!row) return [];
        const held = row.heldSeats as number;
        const sold = row.soldSeats as number;
        const fits = text.includes('"held_seats" + "confirmed_seats" + $::int <= "capacity"')
          ? held + sold + delta <= (row.capacity as number)
          : text.includes('"held_seats" + $::int >= 0')
            ? held + delta >= 0
            : true;
        if (!fits) return [];
        Object.assign(row, { heldSeats: held + delta, updatedAt: now });
        return [{ id }];
      }
      throw new Error(`unexpected SQL ${text}`);
    },
    tourPackage: {
      findFirst: async ({ where }: { where: { id: string; deletedAt: null } }) =>
        packages.find((p) => p.id === where.id && p.deletedAt === null) ?? null,
    },
    departure: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        departures.filter((r) => matches(r, where)).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        departures.filter((r) => matches(r, where)).map(view),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = departures.find((r) => matches(r, where));
        return row ? view(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        view(departures.find((r) => r.id === where.id)!),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          heldSeats: 0,
          soldSeats: 0,
          published: false,
          updatedAt: tick(),
          ...data,
        } as Row;
        departures.push(row);
        return view(row);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = departures.filter((r) => matches(r, where));
        for (const row of hits) Object.assign(row, data, { updatedAt: tick() });
        return { count: hits.length };
      },
    },
    departureSeatChange: {
      create: async ({ data }: { data: Record<string, unknown> }) =>
        changes.push({ id: randomUUID(), createdAt: tick(), ...data }),
      findMany: async ({ where }: { where: { departureId: string } }) =>
        changes.filter((c) => c.departureId === where.departureId).reverse(),
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
  return { departures, changes, audits, sql, service: new DeparturesService({ client: async () => client } as never) };
}
const input = (over: Record<string, unknown> = {}) => ({
  packageId: PKG,
  startsAt: day("2027-03-01"),
  endsAt: day("2027-03-05"),
  capacity: 12,
  availabilityStatus: "TO_CONFIRM" as const,
  ...over,
});

describe("DeparturesService", () => {
  it("lists a package's departures with available seats and no price", async () => {
    const { service } = fake();
    const result = await service.list(PKG, 1, 20);
    expect(result.items[0]).toMatchObject({ capacity: 10, heldSeats: 2, soldSeats: 3, availableSeats: 5 });
    expect(result.items[0]).not.toHaveProperty("priceCents");
    await expect(service.list(GONE, 1, 20)).rejects.toMatchObject({ status: 404 });
  });
  it("creates with typed capacity, records the CREATED change and audits", async () => {
    const { service, changes, audits } = fake();
    const created = await service.create(input(), ACTOR);
    expect(created).toMatchObject({ capacity: 12, heldSeats: 0, availableSeats: 12, availabilityStatus: "TO_CONFIRM" });
    expect(changes).toEqual([
      expect.objectContaining({
        departureId: created.id,
        kind: "CREATED",
        delta: 12,
        capacityAfter: 12,
        actorId: ACTOR,
      }),
    ]);
    expect(audits[0]).toMatchObject({ action: "departures.created", entityId: created.id });
  });
  it("rejects bad ranges, unknown packages and a second departure on the same date", async () => {
    const { service } = fake();
    await expect(service.create(input({ endsAt: day("2027-02-01") }), ACTOR)).rejects.toMatchObject({
      response: { code: "DATE_RANGE_INVALID" },
    });
    await expect(service.create(input({ packageId: GONE }), ACTOR)).rejects.toMatchObject({
      response: { code: "PACKAGE_NOT_FOUND" },
    });
    await expect(service.create(input({ startsAt: day("2027-01-10") }), ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "DEPARTURE_EXISTS" },
    });
  });
  it("capacity can never go below held + sold, needs a reason and a fresh stamp", async () => {
    const { service, departures, changes, sql } = fake();
    const stamp = departures[0].updatedAt as Date;
    await expect(service.update(DEP, { capacity: 4, reason: "Bus pequeño" }, stamp, ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "CAPACITY_BELOW_COMMITTED", committed: 5 },
    });
    await expect(service.update(DEP, { capacity: 8 }, stamp, ACTOR)).rejects.toMatchObject({
      response: { code: "REASON_REQUIRED" },
    });
    await expect(
      service.update(DEP, { capacity: 8, reason: "x" }, new Date("2020-01-01T00:00:00Z"), ACTOR),
    ).rejects.toMatchObject({ response: { code: "STALE_UPDATE" } });
    expect(sql.some((text) => text.includes("FOR UPDATE"))).toBe(true);
    const after = await service.update(DEP, { capacity: 5, reason: "Bus pequeño" }, stamp, ACTOR);
    expect(after).toMatchObject({ capacity: 5, availableSeats: 0 });
    expect(changes).toEqual([
      expect.objectContaining({ kind: "CAPACITY", delta: -5, capacityAfter: 5, heldAfter: 2, reason: "Bus pequeño" }),
    ]);
  });
  it("date and status edits need no reason and write no seat change", async () => {
    const { service, departures, changes, audits } = fake();
    const after = await service.update(
      DEP,
      { endsAt: day("2027-01-15"), availabilityStatus: "SOLD_OUT" },
      departures[0].updatedAt as Date,
      ACTOR,
    );
    expect(after).toMatchObject({ availabilityStatus: "SOLD_OUT" });
    expect(changes).toHaveLength(0);
    expect(audits[0]).toMatchObject({ action: "departures.updated" });
  });
  it("holds atomically and refuses overbooking with 409 OVERBOOKING", async () => {
    const { service, departures, changes, sql } = fake();
    await expect(service.hold(DEP, 6, "Grupo", ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "OVERBOOKING", available: 5 },
    });
    expect(departures[0].heldSeats).toBe(2);
    const held = await service.hold(DEP, 5, "Grupo colegio", ACTOR);
    expect(held).toMatchObject({ heldSeats: 7, availableSeats: 0 });
    await expect(service.hold(DEP, 1, "Otro", ACTOR)).rejects.toMatchObject({ response: { code: "OVERBOOKING" } });
    expect(changes).toEqual([
      expect.objectContaining({ kind: "HOLD", delta: 5, heldAfter: 7, soldAfter: 3, reason: "Grupo colegio" }),
    ]);
    expect(sql.filter((text) => text.startsWith('UPDATE "departures"'))).toHaveLength(3);
  });
  it("releases only held seats", async () => {
    const { service, changes } = fake();
    await expect(service.release(DEP, 3, "Error", ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "RELEASE_EXCEEDS_HELD", held: 2 },
    });
    const released = await service.release(DEP, 2, "Cliente desistió", ACTOR);
    expect(released).toMatchObject({ heldSeats: 0, soldSeats: 3, availableSeats: 7 });
    expect(changes).toEqual([expect.objectContaining({ kind: "RELEASE", delta: -2, heldAfter: 0 })]);
  });
  it("unknown or deleted-package departures are 404, history included", async () => {
    const { service } = fake([departure(), departure({ id: "00000000-0000-4000-8000-0000000000d2", packageId: GONE })]);
    await expect(service.hold("00000000-0000-4000-8000-0000000000d9", 1, "abc", ACTOR)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.hold("00000000-0000-4000-8000-0000000000d2", 1, "abc", ACTOR)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.history("00000000-0000-4000-8000-0000000000d2")).rejects.toMatchObject({ status: 404 });
    await service.hold(DEP, 1, "Reserva telefónica", ACTOR);
    expect((await service.history(DEP)).map((row) => row.kind)).toEqual(["HOLD"]);
  });
});
