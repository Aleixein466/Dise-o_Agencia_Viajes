import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CommercialRulesController } from "./commercial-rules.controller";

const ID = "00000000-0000-4000-8000-000000000001";
const STAMP = { expectedUpdatedAt: "2026-11-14T00:00:00.000Z" };
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
const ORIGIN = "http://localhost:3000";

/** AuthService double that grants exactly the role's permissions (MFA/CSRF/Origin assumed valid). */
function authAs(role: RoleCode) {
  const granted = permissionsForRoles([role]) as ReadonlySet<string>;
  const check = (permission: string) => {
    if (!granted.has(permission)) throw new ForbiddenException();
    return { user: { id: "staff" } };
  };
  return {
    cookieName: vi.fn(() => "rt_session"),
    requirePermission: vi.fn(async (_t: string, _c?: string, _o?: string, permission = "") => check(permission)),
    requireReadPermission: vi.fn(async (_t: string, permission: string) => check(permission)),
  };
}
function setup(role: RoleCode) {
  const auth = authAs(role);
  const rules = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  const catalog = { createPriceRule: vi.fn(async () => ({})), approvePriceRule: vi.fn(async () => ({})) };
  return {
    auth,
    rules,
    catalog,
    controller: new CommercialRulesController(auth as never, rules as never),
    admin: new CatalogAdminController(auth as never, catalog as never),
  };
}
const seasonBody = { name: "Temporada alta", startsOn: "2026-12-15", endsOn: "2027-01-15" };

describe("CommercialRulesController permissions", () => {
  it("FINANCE cannot read or write commercial rules", async () => {
    const { controller, rules } = setup("FINANCE");
    await expect(controller.seasons(request, {})).rejects.toMatchObject({ status: 403 });
    await expect(controller.createSeason(seasonBody, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 403 });
    await expect(controller.approvePromotion(ID, STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    expect(rules.createSeason).not.toHaveBeenCalled();
  });
  it("ADVISOR (catalog:write) creates drafts but cannot approve or deactivate", async () => {
    const { controller, rules, auth } = setup("ADVISOR");
    await controller.createSeason(seasonBody, request, "csrf", ORIGIN);
    expect(rules.createSeason).toHaveBeenCalledWith(expect.objectContaining({ name: "Temporada alta" }), "staff");
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "catalog:write");
    for (const call of [
      () => controller.approveSeason(ID, STAMP, request, "csrf", ORIGIN),
      () => controller.deactivateAgeRule(ID, STAMP, request, "csrf", ORIGIN),
      () => controller.approvePromotion(ID, STAMP, request, "csrf", ORIGIN),
    ])
      await expect(call()).rejects.toMatchObject({ status: 403 });
    expect(rules.approveSeason).not.toHaveBeenCalled();
  });
  it("ADMIN approves under catalog:publish with the parsed expectedUpdatedAt", async () => {
    const { controller, rules, auth } = setup("ADMIN");
    await controller.approveSeason(ID, STAMP, request, "csrf", ORIGIN);
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "catalog:publish");
    expect(rules.approveSeason).toHaveBeenCalledWith(ID, new Date(STAMP.expectedUpdatedAt), "staff");
  });
  it("rejects without a session, with invalid bodies, empty patches and bad ids", async () => {
    const { controller, rules } = setup("ADMIN");
    await expect(controller.seasons({ headers: {} } as FastifyRequest, {})).rejects.toMatchObject({ status: 401 });
    const invalid = { status: 400, response: expect.objectContaining({ code: "VALIDATION_FAILED" }) };
    await expect(
      controller.createSeason({ ...seasonBody, startsOn: "15/12/2026" }, request, "c", ORIGIN),
    ).rejects.toEqual(expect.objectContaining(invalid));
    await expect(controller.createSeason({ ...seasonBody, extra: 1 }, request, "c", ORIGIN)).rejects.toEqual(
      expect.objectContaining(invalid),
    );
    await expect(controller.updateSeason(ID, STAMP, request, "c", ORIGIN)).rejects.toEqual(
      expect.objectContaining(invalid),
    );
    await expect(controller.approveSeason(ID, {}, request, "c", ORIGIN)).rejects.toEqual(
      expect.objectContaining(invalid),
    );
    await expect(controller.season("nope", request)).rejects.toMatchObject({ status: 404 });
    await expect(controller.seasons(request, { status: "deleted" })).rejects.toEqual(expect.objectContaining(invalid));
    expect(rules.createSeason).not.toHaveBeenCalled();
  });
  it("passes list filters and pagination through", async () => {
    const { controller, rules } = setup("ADVISOR");
    await controller.promotions(request, { status: "approved", scope: "PACKAGE", page: "2", pageSize: "10" });
    expect(rules.promotions).toHaveBeenCalledWith({ status: "approved", scope: "PACKAGE" }, 2, 10);
  });
  it("parses promotion amounts as bigint", async () => {
    const { controller, rules } = setup("ADVISOR");
    await controller.createPromotion(
      {
        code: "FIJO",
        name: "Fijo",
        discountType: "FIXED_AMOUNT",
        amountOffCents: "50000",
        startsAt: "2026-12-01T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
      },
      request,
      "c",
      ORIGIN,
    );
    expect(rules.createPromotion).toHaveBeenCalledWith(expect.objectContaining({ amountOffCents: 50_000n }), "staff");
  });
});

describe("CatalogAdminController price-rule create", () => {
  const body = { packageId: ID, name: "Adulto", unit: "PER_PERSON", amountCents: "100000", ruleSetVersion: "t-2026" };
  it("FINANCE gets 403, ADVISOR creates a draft but cannot approve", async () => {
    await expect(setup("FINANCE").admin.createPriceRule(body, request, "c", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    const advisor = setup("ADVISOR");
    await advisor.admin.createPriceRule({ ...body, occupancy: 2, roomTypeId: ID }, request, "c", ORIGIN);
    expect(advisor.catalog.createPriceRule).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 100_000n, occupancy: 2, roomTypeId: ID }),
      "staff",
    );
    await expect(advisor.admin.approvePriceRule(ID, STAMP, request, "c", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    expect(advisor.catalog.approvePriceRule).not.toHaveBeenCalled();
  });
  it("rejects malformed amounts and unknown fields", async () => {
    const { admin, catalog } = setup("ADMIN");
    for (const bad of [
      { ...body, amountCents: 100 },
      { ...body, amountCents: "-1" },
      { ...body, active: true },
    ])
      await expect(admin.createPriceRule(bad, request, "c", ORIGIN)).rejects.toMatchObject({ status: 400 });
    expect(catalog.createPriceRule).not.toHaveBeenCalled();
  });
});
