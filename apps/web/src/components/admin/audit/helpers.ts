// Pure helpers for the read-only audit log viewer (GET /api/v1/admin/audit). Spanish UI text lives here.
import { isValidDate } from "../commercial/helpers";

export { formatDateTime } from "../commercial/helpers";

export type AuditFilters = {
  entity: string;
  action: string;
  actorId: string;
  entityId: string;
  from: string;
  to: string;
};
export type AuditFilterErrors = Partial<Record<keyof AuditFilters, string>>;

export type AuditEvent = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string;
  actor: { id: string; name: string } | null;
  actorRole: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  details: unknown;
};

export const EMPTY_FILTERS: AuditFilters = { entity: "", action: "", actorId: "", entityId: "", from: "", to: "" };
export const PAGE_SIZE = 20;
export const REDACTED = "[oculto]";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateFilters(filters: AuditFilters): AuditFilterErrors {
  const errors: AuditFilterErrors = {};
  if (filters.actorId.trim() && !UUID.test(filters.actorId.trim()))
    errors.actorId = "Ingresa un identificador válido (UUID).";
  if (filters.from && !isValidDate(filters.from)) errors.from = "Usa una fecha válida (AAAA-MM-DD).";
  if (filters.to && !isValidDate(filters.to)) errors.to = "Usa una fecha válida (AAAA-MM-DD).";
  if (!errors.from && !errors.to && filters.from && filters.to && filters.from > filters.to)
    errors.to = "La fecha final no puede ser anterior a la inicial.";
  return errors;
}

/** Query string for the list endpoint: only filled filters are sent. */
export function buildAuditQuery(filters: AuditFilters, page: number, pageSize = PAGE_SIZE): string {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
  return query.toString();
}

export function auditErrorMessage(status: number): string {
  if (status === 0) return "No hay conexión con el servidor. Intenta de nuevo.";
  if (status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (status === 403) return "No tienes permiso para consultar la auditoría.";
  if (status === 400) return "Revisa los filtros: alguno no tiene un formato válido.";
  return "No se pudo cargar la auditoría. Intenta de nuevo.";
}

export function actorLabel(event: Pick<AuditEvent, "actor" | "actorRole">): string {
  if (event.actor) return event.actor.name;
  return event.actorRole === "SYSTEM" ? "Sistema" : "Sin actor";
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  ADVISOR: "Asesor",
  FINANCE: "Finanzas",
  CUSTOMER: "Cliente",
  SYSTEM: "Sistema",
};
export function roleLabel(role: string | null): string {
  return role ? (ROLE_LABELS[role] ?? role) : "—";
}

export type DiffEntry = {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
  hasBefore: boolean;
  hasAfter: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Top-level keys of both snapshots; `changed` when their JSON differs (a key present on one side only counts). */
export function diffEntries(before: unknown, after: unknown): DiffEntry[] {
  const a = isRecord(before) ? before : {};
  const b = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.map((key) => ({
    key,
    before: a[key],
    after: b[key],
    hasBefore: key in a,
    hasAfter: key in b,
    changed: !(key in a && key in b) || JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  }));
}

export function prettyJson(value: unknown): string {
  if (value === undefined) return "—";
  return JSON.stringify(value, null, 2) ?? "—";
}

export function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return isRecord(value) ? Object.keys(value).length > 0 : true;
}
