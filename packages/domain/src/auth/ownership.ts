import { isStaffRole, type RoleCode } from "./roles";

export interface Actor {
  userId: string;
  customerId: string | null;
  roles: readonly RoleCode[];
  permissions: ReadonlySet<string>;
  mfaSatisfied: boolean;
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "forbidden" | "not_found" };
const ALLOW: AccessDecision = { allowed: true };
const HIDDEN: AccessDecision = { allowed: false, reason: "not_found" };
const FORBIDDEN: AccessDecision = { allowed: false, reason: "forbidden" };

function staffMay(actor: Actor, permission: string): boolean {
  return actor.mfaSatisfied && actor.roles.some(isStaffRole) && actor.permissions.has(permission);
}

export function canAccessCustomerResource(
  actor: Actor,
  resource: { customerId: string | null },
  permissions: { staff: string; own: string },
): AccessDecision {
  if (staffMay(actor, permissions.staff)) return ALLOW;
  if (actor.customerId !== null && resource.customerId === actor.customerId && actor.permissions.has(permissions.own))
    return ALLOW;
  return HIDDEN;
}

export const canAccessReservation = (actor: Actor, row: { customerId: string | null }) =>
  canAccessCustomerResource(actor, row, { staff: "reservations:read", own: "reservations:read_own" });
export const canAccessQuote = (actor: Actor, row: { customerId: string | null }) =>
  canAccessCustomerResource(actor, row, { staff: "quotes:read", own: "quotes:read_own" });
export const canAccessPayment = (actor: Actor, row: { customerId: string | null }) =>
  canAccessCustomerResource(actor, row, { staff: "payments:read", own: "payments:read_own" });
export const canAccessPqrs = (actor: Actor, row: { customerId: string | null }) =>
  canAccessCustomerResource(actor, row, { staff: "pqrs:read", own: "pqrs:read_own" });

export function canManageSession(actor: Actor, session: { userId: string }): AccessDecision {
  return session.userId === actor.userId ? ALLOW : HIDDEN;
}

export function canAssignRoles(actor: Actor, targetUserId: string, roles: readonly RoleCode[]): AccessDecision {
  if (!staffMay(actor, "roles:assign") || targetUserId === actor.userId || !roles.every(isStaffRole)) return FORBIDDEN;
  return ALLOW;
}
