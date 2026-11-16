import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { calculateCommercialQuote } from "@ricaurte/domain";
import { PublicCatalogService } from "./public-catalog.service";
import { PublicQuotesService } from "./public-quotes.service";

const selection = {
  packageId: "00000000-0000-4000-8000-000000000001",
  adults: 2,
  childAges: [],
  optionalTourIds: [],
  addOnIds: [],
};
function service(enabled = true) {
  const db = {
    client: vi.fn(async () => ({
      quote: { findUnique: vi.fn(async () => ({ reference: "PUB-OLD", status: "NEW" })) },
    })),
  };
  const catalog = { pricing: vi.fn(), preview: vi.fn() };
  return {
    db,
    catalog,
    value: new PublicQuotesService(
      db as never,
      catalog as never,
      { PUBLIC_QUOTE_REQUESTS_ENABLED: enabled ? "true" : "false", WEB_ORIGIN: "http://localhost:3000" } as never,
    ),
  };
}
describe("PublicQuotesService", () => {
  it("returns the same reference without a tracking code for an idempotent replay", async () => {
    const { value } = service();
    await expect(
      value.create(
        {
          ...selection,
          contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" },
          dataConsent: true,
          idempotencyKey: "00000000-0000-4000-8000-000000000002",
          website: "",
        },
        "127.0.0.1",
      ),
    ).resolves.toEqual({ reference: "PUB-OLD", status: "NEW", trackingCode: null });
  });
  it("does not persist a honeypot submission", async () => {
    const { value, db } = service();
    await value.create(
      {
        ...selection,
        contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" },
        dataConsent: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
        website: "robot",
      },
      "127.0.0.1",
    );
    expect(db.client).not.toHaveBeenCalled();
  });
  it("returns 503 while public intake is disabled", async () => {
    const { value } = service(false);
    await expect(
      value.create(
        {
          ...selection,
          contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" },
          dataConsent: true,
          idempotencyKey: "00000000-0000-4000-8000-000000000002",
          website: "",
        },
        "127.0.0.1",
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("does not disclose a quote when the tracking code is wrong", async () => {
    const db = {
      client: vi.fn(async () => ({
        quote: {
          findFirst: vi.fn(async () => ({
            reference: "PUB-X",
            trackingCodeHash: "a".repeat(64),
            status: "NEW",
            createdAt: new Date(),
            travelDate: null,
            totalCents: null,
            currency: "COP",
            package: null,
          })),
        },
      })),
    };
    const value = new PublicQuotesService(
      db as never,
      {} as never,
      { PUBLIC_QUOTE_REQUESTS_ENABLED: "true", WEB_ORIGIN: "http://localhost:3000" } as never,
    );
    await expect(value.track("PUB-X", "wrong")).rejects.toMatchObject({ status: 404 });
  });
});

describe("PublicQuotesService promotion redemption", () => {
  const offer = {
    id: "00000000-0000-4000-8000-0000000000aa",
    code: "VERANO10",
    name: "Verano",
    discountType: "PERCENT" as const,
    percentBps: 1000,
    amountOffCents: null,
  };
  const price = (promotion?: typeof offer, notices: string[] = []) => ({
    pkg: { destinationId: "00000000-0000-4000-8000-000000000003" },
    result: calculateCommercialQuote({
      adults: 2,
      childAges: [],
      ageBands: [],
      items: [
        {
          kind: "PACKAGE",
          targetId: "p",
          rules: [
            { id: "r", description: "Base", amountCents: 1000n, ruleSetVersion: "v1", unit: "PER_PERSON", priority: 0 },
          ],
        },
      ],
      promotion,
      notices,
    }),
  });
  function setup(redeemed: number[]) {
    const quoteCreate = vi.fn(async ({ data }: { data: { reference: string; status: string } }) => ({
      id: "q1",
      reference: data.reference,
      status: data.status,
    }));
    const lineCreate = vi.fn(async () => ({}));
    const executeRaw = vi.fn(async () => redeemed.shift() ?? 0);
    const tx = {
      $executeRaw: executeRaw,
      customer: { create: vi.fn(async () => ({ id: "c1" })) },
      legalDocument: { findFirst: vi.fn(async () => ({ id: "l1", version: "1" })) },
      quote: { create: quoteCreate },
      consentRecord: { create: vi.fn() },
      quoteLine: { createMany: lineCreate },
      auditLog: { create: vi.fn() },
    };
    const client = {
      quote: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const pricing = vi.fn(async (_input: unknown, options?: { dropPromotion?: string }) =>
      options?.dropPromotion ? price(undefined, [options.dropPromotion]) : price(offer),
    );
    const presenter = new PublicCatalogService({} as never);
    const catalog = {
      pricing,
      present: (result: Parameters<PublicCatalogService["present"]>[0]) => presenter.present(result),
    };
    const value = new PublicQuotesService(
      { client: vi.fn(async () => client) } as never,
      catalog as never,
      { PUBLIC_QUOTE_REQUESTS_ENABLED: "true", WEB_ORIGIN: "http://localhost:3000" } as never,
    );
    return { value, pricing, executeRaw, quoteCreate, lineCreate };
  }
  const request = {
    ...selection,
    promotionCode: "VERANO10",
    contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" },
    dataConsent: true as const,
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    website: "",
  };

  it("counts one redemption and stores the applied promotion in the snapshot", async () => {
    const { value, executeRaw, quoteCreate, lineCreate } = setup([1]);
    await expect(value.create(request, "127.0.0.1")).resolves.toMatchObject({ status: "NEW" });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const data = (
      quoteCreate.mock.calls[0]![0] as unknown as {
        data: { totalCents: bigint; priceSnapshot: { promotion: unknown } };
      }
    ).data;
    expect(data.totalCents).toBe(1800n);
    expect(data.priceSnapshot.promotion).toMatchObject({ id: offer.id, code: "VERANO10", discountCents: "200" });
    const lines = (lineCreate.mock.calls[0] as unknown as [{ data: { kind: string; totalCents: bigint }[] }])[0].data;
    expect(lines.map((line) => [line.kind, line.totalCents])).toEqual([
      ["PACKAGE", 2000n],
      ["PROMOTION", -200n],
    ]);
  });

  it("recomputes without the promotion when the cap is reached concurrently", async () => {
    const { value, pricing, executeRaw, quoteCreate } = setup([0]);
    await expect(value.create(request, "127.0.0.1")).resolves.toMatchObject({ status: "NEW" });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(pricing).toHaveBeenLastCalledWith(request, { dropPromotion: "PROMOTION_EXHAUSTED" });
    expect(quoteCreate).toHaveBeenCalledTimes(1);
    const data = (
      quoteCreate.mock.calls[0]![0] as unknown as {
        data: { totalCents: bigint; priceSnapshot: { promotion: unknown; noticeCodes: string[] } };
      }
    ).data;
    expect(data).toMatchObject({
      totalCents: 2000n,
      priceSnapshot: { promotion: null, noticeCodes: ["PROMOTION_EXHAUSTED"] },
    });
  });
});
