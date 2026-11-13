import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service";
import { parseEnv } from "../config/env";

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
  it("accepts OTPAuth delta 0, which represents a valid code in the current time step", async () => {
    const client = {
      mfaFactor: {
        findFirst: async () => ({ id: "factor-1", secretEncrypted: "encrypted" }),
        update: async () => ({}),
      },
      session: { update: async () => ({}) },
      auditLog: { create: async () => ({}) },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const service = new AuthService({ client: async () => client } as never, parseEnv());
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

    await expect(service.verifyTotp("token", "123456")).resolves.toBeUndefined();
  });
});
