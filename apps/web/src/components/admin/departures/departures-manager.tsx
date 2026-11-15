"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { formatDateTime, formatInstantDate } from "../commercial/helpers";
import { useCsrf, useScopeOptions } from "../commercial/use-commercial-data";
import {
  AVAILABILITIES,
  MAX_SEATS,
  REASON_MAX,
  availabilityLabel,
  blankDeparture,
  changeKindLabel,
  createPayload,
  departureValues,
  describeDelta,
  describeDepartureError,
  editPayload,
  parseSeats,
  seatsSummary,
  validateDeparture,
  validateSeatChange,
  type DepartureErrors,
  type DepartureValues,
} from "./helpers";

type Departure = {
  id: string;
  packageId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  heldSeats: number;
  soldSeats: number;
  availableSeats: number;
  availabilityStatus: string;
  updatedAt: string;
};
type SeatChange = {
  id: string;
  kind: string;
  delta: number;
  capacityAfter: number;
  heldAfter: number;
  soldAfter: number;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
};
type Mode = { type: "idle" } | { type: "create" } | { type: "edit"; item: Departure };
type SeatMode = { kind: "hold" | "release"; item: Departure } | null;

const PAGE_SIZE = 20;
const BASE = "/api/v1/catalog/departures";
const label = (item: Departure) => `${formatInstantDate(item.startsAt)} – ${formatInstantDate(item.endsAt)}`;
const BADGE: Record<string, string> = { AVAILABLE: "approved", TO_CONFIRM: "draft", SOLD_OUT: "inactive" };

export function DeparturesManager({ session }: Readonly<{ session: AdminSession }>) {
  const csrf = useCsrf(session.csrfToken);
  const scope = useScopeOptions();
  const prefix = useId();
  const seatPrefix = `${prefix}-seat`;

  const [packageId, setPackageId] = useState("");
  const [items, setItems] = useState<Departure[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [values, setValues] = useState<DepartureValues>(blankDeparture());
  const [initial, setInitial] = useState<DepartureValues>(blankDeparture());
  const [errors, setErrors] = useState<DepartureErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seatMode, setSeatMode] = useState<SeatMode>(null);
  const [seatValues, setSeatValues] = useState({ seats: "", reason: "" });
  const [seatErrors, setSeatErrors] = useState<DepartureErrors>({});
  const [seatError, setSeatError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ label: string; rows: SeatChange[] | null } | null>(null);
  const requestId = useRef(0);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const seatHeading = useRef<HTMLHeadingElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);

  const editing = mode.type === "edit" ? mode.item : undefined;
  const capacityChanged = Boolean(editing) && parseSeats(values.capacity) !== editing?.capacity;
  const fields: FieldDef[] = [
    { name: "startsOn", label: "Fecha de salida", type: "date", required: true },
    { name: "endsOn", label: "Fecha de regreso", type: "date", required: true },
    {
      name: "capacity",
      label: "Capacidad (cupos)",
      type: "number",
      required: true,
      maxLength: 5,
      hint: editing
        ? `Manual. Mínimo ${editing.heldSeats + editing.soldSeats} (retenidos + vendidos).`
        : "Manual: escribe solo los cupos confirmados con hoteles y transportadores.",
    },
    {
      name: "availabilityStatus",
      label: "Disponibilidad",
      type: "select",
      required: true,
      options: AVAILABILITIES.map((value) => ({ value, label: availabilityLabel(value) })),
    },
    ...(capacityChanged
      ? [
          {
            name: "reason",
            label: "Motivo del cambio de capacidad",
            type: "textarea" as const,
            required: true,
            maxLength: REASON_MAX,
            wide: true,
            hint: "Queda en el historial de cupos.",
          },
        ]
      : []),
  ];

  const load = useCallback(async () => {
    if (!packageId) {
      setItems([]);
      setMeta({ total: 0, pages: 1 });
      return;
    }
    const current = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams({ packageId, page: String(page), pageSize: String(PAGE_SIZE) });
    const result = await requestJson(`${BASE}?${query.toString()}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as { items?: Departure[]; total?: number; pages?: number } | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
    } else setLoadError(describeDepartureError(result).message);
  }, [packageId, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function focusLater(target: () => HTMLElement | null | undefined) {
    window.setTimeout(() => target()?.focus(), 0);
  }
  function clearMessages() {
    setNotice(null);
    setFailure(null);
  }

  function openForm(next: Mode) {
    clearMessages();
    setSeatMode(null);
    setErrors({});
    setFormError(null);
    const start = next.type === "edit" ? departureValues(next.item) : blankDeparture();
    setValues(start);
    setInitial(start);
    setMode(next);
    focusLater(() => formHeading.current);
  }
  function closeForm() {
    setMode({ type: "idle" });
    setErrors({});
    setFormError(null);
    focusLater(() => createRef.current);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode.type === "idle") return;
    const found = validateDeparture(values, editing);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Revisa los campos marcados.");
      const first = fields.map((field) => field.name).find((name) => found[name]);
      focusLater(() => (first ? document.getElementById(`${prefix}-${first}`) : summaryRef.current));
      return;
    }
    let body: Record<string, unknown>;
    if (editing) {
      body = editPayload(values, initial);
      if (!Object.keys(body).length) {
        setNotice("No había cambios para guardar.");
        closeForm();
        return;
      }
      body.expectedUpdatedAt = editing.updatedAt;
    } else body = createPayload(values, packageId);
    setErrors({});
    setFormError(null);
    setSaving(true);
    const result = editing
      ? await requestJson(`${BASE}/${editing.id}`, "PATCH", body, csrf)
      : await requestJson(BASE, "POST", body, csrf);
    setSaving(false);
    if (!result.ok) {
      const described = describeDepartureError(result);
      if (described.field) setErrors({ [described.field]: described.message });
      setFormError(described.message);
      focusLater(() =>
        described.field ? document.getElementById(`${prefix}-${described.field}`) : summaryRef.current,
      );
      if (described.code === "STALE_UPDATE" || result.status === 404) void load();
      return;
    }
    setNotice(editing ? "Salida guardada." : "Salida creada.");
    closeForm();
    await load();
  }

  function openSeats(kind: "hold" | "release", item: Departure) {
    clearMessages();
    setMode({ type: "idle" });
    setSeatValues({ seats: "", reason: "" });
    setSeatErrors({});
    setSeatError(null);
    setSeatMode({ kind, item });
    focusLater(() => seatHeading.current);
  }

  async function submitSeats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seatMode) return;
    const { kind, item } = seatMode;
    const limit = kind === "hold" ? item.availableSeats : item.heldSeats;
    const found = validateSeatChange(seatValues.seats, seatValues.reason, limit, kind);
    if (Object.keys(found).length) {
      setSeatErrors(found);
      setSeatError("Revisa los campos marcados.");
      focusLater(() => document.getElementById(`${seatPrefix}-${found.seats ? "seats" : "reason"}`));
      return;
    }
    setSeatErrors({});
    setSeatError(null);
    setSaving(true);
    const result = await requestJson(
      `${BASE}/${item.id}/${kind}`,
      "POST",
      { seats: parseSeats(seatValues.seats, 1), reason: seatValues.reason.trim() },
      csrf,
    );
    setSaving(false);
    if (!result.ok) {
      const described = describeDepartureError(result);
      if (described.field) setSeatErrors({ [described.field]: described.message });
      setSeatError(described.message);
      if (result.status === 409 || result.status === 404) {
        await load();
        if (result.status === 409) {
          const fresh = await requestJson(`${BASE}/${item.id}`, "GET");
          if (fresh.ok) setSeatMode({ kind, item: fresh.data as Departure });
        }
      }
      focusLater(() => document.getElementById(`${seatPrefix}-seats`));
      return;
    }
    const seats = parseSeats(seatValues.seats, 1) ?? 0;
    setNotice(
      kind === "hold"
        ? `${seats === 1 ? "1 cupo retenido" : `${seats} cupos retenidos`} en la salida ${label(item)}.`
        : `${seats === 1 ? "1 cupo liberado" : `${seats} cupos liberados`} en la salida ${label(item)}.`,
    );
    setSeatMode(null);
    await load();
    if (history) void showHistory(result.data as Departure);
  }

  async function showHistory(item: Departure) {
    setHistory({ label: label(item), rows: null });
    focusLater(() => historyHeading.current);
    const result = await requestJson(`${BASE}/${item.id}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(null);
      setFailure("No se pudo consultar el historial de cupos.");
      return;
    }
    setHistory({ label: label(item), rows: result.data as SeatChange[] });
  }

  const seatItem = seatMode?.item;
  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <div className="admin-section-heading">
          <div>
            <h2 id={`${prefix}-title`}>Salidas y cupos</h2>
            <p className="admin-hint">
              Elige un paquete para ver sus salidas. Retener cupos los aparta manualmente (por ejemplo, para un grupo) y
              nunca permite superar la capacidad.
            </p>
          </div>
          <button
            ref={createRef}
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={!packageId}
            onClick={() => openForm({ type: "create" })}
          >
            Nueva salida
          </button>
        </div>
        <div className="admin-form admin-transport-filters" role="group" aria-label="Filtro de salidas">
          <div className="admin-field">
            <label htmlFor={`${prefix}-package`}>Paquete</label>
            <select
              id={`${prefix}-package`}
              value={packageId}
              disabled={!scope.loaded}
              onChange={(event) => {
                setPage(1);
                setMode({ type: "idle" });
                setSeatMode(null);
                setHistory(null);
                clearMessages();
                setPackageId(event.target.value);
              }}
            >
              <option value="">{scope.loaded ? "Elige un paquete" : "Cargando paquetes…"}</option>
              {scope.packages.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div role="status" className="admin-success admin-status-slot">
          {notice}
        </div>
        <div role="alert" className="admin-form-error admin-status-slot">
          {failure}
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
            aria-label="Tabla de salidas"
            aria-busy={loading}
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Salida</th>
                  <th scope="col">Capacidad</th>
                  <th scope="col">Retenidos</th>
                  <th scope="col">Vendidos</th>
                  <th scope="col">Libres</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{label(item)}</td>
                    <td>{item.capacity}</td>
                    <td>{item.heldSeats}</td>
                    <td>{item.soldSeats}</td>
                    <td>{item.availableSeats}</td>
                    <td>
                      <span className={`admin-badge admin-badge-${BADGE[item.availabilityStatus] ?? "draft"}`}>
                        {availabilityLabel(item.availabilityStatus)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Editar salida ${label(item)}`}
                          onClick={() => openForm({ type: "edit", item })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Retener cupos de la salida ${label(item)}`}
                          disabled={item.availableSeats < 1}
                          onClick={() => openSeats("hold", item)}
                        >
                          Retener
                        </button>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Liberar cupos de la salida ${label(item)}`}
                          disabled={item.heldSeats < 1}
                          onClick={() => openSeats("release", item)}
                        >
                          Liberar
                        </button>
                        <button
                          type="button"
                          className="admin-link-button"
                          aria-label={`Historial de la salida ${label(item)}`}
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
          <p className="admin-empty">
            {!packageId ? "Elige un paquete." : loading ? "Cargando…" : "Este paquete aún no tiene salidas."}
          </p>
        )}
        {packageId ? (
          <nav className="admin-pagination" aria-label="Paginación de salidas">
            <button
              type="button"
              className="admin-btn admin-btn-quiet"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </button>
            <span>
              Página {page} de {meta.pages} · {meta.total} {meta.total === 1 ? "salida" : "salidas"}
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
        ) : null}
      </section>

      {mode.type !== "idle" ? (
        <section className="admin-panel" aria-labelledby={`${prefix}-form-title`}>
          <h2 id={`${prefix}-form-title`} ref={formHeading} tabIndex={-1}>
            {editing ? `Editar salida ${label(editing)}` : "Nueva salida"}
          </h2>
          <p className="admin-hint">
            {editing
              ? `Retenidos ${editing.heldSeats} · vendidos ${editing.soldSeats}. `
              : "La salida queda sin publicar y sin precio: las tarifas se manejan aparte. "}
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
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar salida" : "Crear salida"}
              </button>
              <button type="button" className="admin-btn admin-btn-quiet" onClick={closeForm}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {seatMode && seatItem ? (
        <section className="admin-panel" aria-labelledby={`${seatPrefix}-title`}>
          <h2 id={`${seatPrefix}-title`} ref={seatHeading} tabIndex={-1}>
            {seatMode.kind === "hold" ? "Retener cupos" : "Liberar cupos"}: {label(seatItem)}
          </h2>
          <p className="admin-hint">
            {seatMode.kind === "hold"
              ? `Quedan ${seatItem.availableSeats} cupos libres de ${seatItem.capacity}.`
              : `Hay ${seatItem.heldSeats} cupos retenidos.`}{" "}
            El cambio queda en el historial con tu nombre y el motivo.
          </p>
          {seatError ? (
            <p role="alert" className="admin-form-error">
              {seatError}
            </p>
          ) : null}
          <form className="admin-form admin-commercial-form" noValidate onSubmit={(event) => void submitSeats(event)}>
            <FormFields
              prefix={seatPrefix}
              fields={[
                {
                  name: "seats",
                  label: "Cupos",
                  type: "number",
                  required: true,
                  maxLength: String(MAX_SEATS).length,
                },
                {
                  name: "reason",
                  label: "Motivo",
                  type: "textarea",
                  required: true,
                  maxLength: REASON_MAX,
                  wide: true,
                },
              ]}
              values={seatValues}
              errors={seatErrors}
              onChange={(name, value) => setSeatValues((current) => ({ ...current, [name]: value }))}
            />
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? "Guardando…" : seatMode.kind === "hold" ? "Retener cupos" : "Liberar cupos"}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-quiet"
                onClick={() => {
                  setSeatMode(null);
                  focusLater(() => createRef.current);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {history ? (
        <section className="admin-panel" aria-live="polite" aria-labelledby={`${prefix}-history`}>
          <div className="admin-section-heading">
            <h2 id={`${prefix}-history`} ref={historyHeading} tabIndex={-1}>
              Historial de cupos: {history.label}
            </h2>
            <button type="button" className="admin-btn admin-btn-quiet" onClick={() => setHistory(null)}>
              Cerrar historial
            </button>
          </div>
          {history.rows === null ? (
            <p className="admin-empty">Cargando historial…</p>
          ) : history.rows.length ? (
            <ol className="admin-activity">
              {history.rows.map((row) => (
                <li key={row.id}>
                  <strong>{changeKindLabel(row.kind)}</strong> · {describeDelta(row.kind, row.delta)}
                  <br />
                  <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                  <span className="admin-hint"> · {row.actor?.name ?? "Usuario eliminado"}</span>
                  <ul className="admin-history-changes">
                    <li>{seatsSummary(row)}</li>
                    {row.reason ? <li>Motivo: {row.reason}</li> : null}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="admin-empty">No hay cambios registrados.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
