import { randomUUID } from "node:crypto";

/** Minimal in-memory Prisma stand-in for unit tests (equality, not/in/equals/startsWith, skip/take). Not for production. */
type Row = Record<string, unknown>;
let clock = Date.parse("2026-11-01T00:00:00.000Z");
const tick = () => new Date(++clock);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "NOT") return !matches(row, value as Row);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as Record<string, unknown>;
      const cell = row[key];
      if ("not" in op) return cell !== op.not;
      if ("in" in op) return (op.in as unknown[]).includes(cell);
      if ("equals" in op) return String(cell).toLowerCase() === String(op.equals).toLowerCase();
      if ("startsWith" in op) return String(cell ?? "").startsWith(String(op.startsWith));
      return true;
    }
    if (value instanceof Date) return row[key] instanceof Date && (row[key] as Date).getTime() === value.getTime();
    return (row[key] ?? null) === (value ?? null);
  });
}

const pick = (row: Row | null | undefined, select?: Row) =>
  !row
    ? null
    : select
      ? Object.fromEntries(
          Object.keys(select)
            .filter((k) => select[k] && k in row)
            .map((k) => [k, row[k]]),
        )
      : { ...row };

export function table(rows: Row[], pk = "id") {
  const api = {
    rows,
    count: async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where)).length,
    findMany: async ({
      where,
      skip = 0,
      take,
      select,
    }: { where?: Row; skip?: number; take?: number; select?: Row } = {}) =>
      rows
        .filter((r) => matches(r, where))
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((r) => pick(r, select)),
    findFirst: async ({ where, select }: { where?: Row; select?: Row } = {}) =>
      pick(
        rows.find((r) => matches(r, where)),
        select,
      ),
    findUnique: async ({ where }: { where: Row }) => pick(rows.find((r) => matches(r, where))),
    findUniqueOrThrow: async ({ where, select }: { where: Row; select?: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      return pick(row, select);
    },
    create: async ({ data }: { data: Row }) => {
      const now = tick();
      const row: Row = {
        ...(pk === "id" && !("id" in data) ? { id: randomUUID() } : {}),
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      rows.push(row);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
      const found = rows.filter((r) => matches(r, where));
      for (const row of found) Object.assign(row, data, { updatedAt: tick() });
      return { count: found.length };
    },
    deleteMany: async ({ where }: { where?: Row } = {}) => {
      const found = rows.filter((r) => matches(r, where));
      for (const row of found) rows.splice(rows.indexOf(row), 1);
      return { count: found.length };
    },
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (row) return Object.assign(row, update, { updatedAt: tick() });
      return api.create({ data: create });
    },
  };
  return api;
}

export function fakeDb(seed: Partial<Record<string, Row[]>> = {}) {
  const names = ["faqItem", "contentPage", "siteSetting", "auditLog", "mediaAsset", "destination", "agencySetting"];
  const tables = Object.fromEntries(
    names.map((name) => [name, table(seed[name] ?? [], name === "siteSetting" ? "key" : "id")]),
  ) as Record<string, ReturnType<typeof table>>;
  const client = {
    ...tables,
    $transaction: async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]),
  };
  return { client, tables, db: { client: async () => client } as never };
}
