import { describe, expect, it, vi } from "vitest";
import { PublicCatalogService } from "./public-catalog.service";

describe("PublicCatalogService pricing", () => {
  it("excludes draft and fictitious rules from a public preview", async () => {
    const db = { client: vi.fn(async () => ({ tourPackage: { findFirst: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001", title: "Paquete", destinationId: "00000000-0000-4000-8000-000000000003", components: [], priceRules: [
      { id: "draft", name: "Draft", amountCents: 100n, unit: "PER_PERSON", ruleSetVersion: "1", active: false, isFictitious: false, validFrom: null, validTo: null, packageId: "00000000-0000-4000-8000-000000000001", roomTypeId: null, transportOptionId: null, tourId: null, addOnId: null },
      { id: "fake", name: "Fake", amountCents: 100n, unit: "PER_PERSON", ruleSetVersion: "1", active: true, isFictitious: true, validFrom: null, validTo: null, packageId: "00000000-0000-4000-8000-000000000001", roomTypeId: null, transportOptionId: null, tourId: null, addOnId: null },
    ] })) } })) };
    const value = new PublicCatalogService(db as never);
    const preview = await value.preview({ packageId: "00000000-0000-4000-8000-000000000001", adults: 1, childAges: [], optionalTourIds: [], addOnIds: [] });
    expect(preview).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
    expect(preview.lines).toEqual([]);
  });

  it("uses the accommodation rate as base and charges approved transport", async () => {
    const pkgId = "00000000-0000-4000-8000-000000000001";
    const room = "00000000-0000-4000-8000-000000000010";
    const bus = "00000000-0000-4000-8000-000000000020";
    const hotel = "00000000-0000-4000-8000-000000000030";
    const rule = (id: string, amountCents: bigint, extra: Record<string, unknown> = {}) => ({
      id, name: id, amountCents, unit: "PER_PERSON", ruleSetVersion: "1", active: true, isFictitious: false,
      validFrom: null, validTo: null, conditions: null, transportOptionId: null, tourId: null, addOnId: null, ...extra,
    });
    const service = (packageRules: ReturnType<typeof rule>[]) => {
      const db = { client: vi.fn(async () => ({
        tourPackage: { findFirst: vi.fn(async () => ({ id: pkgId, title: "Paquete", destinationId: pkgId, priceRules: packageRules,
          components: [{ type: "HOTEL", included: true, hotelId: hotel, transportOptionId: null, tourId: null, addOnId: null, hotel: { roomTypes: [{ id: room }] } },
            { type: "TRANSPORT", included: false, hotelId: null, transportOptionId: bus, tourId: null, addOnId: null, hotel: null }] })) },
        priceRule: { findMany: vi.fn(async () => [rule("bus", 50n, { transportOptionId: bus })]) },
      })) };
      return new PublicCatalogService(db as never);
    };
    const selection = { packageId: pkgId, hotelId: hotel, roomTypeId: room, transportOptionId: bus, adults: 2, childAges: [], optionalTourIds: [], addOnIds: [] };
    const preview = await service([rule("generic", 100n), rule("double", 300n, { conditions: { roomTypeId: room } })]).preview(selection);
    expect(preview).toMatchObject({ status: "PRICED", totalCents: "700" });
    expect(preview.lines.map((l) => l.label)).toEqual(["double", "bus"]);
    // Two unbound package rates are ambiguous: never guess a base price.
    const ambiguous = await service([rule("a", 100n), rule("b", 200n)]).preview(selection);
    expect(ambiguous).toMatchObject({ status: "REQUIRES_MANUAL_REVIEW", totalCents: null });
  });
});
