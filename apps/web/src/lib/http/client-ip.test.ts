import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

const headers = (init: Record<string, string>) => new Headers(init);
const env = (
  CLIENT_IP_SOURCE: "none" | "x-real-ip" | "cf-connecting-ip" | "x-forwarded-for",
  TRUSTED_PROXY_HOPS = 1,
) => ({ CLIENT_IP_SOURCE, TRUSTED_PROXY_HOPS });

describe("getClientIp", () => {
  it("trusts no header when the source is none", () => {
    expect(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" }), env("none")),
    ).toBeNull();
  });

  it("reads single-value edge headers and validates them", () => {
    expect(getClientIp(headers({ "x-real-ip": "203.0.113.7" }), env("x-real-ip"))).toBe("203.0.113.7");
    expect(getClientIp(headers({ "cf-connecting-ip": "2001:db8::1" }), env("cf-connecting-ip"))).toBe("2001:db8::1");
    expect(getClientIp(headers({ "x-real-ip": "not-an-ip" }), env("x-real-ip"))).toBeNull();
  });

  it("ignores spoofed left-most x-forwarded-for entries", () => {
    // Attacker sends "1.1.1.1"; the trusted proxy appends the real peer 203.0.113.7.
    const spoofed = headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    expect(getClientIp(spoofed, env("x-forwarded-for", 1))).toBe("203.0.113.7");
  });

  it("counts trusted hops from the right", () => {
    const chain = headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.2" });
    expect(getClientIp(chain, env("x-forwarded-for", 2))).toBe("203.0.113.7");
  });

  it("returns null when the chain is shorter than the trusted hops", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "203.0.113.7" }), env("x-forwarded-for", 2))).toBeNull();
  });
});
