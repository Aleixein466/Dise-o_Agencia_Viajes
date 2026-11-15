import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { CustomersController } from "./customers.controller";

const ID = "00000000-0000-4000-8000-000000000001";
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
  const customers = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
  return { auth, customers, controller: new CustomersController(auth as never, customers as never) };
}

describe("CustomersController", () => {
  it("CUSTOMER role cannot read or write", async () => {
    const { controller, customers } = setup("CUSTOMER");
    await expect(controller.list(request, {})).rejects.toMatchObject({ status: 403 });
    await expect(controller.get(ID, request)).rejects.toMatchObject({ status: 403 });
    await expect(controller.addNote(ID, { body: "x" }, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 403 });
    expect(customers.get).not.toHaveBeenCalled();
  });
  it("FINANCE reads but cannot edit or add notes", async () => {
    const { controller, customers, auth } = setup("FINANCE");
    await controller.list(request, { q: "  ana  ", pageSize: "100" });
    expect(auth.requireReadPermission).toHaveBeenLastCalledWith("opaque", "customers:read");
    expect(customers.list).toHaveBeenCalledWith("ana", 1, 100);
    await expect(controller.update(ID, { ...STAMP, name: "Ana" }, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    await expect(controller.addNote(ID, { body: "Nota" }, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 403,
    });
    expect(customers.update).not.toHaveBeenCalled();
  });
  it("caps pages at 100 and rejects bad queries", async () => {
    const { controller, customers } = setup("ADVISOR");
    await expect(controller.list(request, { pageSize: "101" })).rejects.toMatchObject({
      response: { code: "VALIDATION_FAILED" },
    });
    await controller.list(request, { q: "   " });
    expect(customers.list).toHaveBeenCalledWith(undefined, 1, 20);
  });
  it("non-uuid ids are 404 and never reach the service", async () => {
    const { controller, customers } = setup("ADMIN");
    await expect(controller.get("1 OR 1=1", request)).rejects.toMatchObject({ status: 404 });
    await expect(controller.update("x", { ...STAMP, name: "Ana" }, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 404,
    });
    expect(customers.get).not.toHaveBeenCalled();
  });
  it("patch normalises contact data, requires a stamp and a change, and rejects other fields", async () => {
    const { controller, customers, auth } = setup("ADVISOR");
    await controller.update(
      ID,
      { ...STAMP, name: "  Ana Pérez ", email: " Ana@Correo.CO ", phone: "+57 300 123 4567", country: "co" },
      request,
      "csrf",
      ORIGIN,
    );
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "customers:write");
    expect(customers.update).toHaveBeenCalledWith(
      ID,
      { name: "Ana Pérez", email: "ana@correo.co", phone: "+57 300 123 4567", country: "CO" },
      new Date(STAMP.expectedUpdatedAt),
      "staff",
    );
    const bad = [
      STAMP,
      { name: "Ana" },
      { ...STAMP, documentNumber: "123" },
      { ...STAMP, email: "no-es-correo" },
      { ...STAMP, phone: "abc" },
      { ...STAMP, phone: "12-34" },
      { ...STAMP, country: "COL" },
      { ...STAMP, name: "A" },
    ];
    for (const body of bad)
      await expect(controller.update(ID, body, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
    await controller.update(ID, { ...STAMP, country: null }, request, "csrf", ORIGIN);
    expect(customers.update).toHaveBeenLastCalledWith(
      ID,
      { country: null },
      new Date(STAMP.expectedUpdatedAt),
      "staff",
    );
  });
  it("notes need text and trim it", async () => {
    const { controller, customers } = setup("ADMIN");
    await controller.addNote(ID, { body: "  Llamar mañana " }, request, "csrf", ORIGIN);
    expect(customers.addNote).toHaveBeenCalledWith(ID, "Llamar mañana", "staff");
    for (const body of [{ body: "   " }, { body: "x".repeat(4001) }, { body: "ok", authorId: "x" }])
      await expect(controller.addNote(ID, body, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
  });
});
