import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

describe("fixed-window rate limiter", () => {
  beforeEach(resetRateLimit);
  it("allows five requests and rejects the sixth with remaining window seconds", () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("client", 1_000)).toEqual({ allowed: true });
    expect(checkRateLimit("client", 1_000)).toEqual({ allowed: false, retryAfter: 600 });
  });
  it("starts a new window after ten minutes", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("client", 1_000);
    expect(checkRateLimit("client", 601_000)).toEqual({ allowed: true });
  });
});
