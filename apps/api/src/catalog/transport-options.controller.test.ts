import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { TransportOptionsController } from "./transport-options.controller";

const ID = "00000000-0000-4000-8000-000000000001";
const DEST = "00000000-0000-4000-8000-0000000000d1";
const STAMP = { expectedUpdatedAt: "2026-11-14T00:00:00.000Z" };
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
const ORIGIN = "http://localhost:3000";

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
  const options = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  return { auth, options, controller: new TransportOptionsController(auth as never, options as never) };
}

describe("TransportOptionsController", () => {
  it("FINANCE cannot read or write", async () => {
    const { controller, options } = setup("FINANCE");
    await expect(controller.list(request, {})).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.create({ destinationId: DEST, mode: "AIR", name: "Vuelo" }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({ status: 403 });
    await expect(controller.deactivate(ID, STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 403 });
    expect(options.create).not.toHaveBeenCalled();
  });
  it("ADMIN creates with trimmed name and normalised empty text", async () => {
    const { controller, options, auth } = setup("ADMIN");
    await controller.create(
      { destinationId: DEST, mode: "SEA", name: "  Lancha rápida ", description: "  ", conditions: "Equipaje" },
      request,
      "csrf",
      ORIGIN,
    );
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "catalog:write");
    expect(options.create).toHaveBeenCalledWith(
      { destinationId: DEST, mode: "SEA", name: "Lancha rápida", description: null, conditions: "Equipaje" },
      "staff",
    );
  });
  it("rejects invalid bodies and queries as VALIDATION_FAILED", async () => {
    const { controller, options } = setup("ADMIN");
    const bad = [
      { destinationId: DEST, mode: "TRAIN", name: "Tren" },
      { destinationId: DEST, mode: "AIR", name: "x" },
      { destinationId: DEST, mode: "AIR", name: "Vuelo", price: 5 },
      { destinationId: DEST, mode: "AIR", name: "Vuelo", description: "x".repeat(2001) },
    ];
    for (const body of bad)
      await expect(controller.create(body, request, "csrf", ORIGIN)).rejects.toMatchObject({
        response: { code: "VALIDATION_FAILED" },
      });
    await expect(controller.list(request, { pageSize: "51" })).rejects.toMatchObject({ status: 400 });
    expect(options.create).not.toHaveBeenCalled();
  });
  it("patch edits only name/description/conditions/mode and requires a change plus stamp", async () => {
    const { controller, options } = setup("ADMIN");
    await controller.update(ID, { ...STAMP, name: "Nuevo" }, request, "csrf", ORIGIN);
    expect(options.update).toHaveBeenCalledWith(ID, { name: "Nuevo" }, new Date(STAMP.expectedUpdatedAt), "staff");
    for (const body of [STAMP, { name: "Nuevo" }, { ...STAMP, destinationId: DEST }])
      await expect(controller.update(ID, body, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
    await expect(controller.update("nope", { ...STAMP, name: "Nuevo" }, request, "csrf", ORIGIN)).rejects.toMatchObject(
      {
        status: 404,
      },
    );
  });
  it("forwards filters and transitions", async () => {
    const { controller, options } = setup("ADVISOR");
    await controller.list(request, { destinationId: DEST, mode: "GROUND", status: "active", page: "2" });
    expect(options.list).toHaveBeenCalledWith({ destinationId: DEST, mode: "GROUND", status: "active" }, 2, 20);
    await controller.activate(ID, STAMP, request, "csrf", ORIGIN);
    expect(options.activate).toHaveBeenCalledWith(ID, new Date(STAMP.expectedUpdatedAt), "staff");
    await controller.history(ID, request);
    expect(options.history).toHaveBeenCalledWith(ID);
  });
});
