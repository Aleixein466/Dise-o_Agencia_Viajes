"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { useDialog } from "../use-dialog";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { useCsrf } from "../commercial/use-commercial-data";
import {
  ACTION_DONE,
  ACTION_LABELS,
  APPROVAL_WARNING,
  STATUS_LABELS,
  availableActions,
  confirmText,
  describeContentError,
  historyActionLabel,
  statusBadgeClass,
  statusLabel,
  summarizeChanges,
  type FormErrors,
  type FormValues,
  type PublicationStatus,
  type StatusAction,
} from "./helpers";
import { HistoryPanel, type AuditRow } from "./history-panel";

export type PublicationItem = { id: string; status: PublicationStatus; updatedAt: string };
export type PublicationConfig<T extends PublicationItem> = {
  base: string;
  heading: string;
  intro: string;
  /** "la pregunta" / "la página": used in notices. */
  noun: string;
  newLabel: string;
  submitCreate: string;
  fields: FieldDef[];
  fieldLabels: Record<string, string>;
  blank: () => FormValues;
  toValues: (item: T) => FormValues;
  validate: (values: FormValues) => FormErrors;
  payload: (values: FormValues) => Record<string, unknown>;
  itemName: (item: T) => string;
  columns: { header: string; render: (item: T) => ReactNode }[];
  /** Keeps dependent fields in sync (e.g. a suggested slug) when a field changes. */
  derive?: (name: string, value: string, previous: FormValues, creating: boolean) => FormValues;
};
type Mode = { type: "idle" } | { type: "create" } | { type: "edit"; item: PublicationItem };

const PAGE_SIZE = 10;

export function PublicationManager<T extends PublicationItem>({
  session,
  config,
}: Readonly<{ session: AdminSession; config: PublicationConfig<T> }>) {
  const { confirm, dialog } = useDialog();
  const csrf = useCsrf(session.csrfToken);
  const prefix = useId();
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [values, setValues] = useState<FormValues>(config.blank());
  const [errors, setErrors] = useState<FormErrors>({});
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
  const { base } = config;
  const editing = mode.type === "edit" ? (mode.item as T) : undefined;

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) query.set("status", statusFilter);
    const result = await requestJson(`${base}?${query.toString()}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as { items?: T[]; total?: number; pages?: number } | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
    } else setLoadError(describeContentError(result).message);
  }, [base, page, statusFilter]);

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
    const found = config.validate(values);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Revisa los campos marcados.");
      requestFocus(config.fields.map((field) => field.name).find((name) => found[name]) ?? "summary");
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
      const described = describeContentError(result);
      if (described.field) setErrors({ [described.field]: described.message });
      setFormError(described.message);
      requestFocus(described.field ?? "summary");
      if (["STALE_UPDATE", "NOT_EDITABLE"].includes(described.code) || result.status === 404) void load();
      return;
    }
    setNotice(editing ? `Se guardó ${config.noun}.` : `Se creó ${config.noun} como borrador.`);
    setFailure(null);
    closeForm();
    if (!editing && page !== 1) setPage(1);
    else await load();
  }

  async function act(item: T, action: StatusAction) {
    const name = config.itemName(item);
    const accepted = await confirm(confirmText(action, name), {
      confirmLabel: ACTION_LABELS[action],
      danger: action !== "publish" && action !== "restore",
    });
    if (!accepted) return;
    setNotice(null);
    setFailure(null);
    setBusyId(item.id);
    const result = await requestJson(
      `${base}/${item.id}/${action}`,
      "POST",
      { expectedUpdatedAt: item.updatedAt, ...(action === "publish" ? { confirmApproved: true } : {}) },
      csrf,
    );
    setBusyId(null);
    if (result.ok) setNotice(`Se ha ${ACTION_DONE[action]} ${config.noun}: ${name}.`);
    else setFailure(describeContentError(result).message);
    if (result.ok || result.status === 409 || result.status === 404) await load();
  }

  async function showHistory(item: T) {
    const name = config.itemName(item);
    setHistory({ name, rows: null });
    const result = await requestJson(`${base}/${item.id}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(null);
      setFailure("No se pudo consultar el historial.");
      return;
    }
    setHistory({ name, rows: result.data as AuditRow[] });
  }

  const formTitle = editing ? `Editar: ${config.itemName(editing)}` : config.newLabel;
  return (
    <div className="admin-users">
      {dialog}
      <section className="admin-panel" aria-labelledby={`${prefix}-heading`}>
        <div className="admin-section-heading">
          <div>
            <h2 id={`${prefix}-heading`}>{config.heading}</h2>
            <p className="admin-hint">{config.intro}</p>
          </div>
          <button
            ref={createRef}
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => openForm({ type: "create" })}
          >
            {config.newLabel}
          </button>
        </div>
        <p className="admin-hint" role="note">
          <strong>Aprobación: </strong>
          {APPROVAL_WARNING}
        </p>
        <div role="status" className="admin-success admin-status-slot">
          {notice}
        </div>
        <div role="alert" className="admin-form-error admin-status-slot">
          {failure}
        </div>
        <div className="admin-form admin-transport-filters" role="group" aria-label="Filtros">
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
              {(Object.keys(STATUS_LABELS) as PublicationStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
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
            aria-label={`Tabla: ${config.heading}`}
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
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const name = config.itemName(item);
                  return (
                    <tr key={item.id}>
                      {config.columns.map((column) => (
                        <td key={column.header}>{column.render(item)}</td>
                      ))}
                      <td>
                        <span className={`admin-badge admin-badge-${statusBadgeClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          {item.status === "DRAFT" ? (
                            <button
                              type="button"
                              className="admin-link-button"
                              aria-label={`Editar ${name}`}
                              onClick={() => openForm({ type: "edit", item })}
                            >
                              Editar
                            </button>
                          ) : null}
                          {availableActions(item.status).map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="admin-link-button"
                              aria-label={`${ACTION_LABELS[action]} ${name}`}
                              disabled={busyId !== null}
                              onClick={() => void act(item, action)}
                            >
                              {ACTION_LABELS[action]}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="admin-link-button"
                            aria-label={`Historial de ${name}`}
                            onClick={() => void showHistory(item)}
                          >
                            Historial
                          </button>
                        </div>
                        {item.status === "PUBLISHED" ? <p className="admin-hint">Despublica para editar.</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">{loading ? "Cargando…" : "No hay registros para ese filtro."}</p>
        )}
        <nav className="admin-pagination" aria-label={`Paginación: ${config.heading}`}>
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
            Se guarda como borrador; no se muestra en el sitio hasta publicarlo. Texto plano o Markdown: el HTML se
            elimina. Los campos con * son obligatorios.
          </p>
          {formError ? (
            <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
              {formError}
            </p>
          ) : null}
          <form className="admin-form admin-commercial-form" noValidate onSubmit={(event) => void submit(event)}>
            <FormFields
              prefix={prefix}
              fields={config.fields}
              values={values}
              errors={errors}
              onChange={(name, value) =>
                setValues((current) =>
                  config.derive
                    ? config.derive(name, value, current, mode.type === "create")
                    : { ...current, [name]: value },
                )
              }
            />
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : config.submitCreate}
              </button>
              <button type="button" className="admin-btn admin-btn-quiet" onClick={closeForm}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {history ? (
        <HistoryPanel
          title={history.name}
          rows={history.rows}
          actionLabel={historyActionLabel}
          summarize={(row) => summarizeChanges(row, config.fieldLabels)}
          onClose={() => setHistory(null)}
        />
      ) : null}
    </div>
  );
}
