// Pure helpers for the staff customers module (GET/PATCH /api/v1/customers, POST /customers/:id/notes).
import { describeError as describeCommonError, type ApiFailure } from "../commercial/helpers";

export type ContactValues = { name: string; email: string; phone: string; country: string };
export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

export const NAME_MAX = 120;
export const NOTE_MAX = 4000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,25}$/;

export function contactValues(item: {
  name: string;
  email: string;
  phone: string;
  country: string | null;
}): ContactValues {
  return { name: item.name, email: item.email, phone: item.phone, country: item.country ?? "" };
}

export function validateContact(values: ContactValues): ContactErrors {
  const errors: ContactErrors = {};
  const name = values.name.trim();
  if (name.length < 2) errors.name = "El nombre debe tener al menos 2 caracteres.";
  else if (name.length > NAME_MAX) errors.name = `El nombre admite máximo ${NAME_MAX} caracteres.`;
  const email = values.email.trim();
  if (!EMAIL.test(email) || email.length > 254)
    errors.email = "Escribe un correo válido, por ejemplo nombre@dominio.com.";
  const phone = values.phone.trim();
  if (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7)
    errors.phone = "Escribe un teléfono de al menos 7 dígitos (puede iniciar con +).";
  const country = values.country.trim();
  if (country && !/^[A-Za-z]{2}$/.test(country))
    errors.country = "Usa el código de país de 2 letras (CO, EC, PE…) o déjalo vacío.";
  return errors;
}

/** Only the fields that changed, normalised as the API expects; empty object = nothing to save. */
export function contactPatch(values: ContactValues, initial: ContactValues): Record<string, string | null> {
  const next = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    country: values.country.trim().toUpperCase(),
  };
  const before = {
    name: initial.name.trim(),
    email: initial.email.trim().toLowerCase(),
    phone: initial.phone.trim(),
    country: initial.country.trim().toUpperCase(),
  };
  const patch: Record<string, string | null> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[])
    if (next[key] !== before[key]) patch[key] = key === "country" && !next[key] ? null : next[key];
  return patch;
}

const ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_CUSTOMER: "Ese correo ya pertenece a otro cliente o cuenta. No se crean clientes duplicados.",
  CUSTOMER_HAS_ACCOUNT: "Este cliente tiene cuenta en el portal: su correo es el de acceso y no se cambia desde aquí.",
  STALE_UPDATE: "Otra persona modificó este cliente. Se recargó el perfil: revisa y vuelve a intentar.",
  NOT_FOUND: "El cliente ya no existe.",
};
const ERROR_FIELDS: Record<string, keyof ContactValues> = {
  DUPLICATE_CUSTOMER: "email",
  CUSTOMER_HAS_ACCOUNT: "email",
};

export function describeCustomerError(failure: ApiFailure): { code: string; message: string; field?: string } {
  const common = describeCommonError(failure);
  return {
    code: common.code,
    message: ERROR_MESSAGES[common.code] ?? common.message,
    field: ERROR_FIELDS[common.code],
  };
}

// Labels for the read-only history summaries -----------------------------------------------------------------------

const PAYMENT_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  VOIDED: "Anulado",
  ERROR: "Error",
  REFUNDED: "Reembolsado",
};
const PAYMENT_PROVIDER: Record<string, string> = { WOMPI: "Wompi", MANUAL: "Abono manual", SANDBOX_TEST: "Prueba" };
const PQRS_TYPE: Record<string, string> = {
  PETITION: "Petición",
  COMPLAINT: "Queja",
  CLAIM: "Reclamo",
  SUGGESTION: "Sugerencia",
};
const PQRS_STATUS: Record<string, string> = {
  RECEIVED: "Recibida",
  IN_REVIEW: "En revisión",
  WAITING_FOR_CUSTOMER: "Esperando al cliente",
  ANSWERED: "Respondida",
  CLOSED: "Cerrada",
};

export const paymentStatusLabel = (value: string) => PAYMENT_STATUS[value] ?? value;
export const paymentProviderLabel = (value: string) => PAYMENT_PROVIDER[value] ?? value;
export const pqrsTypeLabel = (value: string) => PQRS_TYPE[value] ?? value;
export const pqrsStatusLabel = (value: string) => PQRS_STATUS[value] ?? value;

/** "Mostrando 5 de 12" when the profile only carries the latest rows. */
export function latestCaption(shown: number, total: number): string {
  if (total === 0) return "Sin registros";
  return shown >= total ? `${total} en total` : `Mostrando las ${shown} más recientes de ${total}`;
}
