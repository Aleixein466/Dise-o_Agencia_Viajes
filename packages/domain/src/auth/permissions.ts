import type { RoleCode } from "./roles";

/** Versioned RBAC catalogue. A migration/seed must mirror this set before routes use it. */
export const PERMISSIONS = {
  "catalog:write": "Create and edit catalog data",
  "catalog:publish": "Publish or archive catalog items",
  "content:write": "Edit site content",
  "customers:read": "Read customer records",
  "customers:write": "Edit customer records",
  "quotes:read": "Read all quotes",
  "quotes:write": "Edit quotes",
  "quotes:read_own": "Read own quotes",
  "quotes:create_own": "Request own quotes",
  "reservations:read": "Read all reservations",
  "reservations:write": "Edit non-financial reservation states",
  "reservations:read_own": "Read own reservations",
  "payments:read": "Read payments",
  "payments:read_own": "Read own payments",
  "payments:register_abono": "Register manual abonos",
  "payments:approve": "Approve manual abonos",
  "payments:refund": "Approve refunds",
  "pqrs:read": "Read all PQRS tickets",
  "pqrs:respond": "Respond to PQRS tickets",
  "pqrs:create_own": "Create own PQRS tickets",
  "pqrs:read_own": "Read own PQRS tickets",
  "reports:read": "Read operational reports",
  "staff:read": "List staff accounts",
  "staff:write": "Manage staff accounts",
  "roles:assign": "Assign roles",
  "permissions:manage": "Manage role permissions",
  "settings:write": "Edit agency settings",
  "audit:read": "Read audit logs",
} as const satisfies Record<string, string>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = Object.freeze({
  CUSTOMER: [
    "quotes:read_own",
    "quotes:create_own",
    "reservations:read_own",
    "payments:read_own",
    "pqrs:create_own",
    "pqrs:read_own",
  ],
  ADVISOR: [
    "catalog:write",
    "customers:read",
    "customers:write",
    "quotes:read",
    "quotes:write",
    "reservations:read",
    "reservations:write",
    "payments:read",
    "pqrs:read",
    "pqrs:respond",
  ],
  FINANCE: [
    "customers:read",
    "quotes:read",
    "reservations:read",
    "payments:read",
    "payments:register_abono",
    "payments:approve",
    "payments:refund",
    "reports:read",
  ],
  ADMIN: [
    "catalog:write",
    "catalog:publish",
    "content:write",
    "customers:read",
    "customers:write",
    "quotes:read",
    "quotes:write",
    "reservations:read",
    "reservations:write",
    "payments:read",
    "pqrs:read",
    "pqrs:respond",
    "reports:read",
    "staff:read",
    "staff:write",
    "roles:assign",
    "permissions:manage",
    "settings:write",
    "audit:read",
  ],
});

export function permissionsForRoles(roles: readonly RoleCode[]): ReadonlySet<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  return granted;
}

export function hasAllPermissions(granted: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.length > 0 && required.every((permission) => granted.has(permission));
}
