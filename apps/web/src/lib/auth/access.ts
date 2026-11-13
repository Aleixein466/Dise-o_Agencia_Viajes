import type { SessionResult } from "./types";

export const STAFF_ROLES: readonly string[] = ["ADVISOR", "FINANCE", "ADMIN"];

export type AccessDecision =
  { kind: "allow" } | { kind: "unavailable" } | { kind: "forbidden" } | { kind: "redirect"; to: string };

/** Only same-site /admin paths are accepted as post-login destinations (no open redirects). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 200) return "/admin";
  if (raw !== "/admin" && !raw.startsWith("/admin/")) return "/admin";
  if (raw.includes("\\") || raw.includes("//") || /[\u0000-\u001f]/.test(raw)) return "/admin";
  return raw;
}

export function decideAdminAccess(input: {
  apiConfigured: boolean;
  session: SessionResult;
  pathname: string;
}): AccessDecision {
  if (!input.apiConfigured || input.session.status === "error") return { kind: "unavailable" };
  const next = encodeURIComponent(safeNextPath(input.pathname));
  if (input.session.status === "anonymous") return { kind: "redirect", to: `/ingresar?next=${next}` };
  const { roles, mfaCompleted } = input.session.session;
  if (!roles.some((role) => STAFF_ROLES.includes(role))) return { kind: "forbidden" };
  if (!mfaCompleted) return { kind: "redirect", to: `/ingresar/mfa?next=${next}` };
  return { kind: "allow" };
}
