import { describe, expect, it, vi } from "vitest";
import { DestinationsService } from "./destinations.service";

const stamp = new Date("2026-11-16T12:00:00.000Z");
const row = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "providencia",
  name: "Providencia",
  country: "Colombia",
  region: "Caribe",
  description: "Borrador",
  category: "NACIONAL",
  status: "DRAFT",
  seoTitle: null,
  seoDescription: null,
  noindex: false,
  sortOrder: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

function setup(current = row) {
  const tx = {
    destination: {
      findFirst: vi.fn(async () => current),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({
        ...current,
        name: "Providencia editada",
        updatedAt: new Date(stamp.getTime() + 1),
      })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    client: vi.fn(async () => ({ $transaction: vi.fn(async (work: (value: typeof tx) => unknown) => work(tx)) })),
  };
  return { tx, service: new DestinationsService(db as never) };
}

describe("DestinationsService lifecycle", () => {
  it("rejects a stale edit before writing", async () => {
    const { service, tx } = setup();
    await expect(service.update(row.id, { name: "Otro" }, new Date(0), "actor")).rejects.toMatchObject({
      response: { code: "STALE_UPDATE" },
    });
    expect(tx.destination.updateMany).not.toHaveBeenCalled();
  });

  it("edits and audits in one transaction", async () => {
    const { service, tx } = setup();
    await expect(service.update(row.id, { name: "Providencia editada" }, stamp, "actor")).resolves.toMatchObject({
      name: "Providencia editada",
    });
    expect(tx.destination.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ updatedAt: stamp }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "destinations.updated" }) }),
    );
  });

  it("only publishes a draft and supports explicit withdrawal", async () => {
    const published = { ...row, status: "PUBLISHED" };
    const first = setup();
    await first.service.setStatus(row.id, "PUBLISHED", stamp, "actor");
    expect(first.tx.destination.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PUBLISHED" } }),
    );
    const second = setup(published);
    await second.service.setStatus(row.id, "DRAFT", stamp, "actor");
    expect(second.tx.destination.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DRAFT" } }),
    );
  });
});
