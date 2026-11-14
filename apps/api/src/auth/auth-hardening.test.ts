import { hash } from "@node-rs/argon2";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { parseEnv } from "../config/env";
import { PublicRateLimiter } from "../public/public-rate-limiter";

const ARGON = { algorithm: 2 as never, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

describe("staff login hardening (Codex audit)", () => {
  it("increments failed logins atomically and locks at the threshold", async () => {
    const passwordHash = await hash("correct-horse-battery", ARGON);
    const update = vi.fn(async (args: { data: Record<string, unknown> }) =>
      "failedLoginCount" in args.data ? { failedLoginCount: 5 } : {},
    );
    const client = {
      user: {
        findUnique: vi.fn(async () => ({
          id: "u1",
          status: "ACTIVE",
          passwordHash,
          lockedUntil: null,
          failedLoginCount: 4,
          roles: [],
        })),
        update,
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const service = new AuthService({ client: async () => client } as never, parseEnv());
    await expect(service.login("a@x.test", "wrong", "1.1.1.1")).rejects.toMatchObject({ status: 401 });
    expect(update.mock.calls[0]![0]).toMatchObject({ data: { failedLoginCount: { increment: 1 } } });
    expect(update.mock.calls[1]![0]).toMatchObject({ data: { lockedUntil: expect.any(Date) } });
  });

  it("spends an Argon2 verification on unknown accounts and rate-limits by IP", async () => {
    const client = { user: { findUnique: vi.fn(async () => null) }, auditLog: { create: vi.fn(async () => ({})) } };
    const service = new AuthService(
      { client: async () => client } as never,
      parseEnv(),
      undefined,
      new PublicRateLimiter(),
    );
    const started = Date.now();
    await expect(service.login("nobody@x.test", "whatever", "9.9.9.9")).rejects.toMatchObject({ status: 401 });
    expect(Date.now() - started).toBeGreaterThan(5);
    for (let i = 1; i < 20; i += 1) await service.login("nobody@x.test", "x", "9.9.9.9").catch(() => undefined);
    await expect(service.login("nobody@x.test", "x", "9.9.9.9")).rejects.toMatchObject({ status: 429 });
  });
});

describe("password reset (Codex audit)", () => {
  it("invalidates earlier tokens and mails a one-time link without logging it", async () => {
    const updateMany = vi.fn(() => "updateMany");
    const create = vi.fn(() => "create");
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: "u1", status: "ACTIVE", deletedAt: null })) },
      oneTimeToken: { updateMany, create },
      auditLog: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async () => []),
    };
    const mail = { send: vi.fn<(message: unknown) => Promise<void>>(async () => undefined) };
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new AuthService(
      { client: async () => client } as never,
      parseEnv(),
      mail as never,
      new PublicRateLimiter(),
    );
    await service.forgotPassword("Staff@X.test", "1.1.1.1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", purpose: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    const sent = (mail.send.mock.calls[0] as unknown[])[0] as { to: string; text: string; kind: string };
    expect(sent).toMatchObject({ to: "staff@x.test", kind: "password_reset" });
    expect(sent.text).toMatch(/\/restablecer\?token=[A-Za-z0-9_-]{40,}/);
    expect(log).not.toHaveBeenCalled();
  });

  it("answers unknown emails in the same minimum time and throttles per email", async () => {
    const client = { user: { findUnique: vi.fn(async () => null) } };
    const mail = { send: vi.fn() };
    const service = new AuthService(
      { client: async () => client } as never,
      parseEnv(),
      mail as never,
      new PublicRateLimiter(),
    );
    const started = Date.now();
    await service.forgotPassword("ghost@x.test", "2.2.2.2");
    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
    expect(mail.send).not.toHaveBeenCalled();
    await service.forgotPassword("ghost@x.test", "2.2.2.3");
    await service.forgotPassword("ghost@x.test", "2.2.2.4");
    await expect(service.forgotPassword("ghost@x.test", "2.2.2.5")).rejects.toMatchObject({ status: 429 });
  });
});
