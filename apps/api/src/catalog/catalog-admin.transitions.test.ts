import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogAdminService } from "./catalog-admin.service";

describe("price-rule publication", () => {
  it("returns 409 for a stale expectedUpdatedAt", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ locked: 1 }]),
      priceRule: {
        findUnique: vi.fn(async () => ({
          id: "00000000-0000-4000-8000-000000000001",
          active: false,
          isFictitious: true,
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        })),
        updateMany: vi.fn(),
      },
    };
    const db = {
      client: vi.fn(async () => ({ $transaction: vi.fn(async (work: (t: typeof tx) => unknown) => work(tx)) })),
    };
    await expect(
      new CatalogAdminService(db as never).approvePriceRule(
        "00000000-0000-4000-8000-000000000001",
        new Date("2026-01-01T00:00:00.000Z"),
        "actor",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.priceRule.updateMany).not.toHaveBeenCalled();
  });
  it("never re-approves a deactivated approved rate (lifecycle is one-way)", async () => {
    const stamp = new Date("2026-01-01T00:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn(async () => [{ locked: 1 }]),
      priceRule: {
        findUnique: vi.fn(async () => ({ id: "r", active: false, isFictitious: false, updatedAt: stamp })),
        updateMany: vi.fn(),
      },
    };
    const db = {
      client: vi.fn(async () => ({ $transaction: vi.fn(async (work: (t: typeof tx) => unknown) => work(tx)) })),
    };
    await expect(new CatalogAdminService(db as never).approvePriceRule("r", stamp, "actor")).rejects.toMatchObject({
      response: { code: "NOT_DRAFT" },
    });
    expect(tx.priceRule.updateMany).not.toHaveBeenCalled();
  });
  it("updates a draft amount only while it is still a draft, auditing in the same transaction", async () => {
    const tx = {
      priceRule: {
        findFirst: vi.fn(async () => ({ id: "r", amountCents: 100n })),
        // An approval landed after the read: the guarded write matches nothing.
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUniqueOrThrow: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };
    const db = {
      client: vi.fn(async () => ({ $transaction: vi.fn(async (work: (t: typeof tx) => unknown) => work(tx)) })),
    };
    await expect(new CatalogAdminService(db as never).updateRate("r", 200n, "actor")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.priceRule.updateMany).toHaveBeenCalledWith({
      where: { id: "r", active: false, isFictitious: true },
      data: { amountCents: 200n },
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects approval without catalog:publish permission", async () => {
    const auth = {
      cookieName: vi.fn(() => "rt_session"),
      requirePermission: vi.fn().mockRejectedValue(new ForbiddenException()),
    };
    const catalog = { approvePriceRule: vi.fn() };
    const controller = new CatalogAdminController(auth as never, catalog as never);
    await expect(
      controller.approvePriceRule(
        "00000000-0000-4000-8000-000000000001",
        { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" },
        { headers: { cookie: "rt_session=x" } } as never,
        "csrf",
        "http://localhost:3000",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(catalog.approvePriceRule).not.toHaveBeenCalled();
  });
});
