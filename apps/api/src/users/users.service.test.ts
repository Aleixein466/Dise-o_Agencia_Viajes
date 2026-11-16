import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";

function fakeClient(options: { targetIsActiveAdmin: boolean; otherAdmins: number }) {
  const roles = options.targetIsActiveAdmin ? [{ roleCode: "ADMIN" }] : [{ roleCode: "ADVISOR" }];
  const client = {
    user: {
      findUnique: vi.fn(async (args: { select?: Record<string, unknown> }) =>
        args.select && "roles" in args.select ? { status: "ACTIVE", deletedAt: null, roles } : { id: "target" },
      ),
      count: vi.fn(async () => options.otherAdmins),
      update: vi.fn(async () => ({ id: "target", email: "t@x.test", name: "T", status: "DISABLED" })),
    },
    userRoleAssignment: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    session: { updateMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return client;
}

describe("UsersService last active administrator", () => {
  it("refuses to disable the only active ADMIN", async () => {
    const client = fakeClient({ targetIsActiveAdmin: true, otherAdmins: 0 });
    const service = new UsersService({ client: async () => client } as never);
    await expect(service.update("target", { status: "DISABLED" }, "actor")).rejects.toMatchObject({
      status: 409,
      response: { code: "LAST_ADMIN" },
    });
    expect(client.user.update).not.toHaveBeenCalled();
  });

  it("refuses to take the ADMIN role away from the only active ADMIN", async () => {
    const client = fakeClient({ targetIsActiveAdmin: true, otherAdmins: 0 });
    const service = new UsersService({ client: async () => client } as never);
    await expect(service.assignRoles("target", ["ADVISOR"], "actor")).rejects.toMatchObject({ status: 409 });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("allows disabling an ADMIN while another active ADMIN remains, and renaming never counts", async () => {
    const client = fakeClient({ targetIsActiveAdmin: true, otherAdmins: 1 });
    const service = new UsersService({ client: async () => client } as never);
    await expect(service.update("target", { status: "DISABLED" }, "actor")).resolves.toMatchObject({ id: "target" });
    client.user.count.mockClear();
    await service.update("target", { name: "Renamed" }, "actor");
    expect(client.user.count).not.toHaveBeenCalled();
  });

  it("does not guard non-admin accounts", async () => {
    const client = fakeClient({ targetIsActiveAdmin: false, otherAdmins: 0 });
    const service = new UsersService({ client: async () => client } as never);
    await expect(service.assignRoles("target", ["FINANCE"], "actor")).resolves.toBeUndefined();
  });
});
