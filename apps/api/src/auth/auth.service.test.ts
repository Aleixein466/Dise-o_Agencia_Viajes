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
