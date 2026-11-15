import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProviderEvent } from "./sandbox-gateway";
import {
  WOMPI_EVENT_MAX_AGE_S,
  WOMPI_SANDBOX_BASE_URL,
  WompiSandboxGateway,
  type WompiConfig,
  type WompiFetch,
} from "./wompi-gateway";

// Clearly fake keys in the documented test format; nothing here contacts Wompi (fetch is injected).
const FAKE = "x".repeat(20);
const NOW_S = 1_800_000_000;
const cfg: WompiConfig = {
  publicKey: `pub_test_${FAKE}`,
  privateKey: `prv_test_${FAKE}`,
  eventsSecret: `test_events_${FAKE}`,
  integritySecret: `test_integrity_${FAKE}`,
  baseUrl: WOMPI_SANDBOX_BASE_URL,
  webOrigin: "https://staging.example.test",
  now: () => NOW_S * 1000,
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const make = (over: Partial<WompiConfig> = {}, f?: WompiFetch) => new WompiSandboxGateway({ ...cfg, ...over }, f);

function signed(timestamp = NOW_S): ProviderEvent {
  const event: ProviderEvent = {
    event: "transaction.updated",
    data: {
      transaction: { id: "1234-1", reference: "r", amount_in_cents: 4490000, currency: "COP", status: "APPROVED" },
    },
    environment: "test",
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    timestamp,
  };
  event.signature.checksum = sha(`1234-1APPROVED4490000${timestamp}${cfg.eventsSecret}`).toUpperCase();
  return event;
}

describe("WompiSandboxGateway", () => {
  it("enabled only with all keys; refuses prod keys and non-sandbox url", () => {
    expect(make().enabled()).toBe(true);
    expect(make({ privateKey: undefined }).enabled()).toBe(false);
    expect(() => make({ publicKey: `pub_prod_${FAKE}` })).toThrow();
    expect(() => make({ eventsSecret: `prod_events_${FAKE}` })).toThrow();
    expect(() => make({ baseUrl: "https://production.wompi.co/v1" })).toThrow();
  });

  it("integrity signature follows documented order", () => {
    // Official docs vector (https://docs.wompi.co/docs/colombia/widget-checkout-web/); its secret is a prod one,
    // so only the algorithm is checked here, never through the gateway.
    expect(sha("sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6")).toBe(
      "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5",
    );
    const g = make();
    expect(g.integritySignature("r1", 2490000, "COP")).toBe(sha(`r12490000COP${cfg.integritySecret}`));
    expect(g.integritySignature("r1", 2490000, "COP", "2023-06-09T20:28:50.000Z")).toBe(
      sha(`r12490000COP2023-06-09T20:28:50.000Z${cfg.integritySecret}`),
    );
  });

  it("hands the browser a same-origin hop, and signs the web checkout url with expiry and portal redirect", () => {
    const g = make();
    expect(g.checkoutUrl("TEST-0123456789ABCDEF")).toBe(
      "https://staging.example.test/api/v1/payments/wompi/checkout/TEST-0123456789ABCDEF",
    );
    const expiresAt = new Date("2026-11-14T20:30:00.000Z");
    const u = new URL(
      g.signedCheckoutUrl({ reference: "r1", amountCents: 1000n, currency: "COP", expiresAt, reservationId: "res-1" }),
    );
    expect(u.origin + u.pathname).toBe("https://checkout.wompi.co/p/");
    expect(u.searchParams.get("public-key")).toBe(cfg.publicKey);
    expect(u.searchParams.get("amount-in-cents")).toBe("1000");
    expect(u.searchParams.get("expiration-time")).toBe("2026-11-14T20:30:00.000Z");
    expect(u.searchParams.get("signature:integrity")).toBe(
      sha(`r11000COP2026-11-14T20:30:00.000Z${cfg.integritySecret}`),
    );
    expect(u.searchParams.get("redirect-url")).toBe("https://staging.example.test/mi-cuenta/reservas/res-1");
  });

  it("verifies the event checksum and rejects tampering, unsigned fields and non-test environments", () => {
    const g = make();
    const event = signed();
    expect(g.verify(event)).toBe(true);
    expect(g.verify({ ...event, data: { transaction: { ...event.data.transaction, status: "DECLINED" } } })).toBe(
      false,
    );
    expect(g.verify({ ...event, signature: { ...event.signature, checksum: "zz" } })).toBe(false);
    expect(g.verify({ ...event, signature: { ...event.signature, properties: ["transaction.id"] } })).toBe(false);
    expect(g.verify({ ...event, environment: "prod" })).toBe(false);
  });

  it("rejects stale and future-dated events even with a valid checksum", () => {
    const g = make();
    expect(g.verify(signed(NOW_S - WOMPI_EVENT_MAX_AGE_S + 60))).toBe(true);
    expect(g.verify(signed(NOW_S - WOMPI_EVENT_MAX_AGE_S - 1))).toBe(false);
    expect(g.verify(signed(NOW_S + 3600))).toBe(false);
  });

  const ok =
    (data: unknown): WompiFetch =>
    async () => ({ ok: true, status: 200, json: async () => ({ data }) });

  it.each([
    ["APPROVED", "APPROVED"],
    ["DECLINED", "DECLINED"],
    ["VOIDED", "VOIDED"],
    ["ERROR", "ERROR"],
    ["PENDING", "PENDING"],
    ["WEIRD", "ERROR"],
  ])("maps status %s", async (wompi, ours) => {
    const g = make({}, ok({ id: "t1", reference: "r", amount_in_cents: 5000, currency: "COP", status: wompi }));
    expect(await g.lookup("t1")).toEqual({
      id: "t1",
      reference: "r",
      amountCents: 5000n,
      currency: "COP",
      status: ours,
    });
  });

  it("a malformed amount never matches a real one", async () => {
    const g = make({}, ok({ id: "t1", reference: "r", amount_in_cents: "5000", currency: "COP", status: "APPROVED" }));
    expect((await g.lookup("t1"))?.amountCents).toBe(-1n);
  });

  it("returns null on 404 and sends bearer to sandbox url", async () => {
    let seen = "";
    let auth = "";
    const g = make({}, async (url, init) => {
      seen = url;
      auth = init.headers.Authorization ?? "";
      return { ok: false, status: 404, json: async () => ({}) };
    });
    expect(await g.lookup("a/b")).toBeNull();
    expect(seen).toBe("https://sandbox.wompi.co/v1/transactions/a%2Fb");
    expect(auth).toBe(`Bearer ${cfg.privateKey}`);
  });

  it("throws on a provider error so the webhook is retried", async () => {
    const g = make({}, async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(g.lookup("t1")).rejects.toThrow(/503/);
  });

  it("aborts after the timeout", async () => {
    const g = make(
      {},
      (_u, init) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    const orig = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => orig(fn, 0)) as unknown as typeof setTimeout;
    try {
      await expect(g.lookup("t1")).rejects.toThrow("aborted");
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});
