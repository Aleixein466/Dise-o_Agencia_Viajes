import { hash } from "@node-rs/argon2";
import { describe, expect, it, vi } from "vitest";
import { ARGON_OPTIONS, type AuthService } from "./auth.service";
import { ProfileService } from "./profile.service";
import { parseEnv } from "../config/env";
import { PublicRateLimiter } from "../public/public-rate-limiter";

const PASSWORD = "Current-password-2026!";
const principal = {
  user: { id: "u1", email: "admin@ricaurte.test", name: "Admin" },
  roles: ["ADMIN"],
  permissions: [],
  session: { id: "s-current", mfaVerifiedAt: new Date() },
};
const auth = {
  requireStaff: vi.fn(async () => principal),
  requireStaffMutation: vi.fn(async () => principal),
} as unknown as AuthService;

async function fakeClient(overrides: Record<string, unknown> = {}) {
  const passwordHash = await hash(PASSWORD, ARGON_OPTIONS);
  return {
    user: {
      findUnique: vi.fn(async (args: { where: { id?: string; email?: string } }) =>
        args.where.id ? { id: "u1", email: "admin@ricaurte.test", name: "Admin", passwordHash } : null,
      ),
      findUniqueOrThrow: vi.fn(async () => ({ name: "Admin" })),
      update: vi.fn(async () => ({})),
    },
    session: { updateMany: vi.fn(async () => ({ count: 2 })) },
    oneTimeToken: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async (args: unknown) => {
        void args;
        return {};
      }),
      findFirst: vi.fn(),
    },
    mfaFactor: { findFirst: vi.fn(async () => ({ id: "f1" })) },
    mfaRecoveryCode: {
      updateMany: vi.fn(async () => ({ count: 3 })),
      createMany: vi.fn(async (args: unknown) => {
        void args;
        return {};
      }),
    },
    auditLog: {
      create: vi.fn(async (args: unknown) => {
        void args;
        return {};
      }),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    ...overrides,
  };
}

describe("ProfileService password change", () => {
  it("re-verifies the current password, applies the policy and signs out the other sessions only", async () => {
    const client = await fakeClient();
    const service = new ProfileService({ client: async () => client } as never, parseEnv(), auth);
    await expect(
      service.changePassword("t", "csrf", "http://localhost:3000", { currentPassword: PASSWORD, newPassword: "short" }),
    ).rejects.toMatchObject({ response: { code: "PASSWORD_TOO_SHORT" } });
    await expect(
      service.changePassword("t", "csrf", "http://localhost:3000", {
        currentPassword: PASSWORD,
        newPassword: "Another-strong-password-2026",
      }),
    ).resolves.toEqual({ sessionsRevoked: 2 });
    expect(client.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null, id: { not: "s-current" } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(client.auditLog.create.mock.calls.at(-1)![0]).toMatchObject({ data: { action: "auth.password_changed" } });
  });

  it("refuses a wrong current password, audits it and rate-limits attempts per account", async () => {
    const client = await fakeClient();
    const service = new ProfileService(
      { client: async () => client } as never,
      parseEnv(),
      auth,
      undefined,
      new PublicRateLimiter(),
    );
    const attempt = () =>
      service.changePassword("t", "csrf", "http://localhost:3000", {
        currentPassword: "wrong-password-value",
        newPassword: "Another-strong-password-2026",
      });
    await expect(attempt()).rejects.toMatchObject({ status: 400, response: { code: "INVALID_CURRENT_PASSWORD" } });
    expect(client.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.profile_password_check_failed" }) }),
    );
    for (let i = 1; i < 5; i += 1) await attempt().catch(() => undefined);
    await expect(attempt()).rejects.toMatchObject({ status: 429 });
    expect(client.user.update).not.toHaveBeenCalled();
  });
});

describe("ProfileService e-mail change", () => {
  it("needs a working mail adapter, mails a code to the new address only and confirms it once", async () => {
    const client = await fakeClient();
    const noMail = new ProfileService({ client: async () => client } as never, parseEnv(), auth);
    await expect(
      noMail.requestEmailChange("t", "csrf", "http://localhost:3000", {
        currentPassword: PASSWORD,
        newEmail: "nuevo@ricaurte.test",
      }),
    ).rejects.toMatchObject({ status: 503, response: { code: "MAIL_DISABLED" } });

    const sent: { to: string; text: string; kind: string }[] = [];
    const mail = {
      send: vi.fn(async (message: { to: string; text: string; kind: string }) => void sent.push(message)),
    };
    const service = new ProfileService(
      { client: async () => client } as never,
      parseEnv({ MAIL_ADAPTER: "file" }),
      auth,
      mail as never,
    );
    await service.requestEmailChange("t", "csrf", "http://localhost:3000", {
      currentPassword: PASSWORD,
      newEmail: "Nuevo@Ricaurte.test",
    });
    expect(sent.map((m) => m.kind)).toEqual(["staff_email_change_code", "staff_email_change_notice"]);
    const code = /\b(\d{6})\b/.exec(sent[0]!.text)![1]!;
    expect(sent[0]!.to).toBe("nuevo@ricaurte.test");
    expect(sent[1]!.text).not.toContain(code);
    const created = client.oneTimeToken.create.mock.calls[0]![0] as { data: { tokenHash: string; email: string } };
    expect(created.data.email).toBe("nuevo@ricaurte.test");
    expect(created.data.tokenHash).not.toContain(code);

    client.oneTimeToken.findFirst.mockResolvedValue({
      id: "ott",
      email: "nuevo@ricaurte.test",
      tokenHash: created.data.tokenHash,
    });
    await expect(service.confirmEmailChange("t", "csrf", "http://localhost:3000", "000000")).rejects.toMatchObject({
      response: { code: "INVALID_CODE" },
    });
    await expect(service.confirmEmailChange("t", "csrf", "http://localhost:3000", code)).resolves.toEqual({
      email: "nuevo@ricaurte.test",
    });
    expect(client.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { email: "nuevo@ricaurte.test" } });
  });
});

describe("ProfileService recovery codes and sessions", () => {
  it("returns ten new codes once, storing hashes only, and revokes the other sessions on request", async () => {
    const client = await fakeClient();
    const service = new ProfileService({ client: async () => client } as never, parseEnv(), auth);
    const { recoveryCodes } = await service.regenerateRecoveryCodes("t", "csrf", "http://localhost:3000", {
      currentPassword: PASSWORD,
    });
    expect(recoveryCodes).toHaveLength(10);
    const stored = client.mfaRecoveryCode.createMany.mock.calls[0]![0] as { data: { codeHash: string }[] };
    expect(stored.data.map((row) => row.codeHash)).not.toContain(recoveryCodes[0]);
    await expect(service.revokeOtherSessions("t", "csrf", "http://localhost:3000")).resolves.toEqual({ revoked: 2 });
  });
});
