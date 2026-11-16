import { describe, expect, it, vi } from "vitest";
import { createAttemptKeys, submitQuoteRequest, type SubmitInput } from "./api";

const input = (idempotencyKey: string): SubmitInput => ({
  selection: { packageId: "pkg", adults: 2, childAges: [4], optionalTourIds: [], addOnIds: [] },
  contact: { name: " Ana Pérez ", email: "ana@example.com", phone: "3001234567" },
  dataConsent: true,
  marketingConsent: false,
  website: "",
  idempotencyKey,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sentKey = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  (JSON.parse(fetchMock.mock.calls[call][1].body as string) as { idempotencyKey: string }).idempotencyKey;

describe("submitQuoteRequest + attempt keys", () => {
  it("reuses the same idempotencyKey when retrying after a network error or 503/429", async () => {
    let n = 0;
    const keys = createAttemptKeys(() => `key-${++n}`);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json(429, { message: "x" }))
      .mockResolvedValueOnce(json(503, { message: "x" }))
      .mockResolvedValueOnce(json(201, { reference: "REF-1", trackingCode: "ABCD-EFGH", status: "NEW" }));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const outcome = await submitQuoteRequest(input(keys.get()), fetchMock as unknown as typeof fetch);
      keys.settle(outcome);
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect([0, 1, 2, 3].map((call) => sentKey(fetchMock, call))).toEqual(["key-1", "key-1", "key-1", "key-1"]);
    expect(n).toBe(1);
    expect(keys.peek()).toBeNull();
  });

  it("issues a new key after a rejected payload (400)", async () => {
    let n = 0;
    const keys = createAttemptKeys(() => `key-${++n}`);
    const fetchMock = vi.fn().mockResolvedValue(json(400, { message: "bad" }));
    const first = await submitQuoteRequest(input(keys.get()), fetchMock as unknown as typeof fetch);
    expect(first).toMatchObject({ ok: false, code: "invalid" });
    keys.settle(first);
    expect(keys.get()).toBe("key-2");
  });

  it("maps statuses to Spanish messages and trims contact data", async () => {
    const closed = await submitQuoteRequest(
      input("k"),
      vi.fn().mockResolvedValue(json(503, { message: "closed" })) as unknown as typeof fetch,
    );
    expect(closed).toMatchObject({ ok: false, code: "closed" });
    expect(closed.ok ? "" : closed.message).toContain("aún no están habilitadas");

    const fetchMock = vi.fn().mockResolvedValue(json(200, { reference: "REF-1", trackingCode: null, status: "NEW" }));
    const replay = await submitQuoteRequest(input("k"), fetchMock as unknown as typeof fetch);
    expect(replay).toMatchObject({ ok: true, data: { reference: "REF-1", trackingCode: null, replay: true } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { contact: { name: string } };
    expect(body.contact.name).toBe("Ana Pérez");
  });
});
