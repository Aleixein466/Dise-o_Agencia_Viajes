import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
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
import { MailAdapter } from "../notifications/mail";
import { PublicRateLimiter } from "../public/public-rate-limiter";

const PRODUCTION_COOKIE_NAME = "__Host-rt_session";
const LOCAL_COOKIE_NAME = "rt_session";
const ARGON_OPTIONS = { algorithm: 2 as Algorithm, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const genericCredentials = () => new UnauthorizedException();
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hash(randomBytes(16).toString("hex"), ARGON_OPTIONS));
export const PASSWORD_RESET_RESPONSE_FLOOR_MS = 750;

type Principal = {
  user: { id: string; email: string; name: string };
  roles: RoleCode[];
  permissions: string[];
  session: { id: string; mfaVerifiedAt: Date | null };
};

/** Minimum duration of a login-code request (account enumeration by timing). */
export const CUSTOMER_CODE_RESPONSE_FLOOR_MS = 750;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ENV) private readonly env: ApiEnv,
    @Optional() @Inject(MailAdapter) private readonly mail?: MailAdapter,
    @Optional() @Inject(PublicRateLimiter) private readonly limiter?: PublicRateLimiter,
  ) {}

  cookieName(): string {
    // Browsers reject an insecure cookie whose name starts with __Host-. Keep the
    // hardened prefix in production and use a distinct non-production name for
    // local HTTP and isolated browser tests. The token policy is unchanged.
    return this.env.NODE_ENV === "production" ? PRODUCTION_COOKIE_NAME : LOCAL_COOKIE_NAME;
  }
  secureCookie(): boolean {
    return this.env.NODE_ENV === "production";
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
    this.limiter?.check(ip ?? "unknown", "staff-login-ip", 20, 10 * 60_000);
    const user = await client.user.findUnique({ where: { email }, include: { roles: true } });
    const now = new Date();
    if (!user || user.status !== "ACTIVE" || !user.passwordHash || isLocked(user.lockedUntil, now)) {
      // Same Argon2 cost as a real check, so timing does not reveal which accounts exist or are locked.
      await verify(await dummyHash(), password, ARGON_OPTIONS).catch(() => false);
      await this.audit(user?.id ?? null, "auth.login_failed", ip);
      throw genericCredentials();
    }
    const correct = await verify(user.passwordHash, password, ARGON_OPTIONS);
    if (!correct) {
      // Atomic increment: concurrent wrong passwords cannot overwrite each other and dodge the lockout.
      const { failedLoginCount } = await client.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      const lockedUntil = lockoutUntil(failedLoginCount, now);
      // Conditional: if a successful login reset the counter meanwhile, this stale failure must not lock the account.
      if (lockedUntil)
        await client.user.updateMany({ where: { id: user.id, failedLoginCount }, data: { lockedUntil } });
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

  async requirePermission(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    permission: string,
  ): Promise<Principal> {
    const principal = await this.assertMutation(token, csrf, origin);
    if (!principal.session.mfaVerifiedAt || !principal.permissions.includes(permission)) throw new ForbiddenException();
    return principal;
  }

  async requireReadPermission(token: string, permission: string): Promise<Principal> {
    const principal = await this.principal(token);
    if (!principal.session.mfaVerifiedAt || !principal.permissions.includes(permission)) throw new ForbiddenException();
    return principal;
  }
  /** Any MFA-verified staff session (never a customer); callers then scope data by principal.permissions. */
  async requireStaff(token: string): Promise<Principal> {
    const principal = await this.principal(token);
    if (!principal.session.mfaVerifiedAt || principal.roles.every((role) => role === "CUSTOMER"))
      throw new ForbiddenException();
    return principal;
  }
  async requireCustomer(token: string, permission: string): Promise<Principal> {
    const principal = await this.principal(token);
    if (!principal.roles.includes("CUSTOMER") || !principal.permissions.includes(permission))
      throw new ForbiddenException();
    return principal;
  }
  async requireCustomerMutation(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    permission: string,
  ): Promise<Principal> {
    const principal = await this.assertMutation(token, csrf, origin);
    if (!principal.roles.includes("CUSTOMER") || !principal.permissions.includes(permission))
      throw new ForbiddenException();
    return principal;
  }

  private customerCodeHash(email: string, code: string): string {
    return createHmac("sha256", this.env.CUSTOMER_CODE_SECRET).update(`${email}:${code}`).digest("hex");
  }
  async requestCustomerCode(emailInput: string, ip = "unknown"): Promise<void> {
    const client = await this.db.client();
    const email = emailInput.trim().toLowerCase();
    this.limiter?.check(ip, "customer-code-ip", 10, 15 * 60_000);
    this.limiter?.check(email, "customer-code-email", 5, 15 * 60_000);
    // Known and unknown emails take the same minimum time, so response timing does not reveal accounts.
    const started = Date.now();
    try {
      await this.issueCustomerCode(client, email);
    } finally {
      const wait = CUSTOMER_CODE_RESPONSE_FLOOR_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  private async issueCustomerCode(client: Awaited<ReturnType<DbService["client"]>>, email: string): Promise<void> {
    const exists = await client.customer.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
    if (!exists) return;
    const code = String(randomInt(10_000_000, 100_000_000));
    const now = new Date();
    await client.$transaction([
      client.oneTimeToken.updateMany({
        where: { email, purpose: "MAGIC_LINK_LOGIN", usedAt: null },
        data: { usedAt: now },
      }),
      client.oneTimeToken.create({
        data: {
          email,
          purpose: "MAGIC_LINK_LOGIN",
          tokenHash: this.customerCodeHash(email, code),
          expiresAt: oneTimeTokenExpiry("MAGIC_LINK_LOGIN", now),
        },
      }),
    ]);
    // A delivery failure must look exactly like an unknown email (no error status → no account enumeration).
    // Only the kind is logged; never the address or the code.
    try {
      await this.mail?.send({
        to: email,
        subject: "Tu código de acceso",
        text: `Tu código es ${code}`,
        kind: "customer_login_code",
        createdAt: now,
      });
    } catch {
      console.warn("[auth] customer_login_code delivery failed");
    }
  }
  async verifyCustomerCode(emailInput: string, code: string, ip = "unknown"): Promise<{ token: string }> {
    const client = await this.db.client();
    const email = emailInput.trim().toLowerCase();
    try {
      this.limiter?.check(email, "customer-verify", 5, 15 * 60_000);
    } catch {
      throw new HttpException("Too many requests", 429);
    }
    const now = new Date();
    const row = await client.oneTimeToken.findFirst({
      where: {
        email,
        purpose: "MAGIC_LINK_LOGIN",
        tokenHash: this.customerCodeHash(email, code),
        usedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (
      !row ||
      // Expiry is re-checked in the consuming update: a code that expires between lookup and use is refused.
      (
        await client.oneTimeToken.updateMany({
          where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: now },
        })
      ).count !== 1
    )
      throw new BadRequestException();
    let user = await client.user.findUnique({ where: { email }, include: { roles: true } });
    if (user && user.roles.some((r) => r.roleCode !== "CUSTOMER")) throw new BadRequestException();
    if (!user)
      user = await client.user.create({
        data: { email, name: email, role: "CUSTOMER", roles: { create: { roleCode: "CUSTOMER" } } },
        include: { roles: true },
      });
    await client.customer.updateMany({ where: { email, deletedAt: null, userId: null }, data: { userId: user.id } });
    const token = opaque();
    await client.session.create({
      data: { userId: user.id, tokenHash: this.hashToken(token), expiresAt: sessionAbsoluteExpiry(now, "customer") },
    });
    await this.audit(user.id, "auth.customer_login", ip);
    return { token };
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
    const email = emailInput.trim().toLowerCase();
    this.limiter?.check(ip ?? "unknown", "password-reset-ip", 10, 15 * 60_000);
    this.limiter?.check(email, "password-reset-email", 3, 15 * 60_000);
    // Known and unknown emails take the same minimum time (anti-enumeration), as with customer codes.
    const started = Date.now();
    try {
      await this.issuePasswordReset(email, ip);
    } finally {
      const wait = PASSWORD_RESET_RESPONSE_FLOOR_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  private async issuePasswordReset(email: string, ip?: string): Promise<void> {
    const client = await this.db.client();
    const user = await client.user.findUnique({ where: { email } });
    if (user?.status !== "ACTIVE" || user.deletedAt) return;
    const token = opaque();
    const now = new Date();
    const created = await client.oneTimeToken.create({
      data: {
        tokenHash: this.hashToken(token),
        purpose: "PASSWORD_RESET",
        userId: user.id,
        expiresAt: oneTimeTokenExpiry("PASSWORD_RESET", now),
        ipHash: ip ? sha256(ip) : undefined,
      },
      select: { id: true },
    });
    await this.audit(user.id, "auth.password_reset_requested", ip);
    // Direct send (never the outbox, which would store the token). Only the kind is logged, never address or token.
    if (!this.mail || this.env.MAIL_ADAPTER === "disabled") return;
    try {
      await this.mail.send({
        to: email,
        subject: "Restablece tu contraseña",
        text: `Para elegir una contraseña nueva abre este enlace (vence pronto y solo funciona una vez): ${this.env.APP_ORIGIN}/restablecer?token=${encodeURIComponent(token)}
Si no lo solicitaste, ignora este mensaje.`,
        kind: "password_reset",
        createdAt: now,
      });
    } catch {
      console.warn("[auth] password_reset delivery failed");
      return;
    }
    // Only after the new link was handed to the mail adapter: earlier unused links stop working, so an attacker
    // requesting resets cannot kill a victim's working link without a replacement arriving.
    await client.oneTimeToken.updateMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null, id: { not: created.id } },
      data: { usedAt: now },
    });
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
    if (!factor) throw genericCredentials();
    const delta = this.totp(this.decrypt(factor.secretEncrypted), principal.user.email).validate({
      token: code.trim(),
      window: 1,
    });
    // OTPAuth returns 0 for the current (valid) time-step; only null means no match.
    if (delta === null) throw genericCredentials();
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
