"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { useDialog } from "../use-dialog";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { formatDateTime } from "../commercial/helpers";
import { useCsrf } from "../commercial/use-commercial-data";
import {
  MODES,
  blankTransport,
  describeTransportError,
  modeLabel,
  statusLabel,
  summarizeTransportChanges,
  transportActionLabel,
  transportPayload,
  transportValues,
  validateTransport,
  type TransportErrors,
  type TransportStatus,
  type TransportValues,
} from "./helpers";

type TransportItem = {
  id: string;
  destinationId: string;
  mode: string;
  name: string;
  description: string | null;
  conditions: string | null;
  status: TransportStatus;
  updatedAt: string;
  destination?: { id: string; name: string } | null;
};
type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};
type Destination = { id: string; name: string };
type Mode = { type: "idle" } | { type: "create" } | { type: "edit"; item: TransportItem };

const PAGE_SIZE = 10;
const BASE = "/api/v1/catalog/transport-options";

export function TransportManager({ session }: Readonly<{ session: AdminSession }>) {
  const { confirm, dialog } = useDialog();
  const csrf = useCsrf(session.csrfToken);
  const prefix = useId();

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationsLoaded, setDestinationsLoaded] = useState(false);
  const [items, setItems] = useState<TransportItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [destinationFilter, setDestinationFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [values, setValues] = useState<TransportValues>(blankTransport());
  const [errors, setErrors] = useState<TransportErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ name: string; rows: AuditRow[] | null } | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusTarget = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);

  const editing = mode.type === "edit" ? mode.item : undefined;
  const fields: FieldDef[] = [
    ...(mode.type === "create"
      ? [
          {
            name: "destinationId",
            label: "Destino",
            type: "select" as const,
            required: true,
            options: [
              { value: "", label: "Elige un destino" },
              ...destinations.map((item) => ({ value: item.id, label: item.name })),
            ],
          },
        ]
      : []),
    {
      name: "mode",
      label: "Modo de transporte",
      type: "select",
      required: true,
      options: MODES.map((value) => ({ value, label: modeLabel(value) })),
    },
    { name: "name", label: "Nombre", required: true, maxLength: 120, wide: true },
    {
      name: "description",
      label: "Descripción",
      type: "textarea",
      maxLength: 2000,
      wide: true,
      hint: "Opcional. Máximo 2000 caracteres.",
    },
    {
      name: "conditions",
      label: "Condiciones",
      type: "textarea",
      maxLength: 2000,
      wide: true,
      hint: "Opcional: equipaje, horarios, restricciones. El precio no va aquí: se define en las tarifas del paquete.",
    },
  ];

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void requestJson("/api/v1/catalog/destinations", "GET").then((result) => {
        if (cancelled) return;
        if (Array.isArray(result.data)) setDestinations(result.data as Destination[]);
        setDestinationsLoaded(true);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (destinationFilter) query.set("destinationId", destinationFilter);
    if (modeFilter) query.set("mode", modeFilter);
    if (statusFilter) query.set("status", statusFilter);
    const result = await requestJson(`${BASE}?${query.toString()}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as { items?: TransportItem[]; total?: number; pages?: number } | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
    } else setLoadError(describeTransportError(result).message);
  }, [page, destinationFilter, modeFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (mode.type !== "idle") headingRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!focusTick) return;
    const target = focusTarget.current;
    if (target && target !== "summary") document.getElementById(`${prefix}-${target}`)?.focus();
    else summaryRef.current?.focus();
  }, [focusTick, prefix]);

  function requestFocus(target: string) {
    focusTarget.current = target;
    setFocusTick((tick) => tick + 1);
  }

  function openForm(next: Mode) {
    setNotice(null);
    setFailure(null);
    setErrors({});
    setFormError(null);
    setValues(
      next.type === "edit" ? transportValues(next.item) : blankTransport(destinationFilter || destinations[0]?.id),
    );
    setMode(next);
  }
  function closeForm() {
    setMode({ type: "idle" });
    setErrors({});
    setFormError(null);
    window.setTimeout(() => createRef.current?.focus(), 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode.type === "idle") return;
    const kind = mode.type === "edit" ? "edit" : "create";
    const found = validateTransport(values, kind);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Revisa los campos marcados.");
      requestFocus(fields.map((field) => field.name).find((name) => found[name]) ?? "summary");
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    const body = transportPayload(values, kind);
    const result = editing
      ? await requestJson(`${BASE}/${editing.id}`, "PATCH", { ...body, expectedUpdatedAt: editing.updatedAt }, csrf)
      : await requestJson(BASE, "POST", body, csrf);
    setSaving(false);
    if (!result.ok) {
      const described = describeTransportError(result);
      if (described.field) setErrors({ [described.field]: described.message });
      setFormError(described.message);
      requestFocus(described.field ?? "summary");
      if (described.code === "STALE_UPDATE" || result.status === 404) void load();
      return;
    }
    setNotice(editing ? "Opción de transporte guardada." : "Opción de transporte creada.");
    setFailure(null);
    closeForm();
    if (!editing && page !== 1) setPage(1);
    else await load();
  }

  async function transition(item: TransportItem, action: "activate" | "deactivate") {
    const activate = action === "activate";
    const accepted = await confirm(
      activate
        ? `¿Activar la opción "${item.name}"? Volverá a poder usarse en paquetes.`
        : `¿Desactivar la opción "${item.name}"? No se borra: queda inactiva y se puede activar de nuevo. Si un paquete publicado la usa, no se podrá desactivar.`,
      { confirmLabel: activate ? "Activar" : "Desactivar", danger: !activate },
    );
    if (!accepted) return;
    setNotice(null);
    setFailure(null);
    setBusyId(item.id);
    const result = await requestJson(
      `${BASE}/${item.id}/${action}`,
      "POST",
      { expectedUpdatedAt: item.updatedAt },
      csrf,
    );
    setBusyId(null);
    if (result.ok) setNotice(activate ? "Opción de transporte activada." : "Opción de transporte desactivada.");
    else setFailure(describeTransportError(result).message);
    if (result.ok || result.status === 409 || result.status === 404) await load();
  }

  async function showHistory(item: TransportItem) {
    setHistory({ name: item.name, rows: null });
    const result = await requestJson(`${BASE}/${item.id}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(null);
      setFailure("No se pudo consultar el historial.");
      return;
    }
    setHistory({ name: item.name, rows: result.data as AuditRow[] });
  }

  const formTitle = editing ? `Editar opción: ${editing.name}` : "Nueva opción de transporte";
  return (
    <div className="admin-users">
      {dialog}
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <div className="admin-section-heading">
          <div>
            <h2 id={`${prefix}-title`}>Opciones de transporte</h2>
            <p className="admin-hint">
              Cada opción pertenece a un destino y a un modo. No se borran: se desactivan. Los precios se definen en las
              tarifas de cada paquete.
            </p>
          </div>
          <button
            ref={createRef}
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => openForm({ type: "create" })}
          >
            Nueva opción
          </button>
        </div>
        <div role="status" className="admin-success admin-status-slot">
          {notice}
        </div>
        <div role="alert" className="admin-form-error admin-status-slot">
          {failure}
        </div>
        <div className="admin-form admin-transport-filters" role="group" aria-label="Filtros de transporte">
          <div className="admin-field">
            <label htmlFor={`${prefix}-f-destination`}>Destino</label>
            <select
              id={`${prefix}-f-destination`}
              value={destinationFilter}
              onChange={(event) => {
                setPage(1);
                setDestinationFilter(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {destinations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor={`${prefix}-f-mode`}>Modo</label>
            <select
              id={`${prefix}-f-mode`}
              value={modeFilter}
              onChange={(event) => {
                setPage(1);
                setModeFilter(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {modeLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor={`${prefix}-f-status`}>Estado</label>
            <select
              id={`${prefix}-f-status`}
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </div>
        </div>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {items.length ? (
          <div
            className="admin-table-wrap"
            role="region"
            aria-label="Tabla de opciones de transporte"
            aria-busy={loading}
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Modo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.name}
                      {item.description ? <p className="admin-hint">{item.description}</p> : null}
                    </td>
                    <td>{item.destination?.name ?? "—"}</td>
                    <td>{modeLabel(item.mode)}</td>
                    <td>
                      <span className={`admin-badge admin-badge-${item.status === "active" ? "approved" : "inactive"}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => openForm({ type: "edit", item })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`${item.status === "active" ? "Desactivar" : "Activar"} ${item.name}`}
                          disabled={busyId !== null}
                          onClick={() => void transition(item, item.status === "active" ? "deactivate" : "activate")}
                        >
                          {item.status === "active" ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Historial de ${item.name}`}
                          onClick={() => void showHistory(item)}
                        >
                          Historial
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">{loading ? "Cargando…" : "No hay opciones de transporte para esos filtros."}</p>
        )}
        <nav className="admin-pagination" aria-label="Paginación de opciones de transporte">
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Anterior
          </button>
          <span>
            Página {page} de {meta.pages} · {meta.total} {meta.total === 1 ? "registro" : "registros"}
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
      {mode.type !== "idle" ? (
        <section className="admin-panel" aria-labelledby={`${prefix}-form-title`}>
          <h2 id={`${prefix}-form-title`} ref={headingRef} tabIndex={-1}>
            {formTitle}
          </h2>
          <p className="admin-hint">
            {editing ? `Destino: ${editing.destination?.name ?? "—"} (no se puede cambiar). ` : ""}
            Los campos con * son obligatorios.
          </p>
          {formError ? (
            <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
              {formError}
            </p>
          ) : null}
          <form className="admin-form admin-commercial-form" noValidate onSubmit={(event) => void submit(event)}>
            <FormFields
              prefix={prefix}
              fields={fields}
              values={values}
              errors={errors}
              onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
            />
            <div className="admin-form-actions">
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={saving || (mode.type === "create" && !destinationsLoaded)}
              >
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear opción"}
              </button>
              <button type="button" className="admin-btn admin-btn-quiet" onClick={closeForm}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {history ? (
        <section className="admin-panel" aria-live="polite" aria-labelledby={`${prefix}-history`}>
          <div className="admin-section-heading">
            <h2 id={`${prefix}-history`}>Historial: {history.name}</h2>
            <button type="button" className="admin-btn admin-btn-quiet" onClick={() => setHistory(null)}>
              Cerrar historial
            </button>
          </div>
          {history.rows === null ? (
            <p className="admin-empty">Cargando historial…</p>
          ) : history.rows.length ? (
            <ol className="admin-activity">
              {history.rows.map((row) => {
                const changes = summarizeTransportChanges(row);
                return (
                  <li key={row.id}>
                    <strong>{transportActionLabel(row.action)}</strong>
                    <br />
                    <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                    <span className="admin-hint"> · Actor: {row.actorId ?? "Sistema"}</span>
                    {changes.length ? (
                      <ul className="admin-history-changes">
                        {changes.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="admin-empty">No hay cambios registrados.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
