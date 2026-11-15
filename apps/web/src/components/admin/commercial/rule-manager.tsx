"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { requestJson } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/nav";
import type { AdminSession } from "@/lib/auth/types";
import { useDialog } from "../use-dialog";
import { FormFields, SCOPE_FIELDS, type FieldDef, type FieldOption } from "./form-fields";
import {
  actionLabel,
  describeError,
  formatDateTime,
  statusLabel,
  summarizeChanges,
  type AuditRow,
  type FieldErrors,
  type FormValues,
  type LifecycleStatus,
  type RuleKind,
  type ScopeKind,
} from "./helpers";
import { useCsrf, useScopeOptions } from "./use-commercial-data";

export type RuleItem = {
  id: string;
  name: string;
  status: LifecycleStatus;
  scope: ScopeKind;
  destinationId: string | null;
  packageId: string | null;
  updatedAt: string;
};

export type RuleConfig<T extends RuleItem> = {
  kind: RuleKind;
  title: string;
  singular: string;
  createLabel: string;
  intro: string;
  columns: { header: string; cell: (item: T) => ReactNode }[];
  fields: readonly FieldDef[];
  blank: () => FormValues;
  toValues: (item: T) => FormValues;
  validate: (values: FormValues, item?: T) => FieldErrors;
  payload: (values: FormValues) => Record<string, unknown>;
  /** Short identification used inside confirmation dialogs. */
  describe: (item: T) => string;
  approveImpact: (item: T) => string;
  deactivateImpact: (item: T) => string;
  messages: { created: string; updated: string; approved: string; deactivated: string };
};

type ListResponse<T> = { items: T[]; total: number; page: number; pages: number };
type Mode = { type: "idle" } | { type: "create" } | { type: "edit"; item: RuleItem };
const PAGE_SIZE = 10;

const withCurrent = (options: FieldOption[], current: string | undefined, label: string) =>
  current && !options.some((option) => option.value === current) ? [...options, { value: current, label }] : options;

export function RuleManager<T extends RuleItem>({
  session,
  config,
}: Readonly<{ session: AdminSession; config: RuleConfig<T> }>) {
  const { confirm, dialog } = useDialog();
  const csrf = useCsrf(session.csrfToken);
  const scopes = useScopeOptions();
  const canPublish = hasPermission(session.permissions, "catalog:publish");
  const prefix = useId();
  const base = `/api/v1/catalog/${config.kind}`;

  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FieldErrors>({});
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

  const fields: FieldDef[] = [
    ...config.fields,
    ...SCOPE_FIELDS(
      withCurrent(scopes.destinations, values.destinationId, "Destino actual"),
      withCurrent(scopes.packages, values.packageId, "Paquete actual"),
    ),
  ];

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) query.set("status", statusFilter);
    if (scopeFilter) query.set("scope", scopeFilter);
    if (search.trim()) query.set("q", search.trim().slice(0, 80));
    const result = await requestJson(`${base}?${query.toString()}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as Partial<ListResponse<T>> | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
    } else setLoadError(describeError(result).message);
  }, [base, page, statusFilter, scopeFilter, search]);

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
    setValues(next.type === "edit" ? config.toValues(next.item as T) : config.blank());
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
    const editing = mode.type === "edit" ? (mode.item as T) : undefined;
    const found = config.validate(values, editing);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Revisa los campos marcados.");
      const order = fields.map((field) => field.name);
      focusTarget.current = order.find((name) => found[name]) ?? "summary";
      setFocusTick((tick) => tick + 1);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    const body = config.payload(values);
    const result = editing
      ? await requestJson(`${base}/${editing.id}`, "PATCH", { ...body, expectedUpdatedAt: editing.updatedAt }, csrf)
      : await requestJson(base, "POST", body, csrf);
    setSaving(false);
    if (!result.ok) {
      const described = describeError(result, values);
      if (described.field) setErrors({ [described.field]: described.message });
      setFormError(described.message);
      requestFocus(described.field ?? "summary");
      if (described.code === "STALE_UPDATE" || result.status === 404) void load();
      return;
    }
    setNotice(editing ? config.messages.updated : config.messages.created);
    setFailure(null);
    closeForm();
    if (!editing && page !== 1) setPage(1);
    else await load();
  }

  async function transition(item: T, action: "approve" | "deactivate") {
    const approve = action === "approve";
    const accepted = await confirm(
      `${approve ? "¿Aprobar" : "¿Desactivar"} ${config.describe(item)}? ${
        approve ? config.approveImpact(item) : config.deactivateImpact(item)
      }`,
      { confirmLabel: approve ? "Aprobar" : "Desactivar", danger: !approve },
    );
    if (!accepted) return;
    setNotice(null);
    setFailure(null);
    setBusyId(item.id);
    const result = await requestJson(
      `${base}/${item.id}/${action}`,
      "POST",
      { expectedUpdatedAt: item.updatedAt },
      csrf,
    );
    setBusyId(null);
    if (result.ok) setNotice(approve ? config.messages.approved : config.messages.deactivated);
    else setFailure(describeError(result).message);
    if (result.ok || result.status === 409 || result.status === 404) await load();
  }

  async function showHistory(item: T) {
    setHistory({ name: item.name, rows: null });
    const result = await requestJson(`${base}/${item.id}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(null);
      setFailure("No se pudo consultar el historial.");
      return;
    }
    setHistory({ name: item.name, rows: result.data as AuditRow[] });
  }

  const formTitle = mode.type === "edit" ? `Editar borrador: ${mode.item.name}` : config.createLabel;
  return (
    <div className="admin-users">
      {dialog}
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <div className="admin-section-heading">
          <div>
            <h2 id={`${prefix}-title`}>{config.title}</h2>
            <p className="admin-hint">{config.intro}</p>
          </div>
          <button
            ref={createRef}
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => openForm({ type: "create" })}
          >
            {config.createLabel}
          </button>
        </div>
        <div role="status" className="admin-success admin-status-slot">
          {notice}
        </div>
        <div role="alert" className="admin-form-error admin-status-slot">
          {failure}
        </div>
        <div
          className="admin-form admin-commercial-filters"
          role="group"
          aria-label={`Filtros de ${config.title.toLowerCase()}`}
        >
          <div className="admin-field">
            <label htmlFor={`${prefix}-f-q`}>Buscar por nombre</label>
            <input
              id={`${prefix}-f-q`}
              type="search"
              value={search}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
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
              <option value="draft">Borrador</option>
              <option value="approved">Aprobada</option>
              <option value="inactive">Inactiva</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor={`${prefix}-f-scope`}>Alcance</label>
            <select
              id={`${prefix}-f-scope`}
              value={scopeFilter}
              onChange={(event) => {
                setPage(1);
                setScopeFilter(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="GLOBAL">Global</option>
              <option value="DESTINATION">Destino</option>
              <option value="PACKAGE">Paquete</option>
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
            aria-label={`Tabla de ${config.title.toLowerCase()}`}
            aria-busy={loading}
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.header} scope="col">
                      {column.header}
                    </th>
                  ))}
                  <th scope="col">Alcance</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {config.columns.map((column) => (
                      <td key={column.header}>{column.cell(item)}</td>
                    ))}
                    <td>{scopes.label(item)}</td>
                    <td>
                      <span className={`admin-badge admin-badge-${item.status}`}>{statusLabel(item.status)}</span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        {item.status === "draft" ? (
                          <button
                            type="button"
                            className="admin-link-button"
                            aria-label={`Editar ${item.name}`}
                            onClick={() => openForm({ type: "edit", item })}
                          >
                            Editar
                          </button>
                        ) : null}
                        {item.status === "draft" && canPublish ? (
                          <button
                            type="button"
                            className="admin-link-button"
                            aria-label={`Aprobar ${item.name}`}
                            disabled={busyId !== null}
                            onClick={() => void transition(item, "approve")}
                          >
                            Aprobar
                          </button>
                        ) : null}
                        {item.status === "approved" && canPublish ? (
                          <button
                            type="button"
                            className="admin-link-button"
                            aria-label={`Desactivar ${item.name}`}
                            disabled={busyId !== null}
                            onClick={() => void transition(item, "deactivate")}
                          >
                            Desactivar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Historial de ${item.name}`}
                          onClick={() => void showHistory(item)}
                        >
                          Historial
                        </button>
                        {item.status === "approved" ? (
                          <p className="admin-hint">
                            No se edita. Para cambiarla: desactivar y crear nueva
                            {canPublish ? "." : " (requiere permiso de publicación)."}
                          </p>
                        ) : null}
                        {item.status === "inactive" ? (
                          <p className="admin-hint">Inactiva: no se reactiva, crea una nueva.</p>
                        ) : null}
                        {item.status === "draft" && !canPublish ? (
                          <p className="admin-hint">Pendiente de aprobación (requiere permiso de publicación).</p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">
            {loading ? "Cargando…" : `No hay ${config.title.toLowerCase()} para esos filtros.`}
          </p>
        )}
        <nav className="admin-pagination" aria-label={`Paginación de ${config.title.toLowerCase()}`}>
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
            Se guarda como borrador: no se usa en cotizaciones hasta que un administrador lo apruebe. Los campos con *
            son obligatorios.
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
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !scopes.loaded}>
                {saving ? "Guardando…" : mode.type === "edit" ? "Guardar borrador" : "Crear borrador"}
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
                const changes = summarizeChanges(row);
                return (
                  <li key={row.id}>
                    <strong>{actionLabel(row.action)}</strong>
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
