import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { checkPasswordPolicy, oneTimeTokenExpiry } from "@ricaurte/domain";
import type { Prisma, PrismaClient } from "@ricaurte/db";
import { DbService } from "../db/db.service";
import { ENV, type ApiEnv } from "../config/env";
import { MailAdapter } from "../notifications/mail";
import { PublicRateLimiter } from "../public/public-rate-limiter";
import { ARGON_OPTIONS, AuthService } from "./auth.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const RECOVERY_CODE_COUNT = 10;
const coded = (code: string) => new BadRequestException({ code });

type Principal = Awaited<ReturnType<AuthService["requireStaff"]>>;
type Credentials = { currentPassword: string };

/**
 * Self-service account management for signed-in staff ("Mi perfil / Seguridad"). Every mutation goes through
 * requireStaffMutation (session, MFA, CSRF, Origin) and the sensitive ones re-verify the current password.
 * Nothing here touches other accounts: the principal's own id is the only key ever used.
 */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional() @Inject(MailAdapter) private readonly mail?: MailAdapter,
    @Optional() @Inject(PublicRateLimiter) private readonly limiter?: PublicRateLimiter,
  ) {}

  private async audit(
    client: PrismaClient,
    userId: string,
    action: string,
    extra: { ip?: string; details?: Record<string, unknown>; before?: unknown; after?: unknown } = {},
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: userId,
        action,
        entity: "user",
        entityId: userId,
        ipHash: extra.ip ? sha256(extra.ip) : undefined,
        details: extra.details as Prisma.InputJsonObject | undefined,
        before: extra.before as never,
        after: extra.after as never,
      },
    });
  }

  /** Re-checks the password behind every sensitive change; failures are rate-limited per account and audited. */
  private async verifyCurrentPassword(
    client: PrismaClient,
    principal: Principal,
    password: string,
    scope: string,
    ip?: string,
  ): Promise<{ id: string; email: string; name: string }> {
    this.limiter?.check(principal.user.id, scope, 5, 15 * 60_000);
    const user = await client.user.findUnique({
      where: { id: principal.user.id },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    const correct = user?.passwordHash ? await verify(user.passwordHash, password, ARGON_OPTIONS) : false;
    if (!user || !correct) {
      await this.audit(client, principal.user.id, "auth.profile_password_check_failed", { ip });
      throw coded("INVALID_CURRENT_PASSWORD");
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  private emailChangeHash(userId: string, email: string, code: string): string {
    return createHmac("sha256", this.env.CUSTOMER_CODE_SECRET).update(`${userId}:${email}:${code}`).digest("hex");
  }

  async me(token: string) {
    const principal = await this.auth.requireStaff(token);
    const client = await this.db.client();
    const userId = principal.user.id;
    const now = new Date();
    const [user, factor, recoveryCodesRemaining, sessions] = await Promise.all([
      client.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
      }),
      client.mfaFactor.findFirst({
        where: { userId, revokedAt: null, confirmedAt: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { confirmedAt: true, lastUsedAt: true },
      }),
      client.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
      client.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, mfaVerifiedAt: true },
      }),
    ]);
    return {
      user: { ...user, roles: principal.roles },
      mfa: {
        enrolled: factor !== null,
        confirmedAt: factor?.confirmedAt ?? null,
        lastUsedAt: factor?.lastUsedAt ?? null,
      },
      recoveryCodesRemaining,
      sessions: sessions.map(({ mfaVerifiedAt, ...session }) => ({
        ...session,
        current: session.id === principal.session.id,
        mfaVerified: mfaVerifiedAt !== null,
      })),
    };
  }

  async updateName(token: string, csrf: string | undefined, origin: string | undefined, nameInput: string) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    const client = await this.db.client();
    const name = nameInput.trim();
    const before = await client.user.findUniqueOrThrow({ where: { id: principal.user.id }, select: { name: true } });
    if (before.name !== name) {
      await client.user.update({ where: { id: principal.user.id }, data: { name } });
      await this.audit(client, principal.user.id, "users.profile_name_changed", {
        before: { name: before.name },
        after: { name },
        details: { changedFields: ["name"] },
      });
    }
    return { name };
  }

  async changePassword(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    input: Credentials & { newPassword: string },
    ip?: string,
  ) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    const client = await this.db.client();
    const user = await this.verifyCurrentPassword(client, principal, input.currentPassword, "profile-password", ip);
    if (input.newPassword === input.currentPassword) throw coded("PASSWORD_UNCHANGED");
    const policy = checkPasswordPolicy(input.newPassword, { email: user.email, name: user.name });
    if (!policy.ok) throw coded(`PASSWORD_${policy.reason.toUpperCase()}`);
    const passwordHash = await hash(input.newPassword.normalize("NFKC"), ARGON_OPTIONS);
    const now = new Date();
    // Other devices must sign in again with the new password; this session stays (the user is at the keyboard).
    const [, revoked] = await client.$transaction([
      client.user.update({ where: { id: user.id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } }),
      client.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: principal.session.id } },
        data: { revokedAt: now },
      }),
    ]);
    await this.audit(client, user.id, "auth.password_changed", { ip, details: { sessionsRevoked: revoked.count } });
    return { sessionsRevoked: revoked.count };
  }

  /** Step 1 of the e-mail change: password check, then a 6-digit code to the NEW address (15 minutes, one use). */
  async requestEmailChange(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    input: Credentials & { newEmail: string },
    ip?: string,
  ) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    if (!this.mail || this.env.MAIL_ADAPTER === "disabled")
      throw new ServiceUnavailableException({ code: "MAIL_DISABLED" });
    const client = await this.db.client();
    const user = await this.verifyCurrentPassword(client, principal, input.currentPassword, "profile-email", ip);
    const email = input.newEmail.trim().toLowerCase();
    if (email === user.email) throw coded("EMAIL_UNCHANGED");
    const taken = await client.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new ConflictException({ code: "EMAIL_TAKEN" });
    const code = String(randomInt(100_000, 1_000_000));
    const now = new Date();
    const expiresAt = oneTimeTokenExpiry("EMAIL_VERIFICATION", now);
    await client.$transaction([
      client.oneTimeToken.updateMany({
        where: { userId: user.id, purpose: "EMAIL_VERIFICATION", usedAt: null },
        data: { usedAt: now },
      }),
      client.oneTimeToken.create({
        data: {
          userId: user.id,
          email,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: this.emailChangeHash(user.id, email, code),
          expiresAt,
          ipHash: ip ? sha256(ip) : undefined,
        },
      }),
    ]);
    // The code goes to the new address only. Never log the address or the code.
    try {
      await this.mail.send({
        to: email,
        subject: "Confirma tu nuevo correo de acceso",
        text: `Tu código para confirmar el nuevo correo de acceso a Ricaurte Tours es ${code}. Vence en 15 minutos y solo funciona una vez.
Si no solicitaste este cambio, ignora este mensaje.`,
        kind: "staff_email_change_code",
        createdAt: now,
      });
    } catch {
      console.warn("[auth] staff_email_change_code delivery failed");
      throw new ServiceUnavailableException({ code: "MAIL_FAILED" });
    }
    // Security notice to the current address; a failure here must not block the change.
    try {
      await this.mail.send({
        to: user.email,
        subject: "Se solicitó cambiar el correo de tu cuenta",
        text: `Alguien con tu contraseña y tu segundo factor pidió cambiar el correo de acceso de tu cuenta en Ricaurte Tours. Si no fuiste tú, cambia tu contraseña de inmediato y avisa a otro administrador.`,
        kind: "staff_email_change_notice",
        createdAt: now,
      });
    } catch {
      console.warn("[auth] staff_email_change_notice delivery failed");
    }
    await this.audit(client, user.id, "auth.email_change_requested", { ip });
    return { expiresAt };
  }

  /** Step 2: the code proves control of the new address; other sessions are closed and the change is audited. */
  async confirmEmailChange(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    code: string,
    ip?: string,
  ) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    this.limiter?.check(principal.user.id, "profile-email-confirm", 5, 15 * 60_000);
    const client = await this.db.client();
    const now = new Date();
    const row = await client.oneTimeToken.findFirst({
      where: { userId: principal.user.id, purpose: "EMAIL_VERIFICATION", usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, tokenHash: true },
    });
    const expected = row?.email ? this.emailChangeHash(principal.user.id, row.email, code.trim()) : null;
    if (
      !row?.email ||
      !expected ||
      row.tokenHash.length !== expected.length ||
      !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(expected))
    ) {
      await this.audit(client, principal.user.id, "auth.email_change_code_rejected", { ip });
      throw coded("INVALID_CODE");
    }
    const consumed = await client.oneTimeToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw coded("INVALID_CODE");
    const taken = await client.user.findUnique({ where: { email: row.email }, select: { id: true } });
    if (taken) throw new ConflictException({ code: "EMAIL_TAKEN" });
    await client.$transaction([
      client.user.update({ where: { id: principal.user.id }, data: { email: row.email } }),
      client.session.updateMany({
        where: { userId: principal.user.id, revokedAt: null, id: { not: principal.session.id } },
        data: { revokedAt: now },
      }),
    ]);
    // Addresses are personal data: the history records that the field changed, not its values.
    await this.audit(client, principal.user.id, "auth.email_changed", { ip, details: { changedFields: ["email"] } });
    return { email: row.email };
  }

  /** New recovery codes replace the unused ones; they are returned once and only their hashes are stored. */
  async regenerateRecoveryCodes(
    token: string,
    csrf: string | undefined,
    origin: string | undefined,
    input: Credentials,
    ip?: string,
  ) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    const client = await this.db.client();
    const user = await this.verifyCurrentPassword(client, principal, input.currentPassword, "profile-recovery", ip);
    const factor = await client.mfaFactor.findFirst({
      where: { userId: user.id, revokedAt: null, confirmedAt: { not: null } },
      select: { id: true },
    });
    if (!factor) throw coded("MFA_NOT_ENROLLED");
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(9).toString("base64url"));
    await client.$transaction([
      client.mfaRecoveryCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      client.mfaRecoveryCode.createMany({ data: codes.map((value) => ({ userId: user.id, codeHash: sha256(value) })) }),
    ]);
    await this.audit(client, user.id, "auth.recovery_codes_regenerated", { ip });
    return { recoveryCodes: codes };
  }

  async revokeOtherSessions(token: string, csrf: string | undefined, origin: string | undefined, ip?: string) {
    const principal = await this.auth.requireStaffMutation(token, csrf, origin);
    const client = await this.db.client();
    const result = await client.session.updateMany({
      where: { userId: principal.user.id, revokedAt: null, id: { not: principal.session.id } },
      data: { revokedAt: new Date() },
    });
    await this.audit(client, principal.user.id, "auth.sessions_revoked_others", {
      ip,
      details: { count: result.count },
    });
    return { revoked: result.count };
  }

  /** The account's own security trail: sign-ins, MFA, password and profile events (last 30). */
  async activity(token: string) {
    const principal = await this.auth.requireStaff(token);
    const client = await this.db.client();
    return client.auditLog.findMany({
      where: {
        OR: [
          { actorId: principal.user.id, entity: "auth" },
          { entity: "user", entityId: principal.user.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, entity: true, createdAt: true, actorId: true },
    });
  }
}
