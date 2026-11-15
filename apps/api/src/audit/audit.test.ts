import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { AuditController } from "./audit.controller";
import { actionPrefix, AuditService, auditWhere } from "./audit.service";
import { redact } from "./redact";

const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
type Args = { select: Record<string, unknown>; orderBy: unknown; skip: number };
const ID = "00000000-0000-4000-8000-000000000001";

describe("redact", () => {
  it("hides sensitive keys at any depth, including arrays", () => {
    const out = redact({
      amountCents: "100",
      Email: "a@b.co",
      nested: { passwordHash: "x", ok: 1, list: [{ otpCode: "123456", name: "n" }, "plain"] },
      phoneNumber: "300",
      documentNumber: "1",
      apiKey: "k",
      mfaSecret: "s",
      sessionToken: "t",
    });
    expect(out).toEqual({
      amountCents: "100",
      Email: "[oculto]",
      nested: { passwordHash: "[oculto]", ok: 1, list: [{ otpCode: "[oculto]", name: "n" }, "plain"] },
      phoneNumber: "[oculto]",
      documentNumber: "[oculto]",
      apiKey: "[oculto]",
      mfaSecret: "[oculto]",
      sessionToken: "[oculto]",
    });
  });
  it("keeps identifier codes visible but hides secret codes", () => {
    expect(redact({ code: "VERANO10", trackingCode: "T-1", recoveryCode: "r", codeHash: "h" })).toEqual({
      code: "VERANO10",
      trackingCode: "[oculto]",
      recoveryCode: "[oculto]",
      codeHash: "[oculto]",
    });
  });
  it("passes through null and scalars and does not mutate the input", () => {
    const input = { email: "a@b.co" };
    expect(redact(null)).toBeNull();
    expect(redact("x")).toBe("x");
    redact(input);
    expect(input.email).toBe("a@b.co");
  });
  it("stops at a depth limit instead of recursing forever", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 30; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("[oculto]");
  });
});

describe("auditWhere", () => {
  it("uses Bogotá day bounds with an inclusive end day and prefix match on action", () => {
    const where = auditWhere({ from: "2026-11-14", to: "2026-11-14", action: "pricing.", entity: "price_rule" });
    expect(where).toEqual({
      entity: "price_rule",
      action: { startsWith: "pricing." },
      createdAt: { gte: new Date("2026-11-14T05:00:00.000Z"), lt: new Date("2026-11-15T05:00:00.000Z") },
    });
  });
  it("is empty without filters", () => {
    expect(auditWhere({})).toEqual({});
  });
  it("derives action prefixes", () => {
    expect(actionPrefix("pricing.draft_created")).toBe("pricing");
    expect(actionPrefix("login")).toBe("login");
  });
});

describe("AuditService", () => {
  it("never selects ipHash, redacts snapshots and orders newest first", async () => {
    const findMany = vi.fn(async () => [
      {
        id: ID,
        createdAt: new Date("2026-11-14T10:00:00Z"),
        action: "users.updated",
        entity: "user",
        entityId: "u1",
        actorRole: "ADMIN",
        requestId: "r1",
        before: { email: "a@b.co", name: "A" },
        after: null,
        details: { token: "t" },
        actor: { id: ID, name: "Admin" },
      },
    ]);
    const client = {
      auditLog: { count: vi.fn(async () => 41), findMany },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new AuditService({ client: async () => client } as never);
    const out = await service.list({ entity: "user" }, 2, 20);
    const args = (findMany.mock.calls as unknown as [Args][])[0]?.[0] as Args;
    expect(args.select).not.toHaveProperty("ipHash");
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.skip).toBe(20);
    expect(out).toMatchObject({ total: 41, page: 2, pageSize: 20, pages: 3 });
    expect(out.items[0]).toMatchObject({
      createdAt: "2026-11-14T10:00:00.000Z",
      before: { email: "[oculto]", name: "A" },
      details: { token: "[oculto]" },
      actor: { id: ID, name: "Admin" },
    });
    expect(JSON.stringify(out)).not.toContain("ipHash");
  });
  it("facets return entities and unique sorted action prefixes", async () => {
    const client = {
      auditLog: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([{ entity: "package" }, { entity: "price_rule" }])
          .mockResolvedValueOnce([
            { action: "pricing.approved" },
            { action: "pricing.draft_created" },
            { action: "auth.login" },
          ]),
      },
    };
    const service = new AuditService({ client: async () => client } as never);
    await expect(service.facets()).resolves.toEqual({
      entities: ["package", "price_rule"],
      actions: ["auth", "pricing"],
    });
  });
});

function controllerAs(role: RoleCode) {
  const granted = permissionsForRoles([role]) as ReadonlySet<string>;
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requireReadPermission: vi.fn(async (_t: string, permission: string) => {
      if (!granted.has(permission)) throw new ForbiddenException();
      return {};
    }),
  };
  const audit = { list: vi.fn(async () => ({ items: [] })), facets: vi.fn(async () => ({})) };
  return { auth, audit, controller: new AuditController(auth as never, audit as never) };
}

describe("AuditController", () => {
  it("only ADMIN may read; FINANCE gets 403 and nothing is queried", async () => {
    const { controller, audit } = controllerAs("FINANCE");
    await expect(controller.list(request, {})).rejects.toMatchObject({ status: 403 });
    await expect(controller.facets(request)).rejects.toMatchObject({ status: 403 });
    expect(audit.list).not.toHaveBeenCalled();
  });
  it("ADMIN lists with parsed filters and defaults", async () => {
    const { controller, audit, auth } = controllerAs("ADMIN");
    await controller.list(request, { entity: "price_rule", from: "2026-11-01", pageSize: "10" });
    expect(auth.requireReadPermission).toHaveBeenCalledWith("opaque", "audit:read");
    expect(audit.list).toHaveBeenCalledWith({ entity: "price_rule", from: "2026-11-01" }, 1, 10);
  });
  it("rejects unknown params, bad dates, bad uuids and oversized pages", async () => {
    const { controller } = controllerAs("ADMIN");
    for (const query of [
      { extra: "1" },
      { from: "2026-13-40" },
      { actorId: "nope" },
      { pageSize: "51" },
      { page: "0" },
    ])
      await expect(controller.list(request, query)).rejects.toMatchObject({ status: 400 });
  });
});
