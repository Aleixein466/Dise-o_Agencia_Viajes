import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getSessionResult: vi.fn() }));

import { revalidateTag } from "next/cache";
import { getSessionResult } from "@/lib/auth/server";
import { POST } from "./route";

const session = (overrides: Partial<{ mfaCompleted: boolean; permissions: string[] }> = {}) => ({
  status: "ok" as const,
  session: {
    user: { id: "u", email: "a@b.co", displayName: "A" },
    roles: ["ADMIN"],
    permissions: ["content:write"],
    mfaRequired: true,
    mfaCompleted: true,
    csrfToken: "token-123",
    ...overrides,
  },
});
const call = (headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/revalidate-content", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-csrf-token": "token-123", ...headers },
    }),
  );

describe("POST /api/revalidate-content", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockReset();
    vi.mocked(getSessionResult).mockReset();
  });

  it("marks the public content stale for an MFA staff session with the CSRF token", async () => {
    vi.mocked(getSessionResult).mockResolvedValue(session());
    expect((await call()).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("public-content", { expire: 0 });
  });

  it.each([
    ["foreign origin", { origin: "https://evil.example" }, session(), 403],
    ["missing origin", { origin: "" }, session(), 403],
    ["opaque origin", { origin: "null" }, session(), 403],
    ["malformed origin", { origin: "http://" }, session(), 403],
    ["wrong csrf", { "x-csrf-token": "nope" }, session(), 403],
    ["no mfa", {}, session({ mfaCompleted: false }), 403],
    ["no permission", {}, session({ permissions: ["quotes:read"] }), 403],
    ["anonymous", {}, { status: "anonymous" as const }, 401],
    ["api down", {}, { status: "error" as const }, 503],
  ])("rejects %s", async (_name, headers, result, status) => {
    vi.mocked(getSessionResult).mockResolvedValue(result);
    expect((await call(headers)).status).toBe(status);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
