import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { resetRateLimit } from "@/lib/http/rate-limit";
import { resetEnvCache } from "@/lib/env";
import { POST } from "./route";

const bodyData = {
  name: "Prueba Ficticia",
  email: "ficticio@example.test",
  phone: "3000000000",
  travelers: 2,
  dataConsent: "true",
};
const post = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  POST(new Request("http://localhost/api/quotes", { method: "POST", headers, body }));
const enableAll = () => {
  vi.stubEnv("QUOTE_INTAKE_ENABLED", "true");
  vi.stubEnv("PRIVACY_POLICY_APPROVED", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test");
};

describe("POST /api/quotes", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
    resetRateLimit();
    resetEnvCache();
  });

  it("fails closed with 503 when the environment is invalid", async () => {
    enableAll();
    vi.stubEnv("DATABASE_URL", "mysql://not-postgres");
    const res = await post("{}");
    expect(res.status).toBe(503);
    expect(getDb).not.toHaveBeenCalled();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["QUOTE_INTAKE_ENABLED", "false"],
    ["PRIVACY_POLICY_APPROVED", "false"],
    ["DATABASE_URL", ""],
  ])("returns 503 and never touches the DB when %s is not enabled", async (key, value) => {
    enableAll();
    vi.stubEnv(key, value);
    const res = await post("{}");
    expect(res.status).toBe(503);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    enableAll();
    expect((await post("{not json")).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("rejects a body without data consent with 400", async () => {
    enableAll();
    expect((await post(JSON.stringify({ ...bodyData, dataConsent: undefined }))).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("keeps the 503 gate ahead of content-type and origin checks", async () => {
    expect((await post("{}", { "content-type": "text/plain", origin: "https://evil.example" })).status).toBe(503);
  });
  it("accepts a same-origin request past the origin check", async () => {
    enableAll();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(
      (await post("{not json", { "content-type": "application/json", origin: "http://localhost:3000" })).status,
    ).toBe(400);
  });
  it("rejects non-JSON content with 415", async () => {
    enableAll();
    expect((await post("{}", { "content-type": "text/plain" })).status).toBe(415);
  });
  it("rejects a bad origin with 403", async () => {
    enableAll();
    expect((await post("{}", { "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
  });
  it.each([undefined, "1"])(
    "rejects streamed bodies above the cap when content-length is %s",
    async (contentLength) => {
      enableAll();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(16_001).fill(32));
          controller.close();
        },
      });
      const headers = new Headers({ "content-type": "application/json" });
      if (contentLength) headers.set("content-length", contentLength);
      const req = new Request("http://localhost/api/quotes", {
        method: "POST",
        headers,
        body: stream,
        duplex: "half",
      } as RequestInit);
      expect((await POST(req)).status).toBe(413);
    },
  );
  it("limits the sixth request and includes Retry-After", async () => {
    enableAll();
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        post("{}", { "content-type": "application/json", "x-forwarded-for": "192.0.2.10, 198.51.100.2" }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 429]);
    expect(responses[5].headers.get("retry-after")).toBeTruthy();
  });
  it("cannot bypass the limit by rotating a spoofed x-forwarded-for", async () => {
    enableAll();
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (await post("{}", { "content-type": "application/json", "x-forwarded-for": `198.51.100.${i}` })).status,
      );
    expect(statuses.at(-1)).toBe(429);
  });
  it("buckets by the proxy-appended entry, not the client-supplied one", async () => {
    enableAll();
    vi.stubEnv("CLIENT_IP_SOURCE", "x-forwarded-for");
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (await post("{}", { "content-type": "application/json", "x-forwarded-for": `1.1.1.${i}, 203.0.113.7` })).status,
      );
    expect(statuses.at(-1)).toBe(429);
    expect(
      (await post("{}", { "content-type": "application/json", "x-forwarded-for": "1.1.1.1, 203.0.113.8" })).status,
    ).toBe(400);
  });
  it("fails closed with 503 when the configured limiter store is unavailable", async () => {
    enableAll();
    vi.stubEnv("RATE_LIMIT_STORE", "postgres");
    expect((await post("{}")).status).toBe(503);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("acknowledges honeypot submissions without touching the DB", async () => {
    enableAll();
    expect((await post(JSON.stringify({ ...bodyData, website: "filled" }))).status).toBe(202);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("stores a valid request and returns its reference", async () => {
    enableAll();
    const create = vi.fn().mockResolvedValue({ reference: "COT-TEST" });
    vi.mocked(getDb).mockReturnValue({ quote: { create } } as never);
    const response = await post(JSON.stringify(bodyData));
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("COT-TEST") });
  });
});
