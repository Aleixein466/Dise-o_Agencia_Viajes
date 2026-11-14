import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProviderEvent } from "./sandbox-gateway";
import { WOMPI_SANDBOX_BASE_URL, WompiSandboxGateway, type WompiConfig, type WompiFetch } from "./wompi-gateway";

const cfg: WompiConfig = {
  publicKey: "pub_test_abc",
  privateKey: "prv_test_abc",
  eventsSecret: "test_events_abc",
  integritySecret: "test_integrity_abc",
  baseUrl: WOMPI_SANDBOX_BASE_URL,
  redirectUrl: "https://example.test/gracias",
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const make = (over: Partial<WompiConfig> = {}, f?: WompiFetch) => new WompiSandboxGateway({ ...cfg, ...over }, f);

describe("WompiSandboxGateway", () => {
  it("enabled only with all keys; refuses prod keys and non-sandbox url", () => {
    expect(make().enabled()).toBe(true);
    expect(make({ privateKey: undefined }).enabled()).toBe(false);
    expect(() => make({ publicKey: "pub_prod_x" })).toThrow();
    expect(() => make({ eventsSecret: "prod_events_x" })).toThrow();
    expect(() => make({ baseUrl: "https://production.wompi.co/v1" })).toThrow();
  });

  it("integrity signature follows documented order", () => {
    // Official docs vector (https://docs.wompi.co/docs/colombia/widget-checkout-web/); its secret is a prod one,
    // so only the algorithm is checked here, never through the gateway.
    expect(sha("sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6")).toBe(
      "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5",
    );
    const g = make();
    expect(g.integritySignature("r1", 2490000, "COP")).toBe(sha("r12490000COPtest_integrity_abc"));
    expect(g.integritySignature("r1", 2490000, "COP", "2023-06-09T20:28:50.000Z")).toBe(
      sha("r12490000COP2023-06-09T20:28:50.000Ztest_integrity_abc"),
    );
  });

  it("builds the web checkout url", () => {
    const u = new URL(make().checkoutUrl("r1", 1000, "COP"));
    expect(u.origin + u.pathname).toBe("https://checkout.wompi.co/p/");
    expect(u.searchParams.get("public-key")).toBe("pub_test_abc");
    expect(u.searchParams.get("amount-in-cents")).toBe("1000");
    expect(u.searchParams.get("signature:integrity")).toBe(sha("r11000COPtest_integrity_abc"));
    expect(u.searchParams.get("redirect-url")).toBe(cfg.redirectUrl);
    expect(u.searchParams.has("expiration-time")).toBe(false);
  });

  it("verifies event checksum and rejects tampering", () => {
    // The docs example checksum (https://docs.wompi.co/docs/colombia/eventos/) does not reproduce from its own
    // listed fields, so a self-computed vector is used instead.
    const event: ProviderEvent = {
      event: "transaction.updated",
      data: {
        transaction: { id: "1234-1", reference: "r", amount_in_cents: 4490000, currency: "COP", status: "APPROVED" },
      },
      signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
      timestamp: 1530291411,
    };
    event.signature.checksum = sha("1234-1APPROVED44900001530291411test_events_abc").toUpperCase();
    const g = make();
    expect(g.verify(event)).toBe(true);
    expect(g.verify({ ...event, data: { transaction: { ...event.data.transaction, status: "DECLINED" } } })).toBe(
      false,
    );
    expect(g.verify({ ...event, signature: { ...event.signature, checksum: "zz" } })).toBe(false);
    expect(g.verify({ ...event, signature: { ...event.signature, properties: ["transaction.id"] } })).toBe(false);
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
    expect(auth).toBe("Bearer prv_test_abc");
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
