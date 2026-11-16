// Pure helpers for the agency settings admin.
import { describeError as describeCommonError, type ApiFailure } from "../commercial/helpers";

export type SettingsValues = Record<string, string>;
export type SettingsErrors = Record<string, string>;

export type AgencyFieldDef = {
  name: string;
  label: string;
  group: "identity" | "contact" | "social";
  maxLength: number;
  hint?: string;
  wide?: boolean;
  textarea?: boolean;
  kind?: "email" | "phone" | "url" | "date" | "nit" | "rnt";
};

export const GROUP_TITLES = {
  identity: "Datos de la agencia",
  contact: "Contacto y horario",
  social: "Redes sociales",
} as const;

export const AGENCY_FIELDS: readonly AgencyFieldDef[] = [
  { name: "tradeName", label: "Nombre comercial", group: "identity", maxLength: 200 },
  { name: "legalName", label: "Razón social", group: "identity", maxLength: 200 },
  { name: "nit", label: "NIT", group: "identity", maxLength: 30, kind: "nit", hint: "Solo números, puntos y guion." },
  { name: "rnt", label: "RNT (Registro Nacional de Turismo)", group: "identity", maxLength: 30, kind: "rnt" },
  {
    name: "rntValidUntil",
    label: "Vigencia del RNT",
    group: "identity",
    maxLength: 10,
    kind: "date",
    hint: "Formato AAAA-MM-DD.",
  },
  { name: "address", label: "Dirección", group: "contact", maxLength: 250, wide: true },
  { name: "city", label: "Ciudad", group: "contact", maxLength: 100 },
  {
    name: "phone",
    label: "Teléfono",
    group: "contact",
    maxLength: 25,
    kind: "phone",
    hint: "Solo dígitos y +; mínimo 7.",
  },
  {
    name: "whatsapp",
    label: "WhatsApp",
    group: "contact",
    maxLength: 25,
    kind: "phone",
    hint: "Solo dígitos y +; mínimo 7.",
  },
  { name: "contactEmail", label: "Correo de contacto (público)", group: "contact", maxLength: 254, kind: "email" },
  {
    name: "bookingsEmail",
    label: "Correo de reservas (interno)",
    group: "contact",
    maxLength: 254,
    kind: "email",
    hint: "No se publica en el sitio.",
  },
  { name: "businessHours", label: "Horario de atención", group: "contact", maxLength: 300, textarea: true, wide: true },
  {
    name: "facebookUrl",
    label: "Facebook",
    group: "social",
    maxLength: 300,
    kind: "url",
    hint: "Dirección que empiece por https://",
  },
  {
    name: "instagramUrl",
    label: "Instagram",
    group: "social",
    maxLength: 300,
    kind: "url",
    hint: "Dirección que empiece por https://",
  },
  {
    name: "tiktokUrl",
    label: "TikTok",
    group: "social",
    maxLength: 300,
    kind: "url",
    hint: "Dirección que empiece por https://",
  },
  {
    name: "youtubeUrl",
    label: "YouTube",
    group: "social",
    maxLength: 300,
    kind: "url",
    hint: "Dirección que empiece por https://",
  },
];

export const SECRETS_NOTICE =
  "Aquí solo van datos del negocio. Las claves, secretos, tokens y contraseñas (correo, pagos, base de datos) se configuran en las variables de entorno del servidor, nunca en este panel.";

export function isHttpUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
export const normalizePhone = (value: string) => value.replace(/[\s().-]/g, "");

export function blankSettings(): SettingsValues {
  return { ...Object.fromEntries(AGENCY_FIELDS.map((f) => [f.name, ""])), logoMediaId: "" };
}
export function settingsValues(data: Record<string, unknown>): SettingsValues {
  const out = blankSettings();
  for (const key of Object.keys(out)) {
    const value = key === "logoMediaId" ? (data.logo as { id?: string } | null)?.id : data[key];
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

export function validateSettings(values: SettingsValues): SettingsErrors {
  const errors: SettingsErrors = {};
  for (const field of AGENCY_FIELDS) {
    const value = (values[field.name] ?? "").trim();
    if (!value) continue;
    if (value.length > field.maxLength) {
      errors[field.name] = `${field.label} admite máximo ${field.maxLength} caracteres.`;
      continue;
    }
    if (field.kind === "email" && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value))
      errors[field.name] = "Escribe un correo válido, por ejemplo nombre@dominio.com.";
    else if (field.kind === "phone" && !/^\+?[0-9]{7,20}$/.test(normalizePhone(value)))
      errors[field.name] = "Usa solo dígitos y un + inicial opcional (de 7 a 20 dígitos).";
    else if (field.kind === "url" && !isHttpUrl(value))
      errors[field.name] = "Escribe una dirección que empiece por http:// o https://.";
    else if (field.kind === "nit" && !/^[0-9][0-9.-]*$/.test(value))
      errors[field.name] = "El NIT solo admite números, puntos y guion.";
    else if (field.kind === "rnt" && !/^[0-9A-Za-z.-]+$/.test(value))
      errors[field.name] = "El RNT solo admite letras, números, puntos y guion, sin espacios.";
    else if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      errors[field.name] = "Usa el formato AAAA-MM-DD.";
  }
  return errors;
}

export function settingsPayload(values: SettingsValues) {
  const body: Record<string, string | null> = {};
  for (const field of AGENCY_FIELDS) {
    const value = (values[field.name] ?? "").trim();
    body[field.name] = value ? (field.kind === "phone" ? normalizePhone(value) : value) : null;
  }
  body.logoMediaId = values.logoMediaId || null;
  return body;
}

const ERROR_MESSAGES: Record<string, string> = {
  SECRETS_NOT_ALLOWED: "Las claves y secretos no se guardan aquí: usa las variables de entorno del servidor.",
  MEDIA_NOT_FOUND: "El logo elegido ya no existe o no es público.",
  STALE_UPDATE: "Otra persona modificó la configuración. Se recargó: revisa y vuelve a intentar.",
};
const ERROR_FIELDS: Record<string, string> = { MEDIA_NOT_FOUND: "logoMediaId" };

export function describeSettingsError(failure: ApiFailure): { code: string; message: string; field?: string } {
  const common = describeCommonError(failure);
  return {
    code: common.code,
    message: ERROR_MESSAGES[common.code] ?? common.message,
    field: ERROR_FIELDS[common.code],
  };
}

const FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(AGENCY_FIELDS.map((f) => [f.name, f.label])),
  logoMediaId: "Logo",
};
export function settingsActionLabel(action: string): string {
  const suffix = action.split(".").pop() ?? action;
  return suffix === "created" ? "Creada" : suffix === "updated" ? "Editada" : action;
}
/** Contact values are redacted in the audit log, so the history lists which fields changed, not their values. */
export function summarizeSettingsChanges(row: { details?: unknown }): string[] {
  const details = row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {};
  const fields = Array.isArray(details.changedFields) ? details.changedFields : [];
  const labels = fields.filter((f): f is string => typeof f === "string").map((f) => FIELD_LABELS[f] ?? f);
  return labels.length ? [`Campos modificados: ${labels.join(", ")}`] : [];
}
