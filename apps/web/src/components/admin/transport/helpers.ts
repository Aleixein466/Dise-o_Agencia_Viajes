// Pure helpers for the transport-options admin. Contract: docs/orchestration/contracts/transport-options-admin.md
import { describeError as describeCommonError, type ApiFailure } from "../commercial/helpers";

export type TransportMode = "GROUND" | "AIR" | "SEA";
export type TransportStatus = "active" | "inactive";
export type TransportValues = Record<string, string>;
export type TransportErrors = Record<string, string>;

export const MODE_LABELS: Record<TransportMode, string> = { GROUND: "Terrestre", AIR: "Aéreo", SEA: "Marítimo" };
export const MODES = Object.keys(MODE_LABELS) as TransportMode[];
export const STATUS_LABELS: Record<TransportStatus, string> = { active: "Activa", inactive: "Inactiva" };

export const modeLabel = (mode: string) => MODE_LABELS[mode as TransportMode] ?? mode;
export const statusLabel = (status: string) => STATUS_LABELS[status as TransportStatus] ?? status;

export const NAME_MAX = 120;
export const TEXT_MAX = 2000;

export function blankTransport(destinationId = ""): TransportValues {
  return { destinationId, mode: "GROUND", name: "", description: "", conditions: "" };
}
export function transportValues(item: {
  destinationId: string;
  mode: string;
  name: string;
  description?: string | null;
  conditions?: string | null;
}): TransportValues {
  return {
    destinationId: item.destinationId,
    mode: item.mode,
    name: item.name,
    description: item.description ?? "",
    conditions: item.conditions ?? "",
  };
}

export function validateTransport(values: TransportValues, mode: "create" | "edit"): TransportErrors {
  const errors: TransportErrors = {};
  if (mode === "create" && !values.destinationId) errors.destinationId = "Elige un destino.";
  if (!MODES.includes(values.mode as TransportMode)) errors.mode = "Elige un modo de transporte.";
  const name = (values.name ?? "").trim();
  if (name.length < 2) errors.name = "El nombre debe tener al menos 2 caracteres.";
  else if (name.length > NAME_MAX) errors.name = `El nombre admite máximo ${NAME_MAX} caracteres.`;
  if ((values.description ?? "").trim().length > TEXT_MAX)
    errors.description = `La descripción admite máximo ${TEXT_MAX} caracteres.`;
  if ((values.conditions ?? "").trim().length > TEXT_MAX)
    errors.conditions = `Las condiciones admiten máximo ${TEXT_MAX} caracteres.`;
  return errors;
}

export function transportPayload(values: TransportValues, mode: "create" | "edit") {
  return {
    ...(mode === "create" ? { destinationId: values.destinationId } : {}),
    mode: values.mode,
    name: values.name.trim(),
    description: values.description.trim() || null,
    conditions: values.conditions.trim() || null,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  TRANSPORT_NAME_TAKEN: "Ya existe una opción con ese nombre para el mismo destino y modo. Elige otro nombre.",
  DESTINATION_NOT_FOUND: "El destino elegido ya no existe.",
  ALREADY_ACTIVE: "La opción ya estaba activa.",
  ALREADY_INACTIVE: "La opción ya estaba desactivada.",
  STALE_UPDATE: "Otra persona modificó esta opción. Se recargó la lista: revisa y vuelve a intentar.",
};
const ERROR_FIELDS: Record<string, string> = {
  TRANSPORT_NAME_TAKEN: "name",
  DESTINATION_NOT_FOUND: "destinationId",
};

export function describeTransportError(failure: ApiFailure): { code: string; message: string; field?: string } {
  const common = describeCommonError(failure);
  const body = failure.data && typeof failure.data === "object" ? (failure.data as Record<string, unknown>) : {};
  if (common.code === "TRANSPORT_IN_USE") {
    const count = typeof body.count === "number" ? body.count : null;
    return {
      code: common.code,
      message: `No se puede desactivar: la usan ${
        count === null
          ? "paquetes publicados"
          : count === 1
            ? "1 componente de un paquete publicado"
            : `${count} componentes de paquetes publicados`
      }. Quítala de esos paquetes primero.`,
    };
  }
  return {
    code: common.code,
    message: ERROR_MESSAGES[common.code] ?? common.message,
    field: ERROR_FIELDS[common.code],
  };
}

// History -------------------------------------------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  created: "Creada",
  updated: "Editada",
  deactivated: "Desactivada",
  activated: "Activada",
};
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  mode: "Modo",
  description: "Descripción",
  conditions: "Condiciones",
  status: "Estado",
};

export function transportActionLabel(action: string): string {
  const suffix = action.split(".").pop() ?? action;
  return ACTION_LABELS[suffix] ?? action;
}

function historyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "sin valor";
  if (key === "mode") return modeLabel(String(value));
  if (key === "status") return statusLabel(String(value));
  return String(value);
}

/** One line per field that changed between two audit snapshots ("Modo: Terrestre → Aéreo"). */
export function summarizeTransportChanges(row: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): string[] {
  const { before, after } = row;
  if (!before || !after) return [];
  const lines: string[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
    lines.push(`${FIELD_LABELS[key]}: ${historyValue(key, before[key])} → ${historyValue(key, after[key])}`);
  }
  return lines;
}
