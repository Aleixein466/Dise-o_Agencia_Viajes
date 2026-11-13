import { describe, expect, it, vi } from "vitest";
import { getServerEnv, isQuoteIntakeEnabled, resetEnvCache } from "@/lib/env";

describe("server environment", () => {
  it("provides defaults", () => {
    expect(getServerEnv({})).toEqual({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      QUOTE_INTAKE_ENABLED: "false",
      PRIVACY_POLICY_APPROVED: "false",
      NODE_ENV: "development",
      SITE_INDEXING: "false",
      CLIENT_IP_SOURCE: "none",
      TRUSTED_PROXY_HOPS: 1,
      RATE_LIMIT_STORE: "memory",
    });
  });

  it("refuses production intake without a trusted IP source and shared limiter", () => {
    const prod = {
      NODE_ENV: "production",
      QUOTE_INTAKE_ENABLED: "true",
      PRIVACY_POLICY_APPROVED: "true",
      DATABASE_URL: "postgresql://u:secret-value@db:5432/app",
    };
    expect(() => getServerEnv(prod)).toThrow(/QUOTE_INTAKE_ENABLED/);
    expect(() => getServerEnv({ ...prod, CLIENT_IP_SOURCE: "x-real-ip" })).toThrow(/QUOTE_INTAKE_ENABLED/);
    expect(
      getServerEnv({ ...prod, CLIENT_IP_SOURCE: "x-real-ip", RATE_LIMIT_STORE: "postgres" }).QUOTE_INTAKE_ENABLED,
    ).toBe("true");
  });

  it("accepts postgres URLs", () => {
    expect(getServerEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }).DATABASE_URL).toBe(
      "postgresql://user:pass@localhost:5432/app",
    );
  });

  it("accepts an http(s) API_INTERNAL_URL and rejects other schemes", () => {
    expect(getServerEnv({ API_INTERNAL_URL: "http://127.0.0.1:4000" }).API_INTERNAL_URL).toBe("http://127.0.0.1:4000");
    expect(() => getServerEnv({ API_INTERNAL_URL: "ftp://api.internal" })).toThrow(/API_INTERNAL_URL/);
  });

  it("rejects other URL schemes", () => {
    expect(() => getServerEnv({ DATABASE_URL: "https://localhost/database" })).toThrow(/DATABASE_URL/);
  });

  it("does not include secret values in validation errors", () => {
    const secret = "fake-password-739";
    let message = "";
    try {
      getServerEnv({ DATABASE_URL: `mysql://user:${secret}@localhost:3306/app` });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(secret);
  });

  it.each([
    ["both flags and database", "true", "true", "postgres://user:pass@localhost:5432/app", true],
    ["intake flag off", "false", "true", "postgres://user:pass@localhost:5432/app", false],
    ["privacy approval off", "true", "false", "postgres://user:pass@localhost:5432/app", false],
    ["database missing", "true", "true", undefined, false],
    ["both flags off", "false", "false", undefined, false],
  ])("checks intake gate: %s", (_label, intake, privacy, database, expected) => {
    const env = getServerEnv({
      QUOTE_INTAKE_ENABLED: intake,
      PRIVACY_POLICY_APPROVED: privacy,
      ...(database === undefined ? {} : { DATABASE_URL: database }),
    });
    expect(isQuoteIntakeEnabled(env)).toBe(expected);
  });

  it("rejects production database placeholders", () => {
    for (const placeholder of ["REPLACE_WITH", "change-me"]) {
      expect(() =>
        getServerEnv({
          NODE_ENV: "production",
          DATABASE_URL: `postgres://user:${placeholder}@localhost:5432/app`,
        }),
      ).toThrow(/DATABASE_URL/);
    }
  });

  it("can reset the process environment cache", () => {
    resetEnvCache();
    vi.stubEnv("QUOTE_INTAKE_ENABLED", "false");
    const first = getServerEnv();
    expect(getServerEnv()).toBe(first);
    vi.stubEnv("QUOTE_INTAKE_ENABLED", "true");
    resetEnvCache();
    expect(getServerEnv().QUOTE_INTAKE_ENABLED).toBe("true");
    vi.unstubAllEnvs();
    resetEnvCache();
  });
});
