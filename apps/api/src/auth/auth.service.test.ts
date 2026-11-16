import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service";
import { parseEnv } from "../config/env";
import { PublicRateLimiter } from "../public/public-rate-limiter";

describe("AuthService CSRF gate", () => {
  it("rejects a mutation before touching persistence when origin or CSRF token is invalid", async () => {
    const service = new AuthService(
      {
        client: async () => {
          throw new Error("must not query");
        },
      } as never,
      parseEnv({ APP_ORIGIN: "https://app.example.test" }),
    );
    await expect(service.assertMutation("session-token", "wrong", "https://attacker.example")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("derives a session-bound CSRF value without exposing the session token", () => {
    const service = new AuthService({} as never, parseEnv());
    expect(service.csrfToken("opaque-session")).not.toContain("opaque-session");
    expect(service.csrfToken("opaque-session")).toBe(service.csrfToken("opaque-session"));
  });
});

describe("AuthService TOTP verification", () => {
  function totpService(updateMany: (args: unknown) => Promise<{ count: number }>, limiter?: PublicRateLimiter) {
    const client = {
      mfaFactor: {
        findFirst: async () => ({
          id: "factor-1",
          secretEncrypted: "encrypted",
          confirmedAt: null,
          lastUsedStep: null,
        }),
        updateMany,
      },
      session: { update: async () => ({}) },
      auditLog: { create: async () => ({}) },
    };
    const service = new AuthService({ client: async () => client } as never, parseEnv(), undefined, limiter);
    const internals = service as unknown as {
      assertMutation: () => Promise<{ user: { id: string; email: string }; session: { id: string } }>;
      decrypt: () => string;
      totp: () => { validate: () => number | null };
    };
    internals.assertMutation = async () => ({
      user: { id: "user-1", email: "staff@example.test" },
      session: { id: "session-1" },
    });
    internals.decrypt = () => "secret";
    internals.totp = () => ({ validate: () => 0 });
    return service;
  }

  it("accepts OTPAuth delta 0 and records the accepted time step on the factor", async () => {
    const calls: unknown[] = [];
    const service = totpService(async (args) => {
      calls.push(args);
      return { count: 1 };
    });
    await expect(service.verifyTotp("token", "123456")).resolves.toBeUndefined();
    const step = BigInt(Math.floor(Date.now() / 30_000));
    expect(calls[0]).toMatchObject({
      where: { id: "factor-1", OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    });
  });

  it("refuses a code whose time step was already accepted (replay inside the window)", async () => {
    const service = totpService(async () => ({ count: 0 }));
    await expect(service.verifyTotp("token", "123456")).rejects.toMatchObject({ status: 401 });
  });

  it("rate-limits TOTP attempts per account", async () => {
    const service = totpService(async () => ({ count: 1 }), new PublicRateLimiter());
    for (let i = 0; i < 10; i += 1) await service.verifyTotp("token", "123456");
    await expect(service.verifyTotp("token", "123456")).rejects.toMatchObject({ status: 429 });
  });
});
