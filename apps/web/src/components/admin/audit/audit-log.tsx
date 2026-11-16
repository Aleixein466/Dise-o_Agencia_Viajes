"use client";
import { Fragment, useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import {
  actorLabel,
  auditErrorMessage,
  buildAuditQuery,
  diffEntries,
  EMPTY_FILTERS,
  formatDateTime,
  hasContent,
  prettyJson,
  roleLabel,
  validateFilters,
  type AuditEvent,
  type AuditFilterErrors,
  type AuditFilters,
} from "./helpers";

type ListResponse = { items: AuditEvent[]; total: number; page: number; pages: number };
type Facets = { entities: string[]; actions: string[] };

function Snapshot({ before, after, details }: Readonly<{ before: unknown; after: unknown; details: unknown }>) {
  const entries = diffEntries(before, after);
  const noSnapshots = !hasContent(before) && !hasContent(after);
  return (
    <div className="admin-audit-detail">
      {noSnapshots ? (
        <p className="admin-hint">Este evento no guardó valores de antes y después.</p>
      ) : (
        <div className="admin-audit-diff" role="table" aria-label="Cambios del evento">
          <div className="admin-audit-diff-head" role="row">
            <span role="columnheader">Campo</span>
            <span role="columnheader">Antes</span>
            <span role="columnheader">Después</span>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.key}
              role="row"
              className={`admin-audit-diff-row${entry.changed ? " admin-audit-diff-changed" : ""}`}
            >
              <span role="rowheader" className="admin-audit-key">
                {entry.key}
                {entry.changed ? <span className="admin-audit-flag"> (cambió)</span> : null}
              </span>
              <pre role="cell" aria-label={`Antes: ${entry.key}`}>
                {entry.hasBefore ? prettyJson(entry.before) : "—"}
              </pre>
              <pre role="cell" aria-label={`Después: ${entry.key}`}>
                {entry.hasAfter ? prettyJson(entry.after) : "—"}
              </pre>
            </div>
          ))}
        </div>
      )}
      {hasContent(details) ? (
        <>
          <h4>Detalles</h4>
          <pre className="admin-audit-json">{prettyJson(details)}</pre>
        </>
      ) : null}
    </div>
  );
}

export function AuditLog() {
  const prefix = useId();
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [errors, setErrors] = useState<AuditFilterErrors>({});
  const [facets, setFacets] = useState<Facets>({ entities: [], actions: [] });
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const result = await requestJson(`/api/v1/admin/audit?${buildAuditQuery(applied, page)}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as Partial<ListResponse> | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
      setExpanded(null);
    } else {
      setItems([]);
      setLoadError(auditErrorMessage(result.status));
    }
  }, [applied, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    void requestJson("/api/v1/admin/audit/facets", "GET").then((result) => {
      const data = result.data as Partial<Facets> | null;
      if (active && result.ok && data && Array.isArray(data.entities) && Array.isArray(data.actions))
        setFacets({ entities: data.entities, actions: data.actions });
    });
    return () => {
      active = false;
    };
  }, []);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateFilters(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPage(1);
    setApplied(draft);
  }
  function clear() {
    setErrors({});
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  }
  const set = (name: keyof AuditFilters) => (value: string) => setDraft((current) => ({ ...current, [name]: value }));

  function field(name: keyof AuditFilters, label: string, input: (id: string, props: object) => React.ReactNode) {
    const id = `${prefix}-${name}`;
    const error = errors[name];
    return (
      <div className="admin-field">
        <label htmlFor={id}>{label}</label>
        {input(id, {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${id}-error` : undefined,
        })}
        {error ? (
          <p id={`${id}-error`} className="admin-field-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const status = loading
    ? "Cargando eventos…"
    : loadError
      ? "No se pudo cargar la auditoría."
      : `${meta.total} ${meta.total === 1 ? "evento" : "eventos"} · página ${page} de ${meta.pages}`;

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <div className="admin-section-heading">
          <div>
            <h2 id={`${prefix}-title`}>Registro de auditoría</h2>
            <p className="admin-hint">
              Solo lectura, del más reciente al más antiguo. Las fechas se muestran en hora de Colombia. Los datos
              sensibles aparecen como {"[oculto]"}.
            </p>
          </div>
        </div>
        <form
          className="admin-form admin-audit-filters"
          role="search"
          aria-label="Filtros de auditoría"
          noValidate
          onSubmit={apply}
        >
          {field("entity", "Entidad", (id, props) => (
            <select id={id} value={draft.entity} onChange={(e) => set("entity")(e.target.value)} {...props}>
              <option value="">Todas</option>
              {facets.entities.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          ))}
          {field("action", "Acción (prefijo)", (id, props) => (
            <>
              <input
                id={id}
                list={`${id}-list`}
                value={draft.action}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => set("action")(e.target.value)}
                {...props}
              />
              <datalist id={`${id}-list`}>
                {facets.actions.map((action) => (
                  <option key={action} value={action} />
                ))}
              </datalist>
            </>
          ))}
          {field("actorId", "Actor (ID)", (id, props) => (
            <input
              id={id}
              value={draft.actorId}
              maxLength={36}
              autoComplete="off"
              onChange={(e) => set("actorId")(e.target.value)}
              {...props}
            />
          ))}
          {field("entityId", "ID de la entidad", (id, props) => (
            <input
              id={id}
              value={draft.entityId}
              maxLength={120}
              autoComplete="off"
              onChange={(e) => set("entityId")(e.target.value)}
              {...props}
            />
          ))}
          {field("from", "Desde", (id, props) => (
            <input id={id} type="date" value={draft.from} onChange={(e) => set("from")(e.target.value)} {...props} />
          ))}
          {field("to", "Hasta", (id, props) => (
            <input id={id} type="date" value={draft.to} onChange={(e) => set("to")(e.target.value)} {...props} />
          ))}
          <div className="admin-form-actions admin-audit-actions">
            <button type="submit" className="admin-btn admin-btn-primary">
              Aplicar filtros
            </button>
            <button type="button" className="admin-btn admin-btn-quiet" onClick={clear}>
              Limpiar
            </button>
          </div>
        </form>
        <p role="status" aria-live="polite" className="admin-hint admin-audit-status">
          {status}
        </p>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {items.length ? (
          <div
            className="admin-table-wrap"
            role="region"
            aria-label="Tabla de eventos de auditoría"
            aria-busy={loading}
            tabIndex={0}
          >
            <table className="admin-table admin-audit-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Entidad</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Rol</th>
                  <th scope="col">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => {
                  const open = expanded === event.id;
                  const panelId = `${prefix}-detail-${event.id}`;
                  return (
                    <Fragment key={event.id}>
                      <tr>
                        <td>
                          <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                        </td>
                        <td>{event.action}</td>
                        <td>
                          {event.entity}
                          <br />
                          <span className="admin-audit-id">{event.entityId}</span>
                        </td>
                        <td>{actorLabel(event)}</td>
                        <td>{roleLabel(event.actorRole)}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-link-button"
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            aria-label={`${open ? "Ocultar" : "Ver"} detalle de ${event.action} ${event.entityId}`}
                            onClick={() => setExpanded(open ? null : event.id)}
                          >
                            {open ? "Ocultar" : "Ver detalle"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="admin-audit-detail-row">
                          <td colSpan={6} id={panelId}>
                            <Snapshot before={event.before} after={event.after} details={event.details} />
                            {event.requestId ? <p className="admin-hint">Solicitud: {event.requestId}</p> : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">
            {loading ? "Cargando…" : loadError ? "" : "No hay eventos de auditoría para esos filtros."}
          </p>
        )}
        <nav className="admin-pagination" aria-label="Paginación de auditoría">
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Anterior
          </button>
          <span>
            Página {page} de {meta.pages} · {meta.total} {meta.total === 1 ? "evento" : "eventos"}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={page >= meta.pages || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente
          </button>
        </nav>
      </section>
    </div>
  );
}
