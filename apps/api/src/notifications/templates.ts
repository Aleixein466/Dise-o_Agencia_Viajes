export const NOTIFICATION_KINDS = [
  "quote.received",
  "quote.proposal_ready",
  "quote.status_changed",
  "reservation.requested",
  "reservation.status_changed",
  "reservation.confirmed",
  "payment.approved",
  "savings.installment_reminder",
  "pqrs.received",
  "pqrs.answered",
  "pqrs.status_changed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Rendered = { subject: string; text: string; html: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  NEW: "Recibida",
  IN_REVIEW: "En revisión",
  PROPOSAL_SENT: "Propuesta enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "No aceptada",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
  REQUESTED: "Solicitada",
  PENDING_PAYMENT: "Pendiente de pago",
  PARTIALLY_PAID: "Pago parcial",
  CONFIRMED: "Confirmada",
  COMPLETED: "Finalizada",
  RECEIVED: "Recibida",
  WAITING_FOR_CUSTOMER: "Esperando tu respuesta",
  ANSWERED: "Respondida",
  CLOSED: "Cerrada",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function str(data: Record<string, unknown>, key: string, max = 120): string | undefined {
  const value = data[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, max);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function money(cents: string | undefined, currency = "COP"): string | undefined {
  if (cents === undefined || !/^-?\d{1,18}$/.test(cents)) return undefined;
  const whole = Number(BigInt(cents) / 100n);
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(whole);
  } catch {
    return `${whole} ${currency}`;
  }
}

function dateLabel(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

type Spec = { subject: string; lines: string[]; path: string };

function link(base: string, path: string, resourceId: string | undefined): string {
  const origin = base.replace(/\/+$/, "");
  return `${origin}${path}${resourceId && UUID.test(resourceId) ? `/${resourceId}` : ""}`;
}

function spec(kind: NotificationKind, data: Record<string, unknown>): Spec {
  const reference = str(data, "reference", 40);
  const ref = reference ? ` (${reference})` : "";
  const status = str(data, "status", 40);
  const statusLabel = status ? (STATUS_LABELS[status] ?? status) : undefined;
  switch (kind) {
    case "quote.received":
      return {
        subject: `Recibimos tu solicitud de cotización${ref}`,
        lines: ["Recibimos tu solicitud de cotización. Un asesor la revisará y se pondrá en contacto contigo."],
        path: "/mi-cuenta/solicitudes",
      };
    case "quote.proposal_ready":
      return {
        subject: `Tu propuesta de viaje está lista${ref}`,
        lines: ["Ya tienes una propuesta de viaje disponible. Puedes revisarla en tu cuenta."],
        path: "/mi-cuenta/solicitudes",
      };
    case "quote.status_changed":
      return {
        subject: `Actualización de tu cotización${ref}`,
        lines: [`El estado de tu cotización cambió${statusLabel ? ` a: ${statusLabel}` : ""}.`],
        path: "/mi-cuenta/solicitudes",
      };
    case "reservation.requested":
      return {
        subject: `Recibimos tu solicitud de reserva${ref}`,
        lines: ["Recibimos tu solicitud de reserva. Te avisaremos cuando avance."],
        path: "/mi-cuenta/reservas",
      };
    case "reservation.status_changed":
      return {
        subject: `Actualización de tu reserva${ref}`,
        lines: [`El estado de tu reserva cambió${statusLabel ? ` a: ${statusLabel}` : ""}.`],
        path: "/mi-cuenta/reservas",
      };
    case "reservation.confirmed":
      return {
        subject: `Tu reserva está confirmada${ref}`,
        lines: ["Tu reserva quedó confirmada. Puedes consultar el detalle en tu cuenta."],
        path: "/mi-cuenta/reservas",
      };
    case "payment.approved": {
      const amount = money(str(data, "amountCents", 20), str(data, "currency", 3) ?? "COP");
      return {
        subject: `Registramos tu pago${ref}`,
        lines: [`Registramos tu pago${amount ? ` por ${amount}` : ""}. Gracias.`],
        path: "/mi-cuenta/reservas",
      };
    }
    case "savings.installment_reminder": {
      const amount = money(str(data, "amountCents", 20), str(data, "currency", 3) ?? "COP");
      const due = dateLabel(str(data, "dueOn", 10));
      const plan = str(data, "planName", 80);
      const sequence = str(data, "sequence", 4);
      return {
        subject: `Recordatorio de tu cuota de ahorro${sequence ? ` #${sequence}` : ""}`,
        lines: [
          `Te recordamos que tu cuota${sequence ? ` #${sequence}` : ""}${plan ? ` del plan "${plan}"` : ""}` +
            `${due ? ` vence el ${due}` : " vence pronto"}${amount ? ` (saldo de la cuota: ${amount})` : ""}.`,
          "Este mensaje es solo informativo.",
        ],
        path: "/mi-cuenta/ahorro",
      };
    }
    case "pqrs.received":
      return {
        subject: `Recibimos tu PQRS${ref}`,
        lines: ["Recibimos tu solicitud. Te responderemos dentro de los plazos legales."],
        path: "/pqrs",
      };
    // The answer itself is never put in the mail: the requester reads it with their reference and tracking code.
    case "pqrs.answered":
      return {
        subject: `Respondimos tu PQRS${ref}`,
        lines: [
          "Hay una nueva respuesta de la agencia. Consúltala con tu número de radicado y tu código de seguimiento.",
        ],
        path: "/pqrs",
      };
    case "pqrs.status_changed":
      return {
        subject: `Actualización de tu PQRS${ref}`,
        lines: [`El estado de tu PQRS cambió${statusLabel ? ` a: ${statusLabel}` : ""}.`],
        path: "/pqrs",
      };
  }
}

/** Returns null for an unknown kind so the dispatcher can mark the row SKIPPED. */
export function renderNotification(kind: string, data: unknown, webOrigin: string): Rendered | null {
  if (!(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return null;
  const record =
    data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const built = spec(kind as NotificationKind, record);
  const first = str(record, "firstName", 60);
  const greeting = first ? `Hola, ${first}:` : "Hola:";
  const reference = str(record, "reference", 40);
  const url = link(webOrigin, built.path, str(record, "resourceId", 40));
  const text = [
    greeting,
    "",
    ...built.lines,
    ...(reference ? [`Referencia: ${reference}`] : []),
    "",
    `Ver en tu cuenta: ${url}`,
    "",
    "Ricaurte Tours",
  ].join("\n");
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    built.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
    (reference ? `<p>Referencia: <strong>${escapeHtml(reference)}</strong></p>` : "") +
    `<p><a href="${escapeHtml(url)}">Ver en tu cuenta</a></p><p>Ricaurte Tours</p>`;
  return { subject: built.subject, text, html };
}
