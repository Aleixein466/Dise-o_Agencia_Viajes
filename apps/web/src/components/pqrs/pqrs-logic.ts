export const PQRS_TYPES = ["PETITION", "COMPLAINT", "CLAIM", "SUGGESTION"] as const;
export type PqrsType = (typeof PQRS_TYPES)[number];

export const PQRS_STATUSES = ["RECEIVED", "IN_REVIEW", "WAITING_FOR_CUSTOMER", "ANSWERED", "CLOSED"] as const;
export type PqrsStatus = (typeof PQRS_STATUSES)[number];

const TYPE_LABELS: Record<PqrsType, string> = {
  PETITION: "Petición",
  COMPLAINT: "Queja",
  CLAIM: "Reclamo",
  SUGGESTION: "Sugerencia",
};

const STATUS_LABELS: Record<PqrsStatus, string> = {
  RECEIVED: "Recibida",
  IN_REVIEW: "En revisión",
  WAITING_FOR_CUSTOMER: "Esperando tu respuesta",
  ANSWERED: "Respondida",
  CLOSED: "Cerrada",
};

const TRANSITIONS: Record<PqrsStatus, readonly PqrsStatus[]> = {
  RECEIVED: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_FOR_CUSTOMER", "ANSWERED"],
  WAITING_FOR_CUSTOMER: ["IN_REVIEW"],
  ANSWERED: ["IN_REVIEW", "CLOSED"],
  CLOSED: [],
};

export const pqrsTypeLabel = (type: string): string => (TYPE_LABELS as Record<string, string>)[type] ?? type;
export const pqrsStatusLabel = (status: string): string =>
  (STATUS_LABELS as Record<string, string>)[status] ?? "Estado en revisión";

export function allowedTransitions(status: string): readonly PqrsStatus[] {
  return (TRANSITIONS as Record<string, readonly PqrsStatus[]>)[status] ?? [];
}

export const canReceiveMessages = (status: string): boolean => status !== "CLOSED";

export const PQRS_UNAVAILABLE =
  "La radicación de PQRS aún no está habilitada. Mientras tanto, escríbenos por los canales oficiales.";

export function pqrsErrorMessage(status: number, data: unknown, fallback: string): string {
  if (status === 503) return PQRS_UNAVAILABLE;
  if (status === 0) return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (status === 429) return "Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.";
  if (status === 401 || status === 403) return "Tu sesión expiró o no tienes permiso para esta acción.";
  const message = (data as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

export type PqrsMessage = {
  id?: string;
  author: "AGENCY" | "REQUESTER";
  internal?: boolean;
  authorName?: string;
  message: string;
  createdAt: string;
};

export type PqrsTicket = {
  id?: string;
  reference: string;
  type: string;
  status: string;
  subject: string;
  createdAt: string;
  responseDueAt: string | null;
  messages: PqrsMessage[];
};

export function normalizeTicket(data: unknown): PqrsTicket | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<PqrsTicket>;
  if (typeof raw.reference !== "string" || typeof raw.status !== "string") return null;
  return {
    ...(raw as PqrsTicket),
    responseDueAt: typeof raw.responseDueAt === "string" ? raw.responseDueAt : null,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  };
}

const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});
const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

function formatWith(format: Intl.DateTimeFormat, value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format.format(date);
}
export const formatDateTime = (value: string | null | undefined) => formatWith(dateTimeFormat, value);
export const formatDate = (value: string | null | undefined) => formatWith(dateFormat, value);

export type IntakeInput = {
  type: string;
  subject: string;
  description: string;
  name?: string;
  email?: string;
  phone?: string;
};

/** Spanish error per invalid field (contract limits); empty object when valid. */
export function validateIntake(input: IntakeInput, requireContact: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(PQRS_TYPES as readonly string[]).includes(input.type)) errors.type = "Elige el tipo de PQRS.";
  const subject = input.subject.trim();
  if (subject.length < 5 || subject.length > 160) errors.subject = "El asunto debe tener entre 5 y 160 caracteres.";
  const description = input.description.trim();
  if (description.length < 20 || description.length > 5000)
    errors.description = "La descripción debe tener entre 20 y 5000 caracteres.";
  if (requireContact) {
    const name = (input.name ?? "").trim();
    if (name.length < 2 || name.length > 120) errors.name = "Escribe tu nombre (2 a 120 caracteres).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((input.email ?? "").trim())) errors.email = "Escribe un correo válido.";
    const phone = (input.phone ?? "").trim();
    if (phone && (phone.length < 7 || phone.length > 25))
      errors.phone = "El teléfono debe tener entre 7 y 25 caracteres.";
  }
  return errors;
}

export function validateMessage(text: string): string | null {
  const length = text.trim().length;
  return length < 2 || length > 5000 ? "El mensaje debe tener entre 2 y 5000 caracteres." : null;
}
