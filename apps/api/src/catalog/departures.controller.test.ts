import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { DeparturesController } from "./departures.controller";

const ID = "00000000-0000-4000-8000-000000000001";
const PKG = "00000000-0000-4000-8000-0000000000a1";
const STAMP = { expectedUpdatedAt: "2026-11-14T00:00:00.000Z" };
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
const ORIGIN = "http://localhost:3000";
const create = {
  packageId: PKG,
  startsAt: "2027-01-10T05:00:00Z",
  endsAt: "2027-01-14T05:00:00Z",
  capacity: 20,
};

function setup(role: RoleCode) {
  const granted = permissionsForRoles([role]) as ReadonlySet<string>;
  const check = (permission: string) => {
    if (!granted.has(permission)) throw new ForbiddenException();
    return { user: { id: "staff" } };
  };
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requirePermission: vi.fn(async (_t: string, _c?: string, _o?: string, permission = "") => check(permission)),
    requireReadPermission: vi.fn(async (_t: string, permission: string) => check(permission)),
  };
  const departures = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  return { auth, departures, controller: new DeparturesController(auth as never, departures as never) };
}

describe("DeparturesController", () => {
  it("FINANCE cannot read or change cupos", async () => {
    const { controller, departures } = setup("FINANCE");
    await expect(controller.list(request, { packageId: PKG })).rejects.toMatchObject({ status: 403 });
    await expect(controller.create(create, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 403 });
    await expect(controller.hold(ID, { seats: 1, reason: "Grupo" }, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    expect(departures.hold).not.toHaveBeenCalled();
  });
  it("reads with catalog:write and requires a package filter", async () => {
    const { controller, departures, auth } = setup("ADVISOR");
    await controller.list(request, { packageId: PKG, page: "2" });
    expect(auth.requireReadPermission).toHaveBeenLastCalledWith("opaque", "catalog:write");
    expect(departures.list).toHaveBeenCalledWith(PKG, 2, 20);
    for (const query of [{}, { packageId: "x" }, { packageId: PKG, pageSize: "51" }])
      await expect(controller.list(request, query)).rejects.toMatchObject({ status: 400 });
  });
  it("creates with manual capacity, default status to confirm, and rejects price or seats fields", async () => {
    const { controller, departures, auth } = setup("ADMIN");
    await controller.create(create, request, "csrf", ORIGIN);
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "catalog:write");
    expect(departures.create).toHaveBeenCalledWith(
      {
        packageId: PKG,
        startsAt: new Date(create.startsAt),
        endsAt: new Date(create.endsAt),
        capacity: 20,
        availabilityStatus: "TO_CONFIRM",
      },
      "staff",
    );
    const bad = [
      { ...create, capacity: -1 },
      { ...create, capacity: 2.5 },
      { ...create, capacity: "20" },
      { ...create, priceCents: "100" },
      { ...create, heldSeats: 3 },
      { ...create, startsAt: "2027-01-10" },
      { ...create, availabilityStatus: "MAYBE" },
    ];
    for (const body of bad)
      await expect(controller.create(body, request, "csrf", ORIGIN)).rejects.toMatchObject({
        response: { code: "VALIDATION_FAILED" },
      });
  });
  it("patch needs a stamp and a real change; reason alone is not a change", async () => {
    const { controller, departures } = setup("ADVISOR");
    await controller.update(ID, { ...STAMP, capacity: 30, reason: "Bus más grande" }, request, "csrf", ORIGIN);
    expect(departures.update).toHaveBeenCalledWith(
      ID,
      { capacity: 30, reason: "Bus más grande" },
      new Date(STAMP.expectedUpdatedAt),
      "staff",
    );
    for (const body of [STAMP, { ...STAMP, reason: "Solo motivo" }, { capacity: 3 }, { ...STAMP, soldSeats: 1 }])
      await expect(controller.update(ID, body, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
    await expect(controller.update("nope", { ...STAMP, capacity: 3 }, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("hold and release need positive whole seats and a reason", async () => {
    const { controller, departures } = setup("ADMIN");
    await controller.hold(ID, { seats: 2, reason: "  Grupo colegio " }, request, "csrf", ORIGIN);
    expect(departures.hold).toHaveBeenCalledWith(ID, 2, "Grupo colegio", "staff");
    await controller.release(ID, { seats: 1, reason: "Canceló" }, request, "csrf", ORIGIN);
    expect(departures.release).toHaveBeenCalledWith(ID, 1, "Canceló", "staff");
    for (const body of [
      { seats: 0, reason: "Grupo" },
      { seats: 1 },
      { seats: 1, reason: "x" },
      { seats: -2, reason: "abc" },
    ])
      await expect(controller.hold(ID, body, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
    await controller.history(ID, request);
    expect(departures.history).toHaveBeenCalledWith(ID);
  });
});
