"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useReveal } from "./use-reveal";
import { formatCop } from "@/components/public/money";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { reservationStatusLabel } from "./reservation-status";
import { QUOTE_STATUSES, actionLabel, selectableNextStatuses, statusLabel } from "./crm-status";

type Person = { id: string; name: string };
type Stats = { byStatus: Record<string, number>; unassigned: number; last7Days: number };
type Row = {
  id: string;
  reference: string;
  status: string;
  source: string;
  packageName: string | null;
  destinationName: string | null;
  travelers: number;
  travelDate: string | null;
  totalCents: string | null;
  createdAt: string;
  assignee: Person | null;
};
type Page = { items: Row[]; total: number; page: number; pageSize: number; pages: number };
type Detail = {
  id: string;
  reference: string;
  status: string;
  revision: number;
  source: string;
  packageName: string | null;
  destinationName: string | null;
  adults: number;
  children: number;
  travelDate: string | null;
  totalCents: string | null;
  reviewReasons: string[];
  lines: Array<{ description: string; quantity: number; unitPriceCents: string; totalCents: string }>;
  contact: { name: string; email: string; phone: string | null } | null;
  contactHidden: boolean;
  reservation?: { id: string; code: string; status: string } | null;
  notes: string | null;
  assignee: Person | null;
  assignments: Array<{ advisor: Person; assignedAt: string; unassignedAt: string | null }>;
  crmNotes: Array<{ id: string; body: string; author: Person; createdAt: string }>;
  history: Array<{ action: string; actor: Person | null; createdAt: string }>;
};

const PAGE_SIZE = 20;
const CONFLICT_MESSAGE = "La solicitud cambió; se recargó la información";
const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("es-CO", { dateStyle: "medium", timeZone: "UTC" }) : "—";
const money = (value: string | null) => formatCop(value) ?? "Revisión manual";

export function CrmManager({
  session,
  initialId = null,
}: Readonly<{ session: AdminSession; initialId?: string | null }>) {
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [stats, setStats] = useState<Stats | null>(null);
  const [advisors, setAdvisors] = useState<Person[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [source, setSource] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const detailHeading = useReveal<HTMLHeadingElement>(selectedId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [advisorId, setAdvisorId] = useState("");
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const loadStats = useCallback(async () => {
    const result = await requestJson("/api/v1/crm/stats", "GET");
    if (result.ok) setStats(result.data as Stats);
  }, []);
  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (source) params.set("source", source);
    if (query) params.set("q", query);
    const result = await requestJson(`/api/v1/crm/requests?${params.toString()}`, "GET");
    if (result.ok) {
      setPage(result.data as Page);
      setLoadError(false);
    } else setLoadError(true);
  }, [pageNumber, status, assigneeId, source, query]);
  const loadDetail = useCallback(async (id: string) => {
    const result = await requestJson(`/api/v1/crm/requests/${id}`, "GET");
    if (result.ok) {
      setDetail(result.data as Detail);
      setError(null);
    } else {
      setDetail(null);
      setError("No se pudo cargar la solicitud.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStats();
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
      void requestJson("/api/v1/crm/advisors", "GET").then((result) => {
        if (result.ok && Array.isArray(result.data)) setAdvisors(result.data as Person[]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStats]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedId), 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadDetail]);

  async function refreshAll(id: string) {
    await Promise.all([loadDetail(id), loadList(), loadStats()]);
  }

  function select(id: string) {
    setSelectedId(id);
    setDetail(null);
    setMessage(null);
    setError(null);
    setAdvisorId("");
    setReason("");
    setNextStatus("");
    setNoteBody("");
  }

  async function mutate(path: string, body: unknown, success: string, bumpsRevision: boolean) {
    if (!detail || pending) return;
    setPending(true);
    setMessage(null);
    setError(null);
    const result = await requestJson(`/api/v1/crm/requests/${detail.id}/${path}`, "POST", body, csrf);
    if (result.ok) {
      setMessage(success);
      await refreshAll(detail.id);
      if (bumpsRevision) {
        setAdvisorId("");
        setReason("");
        setNextStatus("");
      }
    } else if (result.status === 409) {
      setError(CONFLICT_MESSAGE);
      await refreshAll(detail.id);
    } else {
      const apiMessage = (result.data as { message?: unknown } | null)?.message;
      setError(typeof apiMessage === "string" ? apiMessage : "No se pudo completar la acción.");
    }
    setPending(false);
  }

  function assign(event: FormEvent) {
    event.preventDefault();
    if (!detail || !advisorId) return;
    void mutate(
      "assign",
      { advisorId, expectedRevision: detail.revision, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      "Solicitud asignada.",
      true,
    );
  }
  function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (!detail || !nextStatus) return;
    void mutate("status", { status: nextStatus, expectedRevision: detail.revision }, "Estado actualizado.", true);
  }
  async function addNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!detail || !body) return;
    await mutate("notes", { body }, "Nota agregada.", false);
    setNoteBody("");
  }
  function applySearch(event: FormEvent) {
    event.preventDefault();
    setPageNumber(1);
    setQuery(queryDraft.trim());
  }

  const nextOptions = detail ? selectableNextStatuses(detail.status) : [];
  const filterStyle = { gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby="crm-stats-title">
        <h2 id="crm-stats-title">Resumen</h2>
        {stats ? (
          <div className="admin-grid">
            {QUOTE_STATUSES.filter((value) => value !== "DRAFT").map((value) => (
              <p key={value} className="admin-hint">
                {statusLabel(value)}: <strong>{stats.byStatus[value] ?? 0}</strong>
              </p>
            ))}
            <p className="admin-hint">
              Sin asignar: <strong>{stats.unassigned}</strong>
            </p>
            <p className="admin-hint">
              Últimos 7 días: <strong>{stats.last7Days}</strong>
            </p>
          </div>
        ) : (
          <p className="admin-empty">Cargando resumen…</p>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="crm-list-title">
        <h2 id="crm-list-title">Solicitudes</h2>
        <form className="admin-users-filters" style={filterStyle} onSubmit={applySearch} role="search">
          <label className="admin-field">
            Estado
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPageNumber(1);
              }}
            >
              <option value="">Todos</option>
              {QUOTE_STATUSES.filter((value) => value !== "DRAFT").map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Filtrar por asesor
            <select
              value={assigneeId}
              onChange={(event) => {
                setAssigneeId(event.target.value);
                setPageNumber(1);
              }}
            >
              <option value="">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>
                  {advisor.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Origen
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setPageNumber(1);
              }}
            >
              <option value="">Todos</option>
              <option value="PUBLIC">Público</option>
              <option value="ADMIN">Administrativo</option>
            </select>
          </label>
          <label className="admin-field">
            Referencia
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Buscar por referencia"
            />
          </label>
          <button className="admin-btn admin-btn-primary" type="submit" style={{ alignSelf: "end" }}>
            Buscar
          </button>
        </form>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            No se pudo cargar la lista de solicitudes.
          </p>
        ) : null}
        {page && page.items.length === 0 ? (
          <p className="admin-empty">No hay solicitudes que coincidan con los filtros.</p>
        ) : null}
        {page && page.items.length > 0 ? (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Estado</th>
                    <th>Paquete</th>
                    <th>Viajeros</th>
                    <th>Fecha de viaje</th>
                    <th>Total</th>
                    <th>Asesor</th>
                    <th>Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <tr key={row.id} aria-selected={row.id === selectedId}>
                      <td>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Ver solicitud ${row.reference}`}
                          aria-current={row.id === selectedId ? "true" : undefined}
                          onClick={() => select(row.id)}
                        >
                          {row.reference}
                        </button>
                      </td>
                      <td>
                        <span className="admin-role">{statusLabel(row.status)}</span>
                      </td>
                      <td>{row.packageName ?? row.destinationName ?? "—"}</td>
                      <td>{row.travelers}</td>
                      <td>{dateOnly(row.travelDate)}</td>
                      <td>{money(row.totalCents)}</td>
                      <td>{row.assignee?.name ?? "Sin asignar"}</td>
                      <td>{dateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-section-heading" style={{ marginTop: 12, marginBottom: 0, alignItems: "center" }}>
              <span className="admin-hint">
                Página {page.page} de {Math.max(page.pages, 1)} · {page.total} solicitudes
              </span>
              <span className="admin-row-actions" style={{ gridAutoFlow: "column" }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-quiet"
                  disabled={page.page <= 1}
                  onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-quiet"
                  disabled={page.page >= page.pages}
                  onClick={() => setPageNumber((value) => value + 1)}
                >
                  Siguiente
                </button>
              </span>
            </div>
          </>
        ) : null}
      </section>

      {selectedId ? (
        <section className="admin-panel" aria-labelledby="crm-detail-title">
          <div className="admin-section-heading">
            <h2 id="crm-detail-title" ref={detailHeading} tabIndex={-1}>
              {detail ? `Solicitud ${detail.reference}` : "Solicitud"}
            </h2>
            <button type="button" className="admin-btn admin-btn-quiet" onClick={() => setSelectedId(null)}>
              Cerrar
            </button>
          </div>
          <div aria-live="polite" role="status">
            {message ? <p className="admin-success">{message}</p> : null}
            {error ? <p className="admin-form-error">{error}</p> : null}
          </div>
          {!detail && !error ? <p className="admin-empty">Cargando solicitud…</p> : null}
          {detail ? (
            <div className="admin-users">
              <p>
                <span className="admin-role">{statusLabel(detail.status)}</span>{" "}
                {detail.packageName ?? detail.destinationName ?? "Sin paquete"} · {detail.adults} adultos,{" "}
                {detail.children} niños · Viaje: {dateOnly(detail.travelDate)} · Total: {money(detail.totalCents)}
              </p>

              {detail.reservation ? (
                <p>
                  <a href={`/admin/reservas?id=${encodeURIComponent(detail.reservation.id)}`}>
                    Reserva {detail.reservation.code} · {reservationStatusLabel(detail.reservation.status)}
                  </a>
                </p>
              ) : null}

              <div>
                <h3>Líneas</h3>
                {detail.lines.length ? (
                  <ul className="admin-activity">
                    {detail.lines.map((line, index) => (
                      <li key={`${line.description}-${index}`}>
                        {line.description} × {line.quantity}: {money(line.totalCents)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Sin líneas calculadas.</p>
                )}
                {detail.reviewReasons.length ? (
                  <>
                    <h3>Motivos de revisión</h3>
                    <ul className="admin-activity">
                      {detail.reviewReasons.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              <div>
                <h3>Contacto</h3>
                {detail.contact ? (
                  <p>
                    {detail.contact.name} · {detail.contact.email}
                    {detail.contact.phone ? ` · ${detail.contact.phone}` : ""}
                  </p>
                ) : (
                  <p className="admin-empty">Contacto oculto: requiere permiso customers:read</p>
                )}
                {detail.notes ? <p className="admin-hint">Comentarios del viajero: {detail.notes}</p> : null}
              </div>

              <div className="admin-grid">
                <form className="admin-form" onSubmit={assign}>
                  <h3>Asignar</h3>
                  <p className="admin-hint">Asesor actual: {detail.assignee?.name ?? "Sin asignar"}</p>
                  <label className="admin-field">
                    Asesor
                    <select
                      value={advisorId}
                      onChange={(event) => setAdvisorId(event.target.value)}
                      disabled={pending}
                      required
                    >
                      <option value="">Selecciona un asesor</option>
                      {advisors.map((advisor) => (
                        <option key={advisor.id} value={advisor.id}>
                          {advisor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    Motivo (opcional)
                    <input
                      value={reason}
                      maxLength={300}
                      onChange={(event) => setReason(event.target.value)}
                      disabled={pending}
                    />
                  </label>
                  <button className="admin-btn admin-btn-primary" type="submit" disabled={pending || !advisorId}>
                    Asignar
                  </button>
                </form>

                <form className="admin-form" onSubmit={changeStatus}>
                  <h3>Cambiar estado</h3>
                  {nextOptions.length ? (
                    <>
                      <label className="admin-field">
                        Nuevo estado
                        <select
                          value={nextStatus}
                          onChange={(event) => setNextStatus(event.target.value)}
                          disabled={pending}
                          required
                        >
                          <option value="">Selecciona un estado</option>
                          {nextOptions.map((value) => (
                            <option key={value} value={value}>
                              {statusLabel(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="admin-btn admin-btn-primary" type="submit" disabled={pending || !nextStatus}>
                        Cambiar estado
                      </button>
                    </>
                  ) : (
                    <p className="admin-empty">Este estado no tiene transiciones disponibles.</p>
                  )}
                </form>

                <form className="admin-form" onSubmit={(event) => void addNote(event)}>
                  <h3>Agregar nota</h3>
                  <label className="admin-field">
                    Nota interna
                    <textarea
                      value={noteBody}
                      maxLength={2000}
                      rows={4}
                      onChange={(event) => setNoteBody(event.target.value)}
                      disabled={pending}
                      required
                    />
                  </label>
                  <span className="admin-hint">{noteBody.length}/2000</span>
                  <button className="admin-btn admin-btn-primary" type="submit" disabled={pending || !noteBody.trim()}>
                    Agregar nota
                  </button>
                </form>
              </div>

              <div>
                <h3>Historial de asignaciones</h3>
                {detail.assignments.length ? (
                  <ul className="admin-activity">
                    {detail.assignments.map((item, index) => (
                      <li key={`${item.advisor.id}-${item.assignedAt}-${index}`}>
                        {item.advisor.name}
                        <br />
                        <time dateTime={item.assignedAt}>{dateTime(item.assignedAt)}</time>
                        {item.unassignedAt ? <> → {dateTime(item.unassignedAt)}</> : " (vigente)"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Sin asignaciones.</p>
                )}
              </div>

              <div>
                <h3>Notas</h3>
                {detail.crmNotes.length ? (
                  <ul className="admin-activity">
                    {detail.crmNotes.map((note) => (
                      <li key={note.id}>
                        <strong>{note.author.name}</strong>{" "}
                        <time dateTime={note.createdAt}>{dateTime(note.createdAt)}</time>
                        <br />
                        <span style={{ whiteSpace: "pre-wrap" }}>{note.body}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Sin notas.</p>
                )}
              </div>

              <div>
                <h3>Auditoría</h3>
                {detail.history.length ? (
                  <ul className="admin-activity">
                    {detail.history.map((entry, index) => (
                      <li key={`${entry.action}-${entry.createdAt}-${index}`}>
                        {actionLabel(entry.action)} · {entry.actor?.name ?? "Sistema"}
                        <br />
                        <time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Sin movimientos registrados.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
