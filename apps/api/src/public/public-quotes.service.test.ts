import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PublicQuotesService } from "./public-quotes.service";

const selection = { packageId: "00000000-0000-4000-8000-000000000001", adults: 2, childAges: [], optionalTourIds: [], addOnIds: [] };
function service(enabled = true) {
  const db = { client: vi.fn(async () => ({ quote: { findUnique: vi.fn(async () => ({ reference: "PUB-OLD", status: "NEW" })) } })) };
  const catalog = { pricing: vi.fn(), preview: vi.fn() };
  return { db, catalog, value: new PublicQuotesService(db as never, catalog as never, { PUBLIC_QUOTE_REQUESTS_ENABLED: enabled ? "true" : "false", WEB_ORIGIN: "http://localhost:3000" } as never) };
}
describe("PublicQuotesService", () => {
  it("returns the same reference without a tracking code for an idempotent replay", async () => {
    const { value } = service();
    await expect(value.create({ ...selection, contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" }, dataConsent: true, idempotencyKey: "00000000-0000-4000-8000-000000000002", website: "" }, "127.0.0.1")).resolves.toEqual({ reference: "PUB-OLD", status: "NEW", trackingCode: null });
  });
  it("does not persist a honeypot submission", async () => {
    const { value, db } = service();
    await value.create({ ...selection, contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" }, dataConsent: true, idempotencyKey: "00000000-0000-4000-8000-000000000002", website: "robot" }, "127.0.0.1");
    expect(db.client).not.toHaveBeenCalled();
  });
  it("returns 503 while public intake is disabled", async () => {
    const { value } = service(false);
    await expect(value.create({ ...selection, contact: { name: "Ana Test", email: "ana@example.com", phone: "3001234567" }, dataConsent: true, idempotencyKey: "00000000-0000-4000-8000-000000000002", website: "" }, "127.0.0.1")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("does not disclose a quote when the tracking code is wrong", async () => {
    const db = { client: vi.fn(async () => ({ quote: { findFirst: vi.fn(async () => ({ reference: "PUB-X", trackingCodeHash: "a".repeat(64), status: "NEW", createdAt: new Date(), travelDate: null, totalCents: null, currency: "COP", package: null })) } })) };
    const value = new PublicQuotesService(db as never, {} as never, { PUBLIC_QUOTE_REQUESTS_ENABLED: "true", WEB_ORIGIN: "http://localhost:3000" } as never);
    await expect(value.track("PUB-X", "wrong")).rejects.toMatchObject({ status: 404 });
  });
});
