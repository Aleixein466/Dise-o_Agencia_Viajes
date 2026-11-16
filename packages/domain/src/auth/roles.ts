import type { Role } from "../reservations/state-machine";

/** Assignable application roles. SYSTEM is an internal actor, never an account role. */
export const ROLE_CODES = ["CUSTOMER", "ADVISOR", "FINANCE", "ADMIN"] as const satisfies readonly Role[];
export type RoleCode = (typeof ROLE_CODES)[number];

export const STAFF_ROLES = ["ADVISOR", "FINANCE", "ADMIN"] as const satisfies readonly RoleCode[];
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function isStaff(roles: readonly string[]): boolean {
  return roles.some(isStaffRole);
}

export function requiresMfa(roles: readonly string[]): boolean {
  return isStaff(roles);
}

const ROLE_RANK: Record<RoleCode, number> = { CUSTOMER: 0, ADVISOR: 1, FINANCE: 2, ADMIN: 3 };

export function primaryRole(roles: readonly RoleCode[]): RoleCode | null {
  let best: RoleCode | null = null;
  for (const role of roles) if (best === null || ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  return best;
}
