import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogAdminService } from "./catalog-admin.service";

describe("price-rule publication", () => {
  it("returns 409 for a stale expectedUpdatedAt", async () => {
    const db = {
      client: vi.fn(async () => ({
        priceRule: {
          findUnique: vi.fn(async () => ({
            id: "00000000-0000-4000-8000-000000000001",
            active: false,
            isFictitious: true,
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          })),
        },
      })),
    };
    await expect(
      new CatalogAdminService(db as never).approvePriceRule(
        "00000000-0000-4000-8000-000000000001",
        new Date("2026-01-01T00:00:00.000Z"),
        "actor",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
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
