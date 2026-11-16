import { formatDate, formatDateTime, pqrsStatusLabel, pqrsTypeLabel, type PqrsTicket } from "./pqrs-logic";

export function PqrsSummary({ ticket }: Readonly<{ ticket: PqrsTicket }>) {
  return (
    <dl className="pqrs-summary">
      <div>
        <dt>Referencia</dt>
        <dd>{ticket.reference}</dd>
      </div>
      <div>
        <dt>Tipo</dt>
        <dd>{pqrsTypeLabel(ticket.type)}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{pqrsStatusLabel(ticket.status)}</dd>
      </div>
      <div>
        <dt>Asunto</dt>
        <dd>{ticket.subject}</dd>
      </div>
      <div>
        <dt>Fecha de radicación</dt>
        <dd>{formatDateTime(ticket.createdAt)}</dd>
      </div>
      <div>
        <dt>Fecha límite de respuesta</dt>
        <dd>{formatDate(ticket.responseDueAt)}</dd>
      </div>
    </dl>
  );
}

export function PqrsMessages({ ticket }: Readonly<{ ticket: PqrsTicket }>) {
  if (ticket.messages.length === 0) return <p className="portal-meta">Aún no hay mensajes.</p>;
  return (
    <ul className="portal-cards">
      {ticket.messages.map((item, index) => (
        <li key={item.id ?? index} className="portal-card">
          <p className="portal-meta">
            <strong>{item.author === "AGENCY" ? "Ricaurte Tours" : "Tú"}</strong> · {formatDateTime(item.createdAt)}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p>
        </li>
      ))}
    </ul>
  );
}
