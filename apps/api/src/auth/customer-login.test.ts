import { BadRequestException, HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { MailAdapter } from "../notifications/mail";
import { PublicRateLimiter } from "../public/public-rate-limiter";
import { AuthService, CUSTOMER_CODE_RESPONSE_FLOOR_MS } from "./auth.service";

const env = parseEnv({ CUSTOMER_CODE_SECRET: "test-secret-test-secret-test-secret-00" });

describe("customer login codes", () => {
  it("answers unknown emails without creating a token or sending mail", async () => {
    const client = { customer: { findFirst: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn() };
    const mail = { send: vi.fn() };
    const service = new AuthService(
      { client: async () => client } as never,
      env,
      mail as never,
      new PublicRateLimiter(),
    );
    await expect(service.requestCustomerCode("nadie@example.test", "1.1.1.1")).resolves.toBeUndefined();
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("sends an 8-digit code by mail and stores only its keyed hash", async () => {
    const created: Array<{ data: { tokenHash: string } }> = [];
    const client = {
      customer: { findFirst: vi.fn().mockResolvedValue({ id: "c1" }) },
      oneTimeToken: { updateMany: vi.fn(), create: vi.fn((arg) => (created.push(arg), arg)) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const mail = { send: vi.fn() };
    const service = new AuthService(
      { client: async () => client } as never,
      env,
      mail as never,
      new PublicRateLimiter(),
    );
    await service.requestCustomerCode("Cliente@Example.test", "1.1.1.2");
    const code = /(\d{8})/.exec(mail.send.mock.calls[0][0].text)?.[1];
    expect(code).toMatch(/^\d{8}$/);
    expect(created[0].data.tokenHash).not.toContain(code);
    expect(created[0].data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects staff accounts on the customer code path", async () => {
    const client = {
      oneTimeToken: {
        findFirst: vi.fn().mockResolvedValue({ id: "t1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", roles: [{ roleCode: "ADMIN" }] }) },
      session: { create: vi.fn() },
    };
    const service = new AuthService({ client: async () => client } as never, env, undefined, new PublicRateLimiter());
    await expect(service.verifyCustomerCode("admin@example.test", "12345678", "1.1.1.3")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.session.create).not.toHaveBeenCalled();
  });

  it("locks verification after 5 attempts per email", async () => {
    const client = { oneTimeToken: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AuthService({ client: async () => client } as never, env, undefined, new PublicRateLimiter());
    for (let i = 0; i < 5; i++)
      await expect(service.verifyCustomerCode("x@example.test", "00000000", "1.1.1.4")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    const sixth = service.verifyCustomerCode("x@example.test", "00000000", "1.1.1.4");
    await expect(sixth).rejects.toBeInstanceOf(HttpException);
    await expect(sixth).rejects.toMatchObject({ status: 429 });
  });
});

describe("MailAdapter", () => {
  it("refuses the file sink in production", () => {
    expect(() => new MailAdapter({ ...env, NODE_ENV: "production", MAIL_ADAPTER: "file" } as never)).toThrow();
  });
});

describe("customer code secret", () => {
  it("refuses the development default in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/CUSTOMER_CODE_SECRET/);
    expect(parseEnv({ NODE_ENV: "production", CUSTOMER_CODE_SECRET: "x".repeat(32) }).NODE_ENV).toBe("production");
  });
});

describe("Codex audit fixes (OTP)", () => {
  it("unknown and known emails share the same minimum response time", async () => {
    const client = { customer: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AuthService({ client: async () => client } as never, env, undefined, new PublicRateLimiter());
    const started = Date.now();
    await service.requestCustomerCode("nadie2@example.test", "2.2.2.2");
    expect(Date.now() - started).toBeGreaterThanOrEqual(CUSTOMER_CODE_RESPONSE_FLOOR_MS - 20);
  });

  it("re-checks expiry when consuming the code", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const client = { oneTimeToken: { findFirst: vi.fn().mockResolvedValue({ id: "t1" }), updateMany } };
    const service = new AuthService({ client: async () => client } as never, env, undefined, new PublicRateLimiter());
    await expect(service.verifyCustomerCode("late@example.test", "12345678", "2.2.2.3")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      id: "t1",
      usedAt: null,
      expiresAt: { gt: expect.any(Date) },
    });
  });
});
