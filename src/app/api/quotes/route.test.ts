import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The DB must never be reached in these cases; the mock records any call.
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { POST } from "./route";

const post = (body: string) => POST(new Request("http://localhost/api/quotes", { method: "POST", headers: { "content-type": "application/json" }, body }));
const enableAll = () => {
  vi.stubEnv("QUOTE_INTAKE_ENABLED", "true");
  vi.stubEnv("PRIVACY_POLICY_APPROVED", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test");
};

describe("POST /api/quotes", () => {
  beforeEach(() => vi.mocked(getDb).mockClear());
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
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects a body without data consent with 400", async () => {
    enableAll();
    const res = await post(JSON.stringify({ name: "Prueba Ficticia", email: "ficticio@example.test", phone: "3000000000", travelers: 2 }));
    expect(res.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});
