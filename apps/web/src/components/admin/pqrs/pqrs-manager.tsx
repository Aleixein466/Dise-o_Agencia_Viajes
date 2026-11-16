"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useReveal } from "../use-reveal";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/nav";
import type { AdminSession } from "@/lib/auth/types";
import {
  PQRS_STATUSES,
  allowedTransitions,
  formatDate,
  formatDateTime,
  pqrsErrorMessage,
  pqrsStatusLabel,
  pqrsTypeLabel,
  validateMessage,
} from "@/components/pqrs/pqrs-logic";

const API = "/api/v1/pqrs";

type Person = { id: string; displayName: string };
type Row = {
  id: string;
  reference: string;
  type: string;
  status: string;
  subject: string;
  requesterName: string;
  assignedTo: Person | null;
  createdAt: string;
  responseDueAt: string;
  overdue: boolean;
};
type AdminMessage = {
  id: string;
  author: "AGENCY" | "REQUESTER";
  internal: boolean;
  authorName: string;
  message: string;
  createdAt: string;
};
type Detail = Row & {
  requesterEmail: string;
  requesterPhone: string | null;
  version: number;
  messages: AdminMessage[];
  assignableStaff: Person[];
};
type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeLine({ notice }: Readonly<{ notice: Notice }>) {
  return (
    <div aria-live="polite" role="status">
      {notice ? <p className={notice.kind === "error" ? "admin-form-error" : "admin-hint"}>{notice.text}</p> : null}
    </div>
  );
}

function DetailPanel({
  id,
  canRespond,
  csrf,
  onChanged,
}: Readonly<{ id: string; canRespond: boolean; csrf: string; onChanged: () => void }>) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [nextStatus, setNextStatus] = useState("");

  const load = useCallback(async () => {
    const result = await requestJson(`${API}/${encodeURIComponent(id)}`, "GET");
    if (result.ok && result.data) {
      setDetail(result.data as Detail);
      setLoadError(null);
    } else setLoadError(pqrsErrorMessage(result.status, result.data, "No se pudo cargar la PQRS."));
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function run(path: string, body: unknown, okText: string, after?: () => void) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const result = await requestJson(`${API}/${encodeURIComponent(id)}/${path}`, "POST", body, csrf);
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: okText });
      after?.();
    } else
      setNotice({
        kind: "error",
        text: pqrsErrorMessage(result.status, result.data, "No se pudo completar la acción."),
      });
    await load();
    if (result.ok) onChanged();
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const problem = validateMessage(message);
    if (problem) return setNotice({ kind: "error", text: problem });
    const sent = message;
    void run(
      "messages",
      { message: sent.trim(), internal },
      internal ? "Nota interna guardada." : "Respuesta enviada al solicitante.",
      // Keep anything typed while the request was in flight.
      () => setMessage((current) => (current === sent ? "" : current)),
    );
  }

  if (loadError) {
    return (
      <p className="admin-form-error" role="alert">
        {loadError}
      </p>
    );
  }
  if (!detail) return <p role="status">Cargando PQRS…</p>;

  const transitions = allowedTransitions(detail.status);
  const closed = detail.status === "CLOSED";
  return (
    <section className="admin-panel" aria-labelledby="pqrs-detail-title">
      <h2 id="pqrs-detail-title">
        {detail.reference} · {detail.subject}
      </h2>
      <NoticeLine notice={notice} />
      <p className="admin-hint">
        {pqrsTypeLabel(detail.type)} · {pqrsStatusLabel(detail.status)} · Solicitante: {detail.requesterName} (
        {detail.requesterEmail}
        {detail.requesterPhone ? ` · ${detail.requesterPhone}` : ""}) · Vence: {formatDate(detail.responseDueAt)}
        {detail.overdue ? " · Vencida" : ""}
      </p>

      {canRespond ? (
        <div className="admin-form">
          <label className="admin-field">
            Asignado a
            <select
              value={detail.assignedTo?.id ?? ""}
              disabled={pending || closed}
              onChange={(event) =>
                void run("assign", { assigneeId: event.target.value || null }, "Asignación actualizada.")
              }
            >
              <option value="">Sin asignar</option>
              {detail.assignableStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </label>
          {transitions.length > 0 ? (
            <>
              <label className="admin-field">
                Cambiar estado a
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                  <option value="">Selecciona un estado</option>
                  {transitions.map((status) => (
                    <option key={status} value={status}>
                      {pqrsStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={pending || !nextStatus}
                onClick={() =>
                  void run(
                    "status",
                    { status: nextStatus, expectedVersion: detail.version },
                    "Estado actualizado.",
                    () => setNextStatus(""),
                  )
                }
              >
                Actualizar estado
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <h3>Mensajes</h3>
      {detail.messages.length === 0 ? <p className="admin-empty">Aún no hay mensajes.</p> : null}
      <ul>
        {detail.messages.map((item) => (
          <li key={item.id} style={{ marginBottom: "0.75rem", overflowWrap: "anywhere" }}>
            <p className="admin-hint">
              {item.authorName || (item.author === "AGENCY" ? "Agencia" : "Solicitante")} ·{" "}
              {formatDateTime(item.createdAt)}
              {item.internal ? " · Nota interna" : ""}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
          </li>
        ))}
      </ul>

      {canRespond && !closed ? (
        <form className="admin-form" onSubmit={sendMessage} noValidate>
          <label className="admin-field">
            Mensaje
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={5000} />
          </label>
          <label className="admin-field">
            <span>
              <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Nota
              interna (no la ve el solicitante)
            </span>
          </label>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={pending}>
            {internal ? "Guardar nota interna" : "Enviar respuesta"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function PqrsManager({ session }: Readonly<{ session: AdminSession }>) {
  const canRespond = hasPermission(session.permissions, "pqrs:respond");
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [items, setItems] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const detailRegion = useReveal<HTMLDivElement>(selected);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (overdue) params.set("overdue", "true");
    const result = await requestJson(`${API}?${params.toString()}`, "GET");
    if (result.ok) {
      const data = result.data as { items?: Row[]; total?: number } | null;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
      setLoadError(null);
    } else setLoadError(pqrsErrorMessage(result.status, result.data, "No se pudo cargar la bandeja de PQRS."));
  }, [page, status, overdue]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby="pqrs-inbox-title">
        <h2 id="pqrs-inbox-title">Bandeja de PQRS</h2>
        <label className="admin-field">
          Estado
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {PQRS_STATUSES.map((item) => (
              <option key={item} value={item}>
                {pqrsStatusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => {
                setOverdue(event.target.checked);
                setPage(1);
              }}
            />{" "}
            Solo vencidas
          </span>
        </label>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {items && items.length === 0 ? <p className="admin-empty">No hay PQRS para este filtro.</p> : null}
        {items && items.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Tipo</th>
                  <th>Asunto</th>
                  <th>Solicitante</th>
                  <th>Estado</th>
                  <th>Asignado a</th>
                  <th>Vence</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.reference}</td>
                    <td>{pqrsTypeLabel(row.type)}</td>
                    <td>{row.subject}</td>
                    <td>{row.requesterName}</td>
                    <td>
                      <span className="admin-role">{pqrsStatusLabel(row.status)}</span>
                    </td>
                    <td>{row.assignedTo?.displayName ?? "Sin asignar"}</td>
                    <td>
                      {formatDate(row.responseDueAt)}
                      {row.overdue ? <span className="admin-role"> Vencida</span> : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn-quiet"
                        aria-pressed={selected === row.id}
                        onClick={() => setSelected(row.id)}
                      >
                        Ver detalle<span className="sr-only"> de {row.reference}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {total > 25 ? (
          <div role="group" aria-label="Paginación" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="admin-btn admin-btn-quiet"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {pages}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-quiet"
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </section>
      {selected ? (
        <div ref={detailRegion} tabIndex={-1} className="admin-reveal">
          <DetailPanel key={selected} id={selected} canRespond={canRespond} csrf={csrf} onChanged={() => void load()} />
        </div>
      ) : null}
    </div>
  );
}
