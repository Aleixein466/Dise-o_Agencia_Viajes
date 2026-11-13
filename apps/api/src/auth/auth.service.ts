import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import {
  checkPasswordPolicy,
  isLocked,
  lockoutUntil,
  oneTimeTokenExpiry,
  permissionsForRoles,
  requiresMfa,
  sessionAbsoluteExpiry,
  sessionKindFor,
  sessionState,
  type RoleCode,
} from "@ricaurte/domain";
import { DbService } from "../db/db.service";
import { ENV, type ApiEnv } from "../config/env";
import { Inject } from "@nestjs/common";

const COOKIE_NAME = "__Host-rt_session";
const ARGON_OPTIONS = { algorithm: 2 as Algorithm, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const genericCredentials = () => new UnauthorizedException();

type Principal = {
  user: { id: string; email: string; name: string };
  roles: RoleCode[];
  permissions: string[];
  session: { id: string; mfaVerifiedAt: Date | null };
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  cookieName(): string {
    return COOKIE_NAME;
  }
  hashToken(token: string): string {
    return sha256(token);
  }
  csrfToken(token: string): string {
    return sha256(`csrf:${token}`);
  }

  private async audit(userId: string | null, action: string, ip: string | undefined): Promise<void> {
    const client = await this.db.client();
    await client.auditLog.create({
      data: {
        actorId: userId ?? undefined,
        actorRole: undefined,
        action,
        entity: "auth",
        entityId: userId ?? "anonymous",
        ipHash: ip ? sha256(ip) : undefined,
      },
    });
  }

  private async principal(token: string, touch = true): Promise<Principal> {
    const client = await this.db.client();
    const row = await client.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        user: {
          include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        },
      },
    });
    if (!row || row.user.status !== "ACTIVE" || row.user.deletedAt) throw genericCredentials();
    const roles = row.user.roles.map((item) => item.roleCode as RoleCode);
    const state = sessionState(row, sessionKindFor(roles), new Date());
    if (state !== "active") {
      if (state !== "revoked") await client.session.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      throw genericCredentials();
    }
    if (touch) await client.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
    const permissions = [...permissionsForRoles(roles)];
    return { user: row.user, roles, permissions, session: { id: row.id, mfaVerifiedAt: row.mfaVerifiedAt } };
  }

  async login(emailInput: string, password: string, ip?: string): Promise<{ token: string; mfaRequired: boolean }> {
    const client = await this.db.client();
    const email = emailInput.trim().toLowerCase();
    const user = await client.user.findUnique({ where: { email }, include: { roles: true } });
    const now = new Date();
    if (!user || user.status !== "ACTIVE" || !user.passwordHash || isLocked(user.lockedUntil, now)) {
      await this.audit(user?.id ?? null, "auth.login_failed", ip);
      throw genericCredentials();
    }
    const correct = await verify(user.passwordHash, password, ARGON_OPTIONS);
    if (!correct) {
      const failed = user.failedLoginCount + 1;
      await client.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failed, lockedUntil: lockoutUntil(failed, now) },
      });
      await this.audit(user.id, "auth.login_failed", ip);
      throw genericCredentials();
    }
    const roles = user.roles.map((entry) => entry.roleCode as RoleCode);
    const token = opaque();
    await client.$transaction([
      client.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      client.session.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          ipHash: ip ? sha256(ip) : undefined,
          expiresAt: sessionAbsoluteExpiry(now, sessionKindFor(roles)),
        },
      }),
      client.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      }),
    ]);
    await this.audit(user.id, "auth.login_succeeded", ip);
    return { token, mfaRequired: requiresMfa(roles) };
  }

  async session(token: string): Promise<{
    user: { id: string; email: string; displayName: string };
    roles: string[];
    permissions: string[];
    mfaRequired: boolean;
    mfaCompleted: boolean;
    csrfToken: string;
  }> {
    const principal = await this.principal(token);
    const mfaRequired = requiresMfa(principal.roles);
    return {
      user: { id: principal.user.id, email: principal.user.email, displayName: principal.user.name },
      roles: principal.roles,
      permissions: principal.permissions,
      mfaRequired,
      mfaCompleted: !mfaRequired || principal.session.mfaVerifiedAt !== null,
      csrfToken: this.csrfToken(token),
    };
  }

  async assertMutation(token: string, csrf: string | undefined, origin: string | undefined): Promise<Principal> {
    if (origin !== this.env.APP_ORIGIN || !csrf || csrf !== this.csrfToken(token)) throw new ForbiddenException();
    return this.principal(token);
  }

  async logout(token: string, csrf: string | undefined, origin: string | undefined, all = false): Promise<void> {
    const principal = await this.assertMutation(token, csrf, origin);
    const client = await this.db.client();
    await client.session.updateMany({
      where: all ? { userId: principal.user.id, revokedAt: null } : { id: principal.session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(principal.user.id, all ? "auth.logout_all" : "auth.logout", undefined);
  }

  async forgotPassword(emailInput: string, ip?: string): Promise<void> {
    const client = await this.db.client();
    const user = await client.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
    if (user?.status === "ACTIVE") {
      const token = opaque();
      await client.oneTimeToken.create({
        data: {
          tokenHash: this.hashToken(token),
          purpose: "PASSWORD_RESET",
          userId: user.id,
          expiresAt: oneTimeTokenExpiry("PASSWORD_RESET", new Date()),
          ipHash: ip ? sha256(ip) : undefined,
        },
      });
      // Delivery is deliberately delegated to the future transactional-mail adapter. Never return the token to the caller.
      await this.audit(user.id, "auth.password_reset_requested", ip);
    }
  }

  async resetPassword(token: string, password: string, ip?: string): Promise<void> {
    const client = await this.db.client();
    const row = await client.oneTimeToken.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        purpose: "PASSWORD_RESET",
        usedAt: null,
        expiresAt: { gt: new Date() },
        userId: { not: null },
      },
      include: { user: true },
    });
    if (!row?.user) throw genericCredentials();
    const policy = checkPasswordPolicy(password, { email: row.user.email, name: row.user.name });
    if (!policy.ok) throw new ForbiddenException();
    const passwordHash = await hash(password.normalize("NFKC"), ARGON_OPTIONS);
    const consumed = await client.oneTimeToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw genericCredentials();
    await client.$transaction([
      client.user.update({
        where: { id: row.user.id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      client.session.updateMany({ where: { userId: row.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit(row.user.id, "auth.password_reset_completed", ip);
  }

  private key(): Buffer {
    const key = this.env.MFA_ENCRYPTION_KEY ? Buffer.from(this.env.MFA_ENCRYPTION_KEY, "base64") : Buffer.alloc(0);
    if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must decode to 32 bytes");
    return key;
  }
  private encrypt(value: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), nonce);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64url");
  }
  private decrypt(value: string): string {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }
  private totp(secret: string, email: string): TOTP {
    return new TOTP({
      issuer: "Ricaurte Tours",
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
  }

  async beginMfa(
    token: string,
    csrf?: string,
    origin?: string,
  ): Promise<{ otpauthUrl: string; recoveryCodes: string[] }> {
    const principal = await this.assertMutation(token, csrf, origin);
    if (!requiresMfa(principal.roles)) throw new ForbiddenException();
    const client = await this.db.client();
    const confirmedFactor = await client.mfaFactor.findFirst({
      where: { userId: principal.user.id, revokedAt: null, confirmedAt: { not: null } },
    });
    // An initial enrollment is allowed after password verification; replacing an existing factor requires MFA.
    if (confirmedFactor && principal.session.mfaVerifiedAt === null) throw new ForbiddenException();
    const secret = new Secret({ size: 20 }).base32;
    const codes = Array.from({ length: 10 }, () => randomBytes(9).toString("base64url"));
    await client.$transaction([
      client.mfaFactor.updateMany({
        where: { userId: principal.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      client.mfaRecoveryCode.updateMany({
        where: { userId: principal.user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      client.mfaFactor.create({ data: { userId: principal.user.id, secretEncrypted: this.encrypt(secret) } }),
      client.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({ userId: principal.user.id, codeHash: sha256(code) })),
      }),
    ]);
    return { otpauthUrl: this.totp(secret, principal.user.email).toString(), recoveryCodes: codes };
  }

  async verifyTotp(token: string, code: string, csrf?: string, origin?: string): Promise<void> {
    const principal = await this.assertMutation(token, csrf, origin);
    const client = await this.db.client();
    const factor = await client.mfaFactor.findFirst({
      where: { userId: principal.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (
      !factor ||
      !this.totp(this.decrypt(factor.secretEncrypted), principal.user.email).validate({ token: code.trim(), window: 1 })
    )
      throw genericCredentials();
    await client.$transaction([
      client.mfaFactor.update({
        where: { id: factor.id },
        data: { confirmedAt: factor.confirmedAt ?? new Date(), lastUsedAt: new Date() },
      }),
      client.session.update({ where: { id: principal.session.id }, data: { mfaVerifiedAt: new Date() } }),
    ]);
    await this.audit(principal.user.id, "auth.mfa_verified", undefined);
  }

  async useRecoveryCode(token: string, code: string, csrf?: string, origin?: string): Promise<void> {
    const principal = await this.assertMutation(token, csrf, origin);
    const client = await this.db.client();
    const used = await client.mfaRecoveryCode.updateMany({
      where: { userId: principal.user.id, codeHash: sha256(code.trim()), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw genericCredentials();
    await client.session.update({ where: { id: principal.session.id }, data: { mfaVerifiedAt: new Date() } });
    await this.audit(principal.user.id, "auth.mfa_recovery_used", undefined);
  }
}
