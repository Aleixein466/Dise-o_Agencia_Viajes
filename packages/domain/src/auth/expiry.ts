import { isStaff } from "./roles";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export type SessionKind = "staff" | "customer";
export const SESSION_POLICY: Readonly<Record<SessionKind, { idleMs: number; absoluteMs: number }>> = Object.freeze({
  staff: { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR },
  customer: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
});
export const SESSION_TOUCH_INTERVAL_MS = MINUTE;
export const ONE_TIME_TOKEN_TTL_MS = Object.freeze({
  PASSWORD_RESET: 15 * MINUTE,
  EMAIL_VERIFICATION: 15 * MINUTE,
  MAGIC_LINK_LOGIN: 30 * MINUTE,
  RESERVATION_ACCESS: 30 * MINUTE,
} as const);
export type OneTimeTokenPurpose = keyof typeof ONE_TIME_TOKEN_TTL_MS;
export const LOCKOUT_POLICY = Object.freeze({ threshold: 5, baseMs: 5 * MINUTE, maxMs: 2 * HOUR });

export function sessionKindFor(roles: readonly string[]): SessionKind {
  return isStaff(roles) ? "staff" : "customer";
}
export function sessionAbsoluteExpiry(createdAt: Date, kind: SessionKind): Date {
  return new Date(createdAt.getTime() + SESSION_POLICY[kind].absoluteMs);
}
export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type SessionState = "active" | "revoked" | "expired_absolute" | "expired_idle";
/** Re-evaluate against current roles so a newly promoted staff user receives the shorter policy immediately. */
export function sessionState(session: SessionTimes, kind: SessionKind, now: Date): SessionState {
  if (session.revokedAt) return "revoked";
  const policy = SESSION_POLICY[kind];
  const absolute = Math.min(session.expiresAt.getTime(), session.createdAt.getTime() + policy.absoluteMs);
  if (now.getTime() >= absolute) return "expired_absolute";
  if (now.getTime() - (session.lastSeenAt ?? session.createdAt).getTime() >= policy.idleMs) return "expired_idle";
  return "active";
}
export function oneTimeTokenExpiry(purpose: OneTimeTokenPurpose, now: Date): Date {
  return new Date(now.getTime() + ONE_TIME_TOKEN_TTL_MS[purpose]);
}
export function lockoutUntil(failedCount: number, now: Date): Date | null {
  if (failedCount < LOCKOUT_POLICY.threshold) return null;
  return new Date(
    now.getTime() +
      Math.min(LOCKOUT_POLICY.baseMs * 2 ** Math.min(failedCount - LOCKOUT_POLICY.threshold, 16), LOCKOUT_POLICY.maxMs),
  );
}
export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
