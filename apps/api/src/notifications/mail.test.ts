import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { MailAdapter } from "./mail";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

const base = { CUSTOMER_CODE_SECRET: "test-secret-test-secret-test-secret-00" };
const prodSecret = { CUSTOMER_CODE_SECRET: "prod-secret-prod-secret-prod-secret-1" };
const envWith = (extra: Record<string, string>) => parseEnv({ ...base, ...extra });

afterEach(() => {
  vi.restoreAllMocks();
  sendMail.mockReset();
});

describe("MailAdapter", () => {
  it("does nothing when disabled", async () => {
    const adapter = new MailAdapter(envWith({}));
    expect(adapter.enabled).toBe(false);
    await adapter.send({ to: "a@example.test", subject: "s", text: "t", kind: "x" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses the file adapter in production", () => {
    const env = envWith({ NODE_ENV: "production", MAIL_ADAPTER: "file", ...prodSecret });
    expect(() => new MailAdapter(env)).toThrow(/not allowed in production/);
  });

  it("refuses smtp to a non-loopback host unless real delivery is approved", () => {
    const remote = envWith({ MAIL_ADAPTER: "smtp", SMTP_URL: "smtps://user:pw@smtp.example.test:465" });
    expect(() => new MailAdapter(remote)).toThrow(/MAIL_REAL_DELIVERY_APPROVED/);
    const approved = envWith({
      MAIL_ADAPTER: "smtp",
      SMTP_URL: "smtps://user:pw@smtp.example.test:465",
      MAIL_REAL_DELIVERY_APPROVED: "true",
    });
    expect(() => new MailAdapter(approved)).not.toThrow();
  });

  it("allows loopback smtp and refuses smtp in production unless approved", () => {
    expect(() => new MailAdapter(envWith({ MAIL_ADAPTER: "smtp", SMTP_URL: "smtp://127.0.0.1:1025" }))).not.toThrow();
    expect(() => new MailAdapter(envWith({ MAIL_ADAPTER: "smtp", SMTP_URL: "smtp://localhost:1025" }))).not.toThrow();
    const prod = envWith({
      NODE_ENV: "production",
      MAIL_ADAPTER: "smtp",
      SMTP_URL: "smtp://127.0.0.1:1025",
      ...prodSecret,
    });
    expect(() => new MailAdapter(prod)).toThrow();
  });

  it("requires SMTP_URL for the smtp adapter", () => {
    expect(() => envWith({ MAIL_ADAPTER: "smtp" })).toThrow(/SMTP_URL/);
  });

  it("never logs bodies, codes, subjects or the plain recipient", async () => {
    const calls: unknown[] = [];
    for (const level of ["log", "warn", "error", "debug", "verbose", "fatal"] as const)
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void calls.push(args));
    sendMail.mockResolvedValue({});
    const smtp = new MailAdapter(envWith({ MAIL_ADAPTER: "smtp", SMTP_URL: "smtp://127.0.0.1:1025" }));
    const dir = await mkdtemp(join(tmpdir(), "mail-sink-"));
    try {
      const file = new MailAdapter(envWith({ MAIL_ADAPTER: "file", MAIL_SINK_DIR: dir }));
      const message = {
        to: "cliente@example.test",
        subject: "Tu codigo",
        text: "Tu codigo es 12345678",
        kind: "customer_login_code",
        createdAt: new Date(),
      };
      await smtp.send(message);
      await file.send(message);
      expect(sendMail).toHaveBeenCalledOnce();
      expect(await readdir(dir)).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    expect(calls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("12345678");
    expect(logged).not.toContain("Tu codigo");
    expect(logged).not.toContain("cliente@example.test");
    expect(logged).toContain("customer_login_code");
  });
});
