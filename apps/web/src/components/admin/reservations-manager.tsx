"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useReveal } from "./use-reveal";
import { formatCop } from "@/components/public/money";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import {
  RESERVATION_ACTION_LABELS,
  RESERVATION_STATUSES,
  actionRequiresReason,
  allowedReservationActions,
  parseDepositPesos,
  reservationStatusLabel,
  type ReservationAction,
} from "./reservation-status";

type Person = { id: string; name: string };
type Row = {
  id: string;
  code: string;
  status: string;
  packageName: string | null;
  customerName: string | null;
  startsOn: string | null;
  travelers: number;
  totalCents: string | null;
  assignedAdvisor: Person | null;
  quoteReference: string | null;
  createdAt: string;
};
type Page = { items: Row[]; total: number; page: number; pageSize: number; pages: number };
type Detail = {
  id: string;
  code: string;
  status: string;
  version: number;
  packageName: string | null;
  destinationName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  totalCents: string | null;
  currency: string;
  priceSnapshot: unknown;
  travelers: Array<{ fullName: string; category: string; ageYears: number | null }>;
  customer: { name: string; email: string; phone: string | null } | null;
  contactHidden: boolean;
  quote: { id: string; reference: string; status: string } | null;
  availabilityValidatedAt: string | null;
  validatedBy: Person | null;
  assignedAdvisor: Person | null;
  history: Array<{
    fromStatus: string | null;
    toStatus: string;
    event: string;
    actor: Person | null;
    role: string;
    reason: string | null;
    at: string;
  }>;
  notes: Array<{ id: string; body: string; author: Person; createdAt: string }>;
  payment?: {
    paidCents: string;
    balanceCents: string;
    requiredDepositCents: string | null;
    canPay: boolean;
  } | null;
  payments?: Array<{ reference: string; amountCents: string; status: string; createdAt: string }>;
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En verificación",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  VOIDED: "Anulado",
  ERROR: "Error",
  REFUNDED: "Reembolsado",
};

const PAGE_SIZE = 20;
const CONFLICT_MESSAGE = "La reserva cambió; se recargó la información";
const CATEGORY_LABELS: Record<string, string> = { ADULT: "Adulto", CHILD: "Niño", INFANT: "Infante" };
const APPROVE_CONFIRM =
  "Esto registra la validación manual de disponibilidad y deja la reserva pendiente de pago. No confirma la reserva. ¿Continuar?";
const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("es-CO", { dateStyle: "medium", timeZone: "UTC" }) : "—";
const money = (value: string | null) => formatCop(value) ?? "—";

export function ReservationsManager({
  session,
  initialId,
  canWrite,
}: Readonly<{ session: AdminSession; initialId: string | null; canWrite: boolean }>) {
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [advisors, setAdvisors] = useState<Person[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState("");
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
  const [noteBody, setNoteBody] = useState("");
  const [deposit, setDeposit] = useState("");

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    const result = await requestJson(`/api/v1/reservations?${params.toString()}`, "GET");
    if (result.ok) {
      setPage(result.data as Page);
      setLoadError(false);
    } else setLoadError(true);
  }, [pageNumber, status, query]);
  const loadDetail = useCallback(async (id: string) => {
    const result = await requestJson(`/api/v1/reservations/${id}`, "GET");
    if (result.ok) {
      setDetail(result.data as Detail);
      setError(null);
    } else {
      setDetail(null);
      setError("No se pudo cargar la reserva.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
      void requestJson("/api/v1/crm/advisors", "GET").then((result) => {
        if (result.ok && Array.isArray(result.data)) setAdvisors(result.data as Person[]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
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
    await Promise.all([loadDetail(id), loadList()]);
  }

  function select(id: string) {
    setSelectedId(id);
    setDetail(null);
    setMessage(null);
    setError(null);
    setAdvisorId("");
    setReason("");
    setNoteBody("");
    setDeposit("");
  }

  async function mutate(path: string, body: unknown, success: string): Promise<boolean> {
    if (!detail || pending) return false;
    setPending(true);
    setMessage(null);
    setError(null);
    const result = await requestJson(`/api/v1/reservations/${detail.id}/${path}`, "POST", body, csrf);
    let ok = false;
    if (result.ok) {
      ok = true;
      setMessage(success);
      await refreshAll(detail.id);
    } else if (result.status === 409) {
      const apiMessage = (result.data as { message?: unknown } | null)?.message;
      setError(typeof apiMessage === "string" ? apiMessage : CONFLICT_MESSAGE);
      await refreshAll(detail.id);
    } else {
      const apiMessage = (result.data as { message?: unknown } | null)?.message;
      setError(typeof apiMessage === "string" ? apiMessage : "No se pudo completar la acción.");
    }
    setPending(false);
    return ok;
  }

  async function runAction(action: ReservationAction) {
    if (!detail) return;
    const needsReason = actionRequiresReason(action);
    const trimmed = reason.trim();
    if (needsReason && trimmed.length < 3) {
      setError("Indica un motivo (mínimo 3 caracteres).");
      return;
    }
    if (action === "APPROVE_FOR_PAYMENT" && !window.confirm(APPROVE_CONFIRM)) return;
    let depositCents: string | null = null;
    if (action === "APPROVE_FOR_PAYMENT" && deposit.trim()) {
      depositCents = parseDepositPesos(deposit);
      if (depositCents === null) {
        setError("El abono mínimo debe ser un valor en pesos, solo números.");
        return;
      }
    }
    const ok = await mutate(
      "events",
      {
        event: action,
        expectedVersion: detail.version,
        ...(needsReason ? { reason: trimmed } : {}),
        ...(depositCents !== null ? { requiredDepositCents: depositCents } : {}),
      },
      "Reserva actualizada.",
    );
    if (ok) {
      setReason("");
      setDeposit("");
    }
  }
  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!detail || !advisorId) return;
    if (await mutate("assign", { advisorId, expectedVersion: detail.version }, "Reserva asignada.")) setAdvisorId("");
  }
  async function addNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!detail || !body) return;
    if (await mutate("notes", { body }, "Nota agregada.")) setNoteBody("");
  }
  function applySearch(event: FormEvent) {
    event.preventDefault();
    setPageNumber(1);
    setQuery(queryDraft.trim());
  }

  const actions = detail && canWrite ? allowedReservationActions(detail.status) : [];
  const hasReasonAction = actions.some(actionRequiresReason);
  const filterStyle = { gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby="res-list-title">
        <h2 id="res-list-title">Reservas</h2>
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
              {RESERVATION_STATUSES.filter((value) => value !== "DRAFT").map((value) => (
                <option key={value} value={value}>
                  {reservationStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Código o referencia
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="RES-… o referencia de cotización"
            />
          </label>
          <button className="admin-btn admin-btn-primary" type="submit" style={{ alignSelf: "end" }}>
            Buscar
          </button>
        </form>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            No se pudo cargar la lista de reservas.
          </p>
        ) : null}
        {page && page.items.length === 0 ? (
          <p className="admin-empty">No hay reservas que coincidan con los filtros.</p>
        ) : null}
        {page && page.items.length > 0 ? (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Estado</th>
                    <th>Paquete</th>
                    <th>Cliente</th>
                    <th>Inicio</th>
                    <th>Viajeros</th>
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
                          aria-label={`Ver reserva ${row.code}`}
                          aria-current={row.id === selectedId ? "true" : undefined}
                          onClick={() => select(row.id)}
                        >
                          {row.code}
                        </button>
                      </td>
                      <td>
                        <span className="admin-role">{reservationStatusLabel(row.status)}</span>
                      </td>
                      <td>{row.packageName ?? "—"}</td>
                      <td>{row.customerName ?? "Contacto oculto"}</td>
                      <td>{dateOnly(row.startsOn)}</td>
                      <td>{row.travelers}</td>
                      <td>{money(row.totalCents)}</td>
                      <td>{row.assignedAdvisor?.name ?? "Sin asignar"}</td>
                      <td>{dateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-section-heading" style={{ marginTop: 12, marginBottom: 0, alignItems: "center" }}>
              <span className="admin-hint">
                Página {page.page} de {Math.max(page.pages, 1)} · {page.total} reservas
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
        <section className="admin-panel" aria-labelledby="res-detail-title">
          <div className="admin-section-heading">
            <h2 id="res-detail-title" ref={detailHeading} tabIndex={-1}>
              {detail ? `Reserva ${detail.code}` : "Reserva"}
            </h2>
            <button type="button" className="admin-btn admin-btn-quiet" onClick={() => setSelectedId(null)}>
              Cerrar
            </button>
          </div>
          <div aria-live="polite" role="status">
            {message ? <p className="admin-success">{message}</p> : null}
            {error ? <p className="admin-form-error">{error}</p> : null}
          </div>
          {!detail && !error ? <p className="admin-empty">Cargando reserva…</p> : null}
          {detail ? (
            <div className="admin-users">
              <p>
                <span className="admin-role">{reservationStatusLabel(detail.status)}</span>{" "}
                {detail.packageName ?? detail.destinationName ?? "Sin paquete"} · Viaje: {dateOnly(detail.startsOn)}
                {detail.endsOn ? ` – ${dateOnly(detail.endsOn)}` : ""} · Total (precio congelado):{" "}
                {money(detail.totalCents)}
              </p>

              <div>
                <h3>Cliente</h3>
                {detail.customer ? (
                  <p>
                    {detail.customer.name} · {detail.customer.email}
                    {detail.customer.phone ? ` · ${detail.customer.phone}` : ""}
                  </p>
                ) : (
                  <p className="admin-empty">Contacto oculto</p>
                )}
                {detail.quote ? (
                  <p>
                    Cotización de origen:{" "}
                    <a href={`/admin/solicitudes?id=${encodeURIComponent(detail.quote.id)}`}>
                      {detail.quote.reference}
                    </a>
                  </p>
                ) : null}
              </div>

              <div>
                <h3>Viajeros</h3>
                <ul className="admin-activity">
                  {detail.travelers.map((traveler, index) => (
                    <li key={`${traveler.fullName}-${index}`}>
                      {traveler.fullName} · {CATEGORY_LABELS[traveler.category] ?? traveler.category}
                      {traveler.ageYears !== null && traveler.ageYears !== undefined
                        ? ` · ${traveler.ageYears} años`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3>Validación de disponibilidad</h3>
                {detail.availabilityValidatedAt ? (
                  <p>
                    Validada manualmente el {dateTime(detail.availabilityValidatedAt)}
                    {detail.validatedBy ? ` por ${detail.validatedBy.name}` : ""}.
                  </p>
                ) : (
                  <p className="admin-empty">Disponibilidad aún sin validar.</p>
                )}
              </div>

              {actions.length ? (
                <div className="admin-form">
                  <h3>Acciones</h3>
                  {hasReasonAction ? (
                    <label className="admin-field">
                      Motivo (obligatorio para rechazar o cancelar)
                      <input
                        value={reason}
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        disabled={pending}
                      />
                    </label>
                  ) : null}
                  {actions.includes("APPROVE_FOR_PAYMENT") ? (
                    <label className="admin-field">
                      Abono mínimo requerido (COP)
                      <input
                        inputMode="numeric"
                        value={deposit}
                        onChange={(event) => setDeposit(event.target.value)}
                        disabled={pending}
                      />
                    </label>
                  ) : null}
                  <span className="admin-row-actions" style={{ gridAutoFlow: "column" }}>
                    {actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        className={`admin-btn ${actionRequiresReason(action) ? "admin-btn-quiet" : "admin-btn-primary"}`}
                        disabled={pending || (actionRequiresReason(action) && reason.trim().length < 3)}
                        onClick={() => void runAction(action)}
                      >
                        {RESERVATION_ACTION_LABELS[action]}
                      </button>
                    ))}
                  </span>
                </div>
              ) : null}

              {detail.payment ? (
                <div>
                  <h3>Pagos</h3>
                  <p>
                    Pagado: {money(detail.payment.paidCents)} · Saldo: {money(detail.payment.balanceCents)} · Abono
                    mínimo: {detail.payment.requiredDepositCents ? money(detail.payment.requiredDepositCents) : "—"}
                  </p>
                  {detail.payments?.length ? (
                    <ul className="admin-activity">
                      {detail.payments.map((item) => (
                        <li key={item.reference}>
                          {item.reference} · {money(item.amountCents)} ·{" "}
                          {PAYMENT_STATUS_LABELS[item.status] ?? item.status}
                          <br />
                          <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-empty">Sin pagos registrados.</p>
                  )}
                </div>
              ) : null}

              {canWrite ? (
                <div className="admin-grid">
                  <form className="admin-form" onSubmit={(event) => void assign(event)}>
                    <h3>Asignar asesor</h3>
                    <p className="admin-hint">Asesor actual: {detail.assignedAdvisor?.name ?? "Sin asignar"}</p>
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
                    <button className="admin-btn admin-btn-primary" type="submit" disabled={pending || !advisorId}>
                      Asignar
                    </button>
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
                    <button
                      className="admin-btn admin-btn-primary"
                      type="submit"
                      disabled={pending || !noteBody.trim()}
                    >
                      Agregar nota
                    </button>
                  </form>
                </div>
              ) : null}

              <div>
                <h3>Historial</h3>
                {detail.history.length ? (
                  <ul className="admin-activity">
                    {detail.history.map((entry, index) => (
                      <li key={`${entry.event}-${entry.at}-${index}`}>
                        {entry.fromStatus ? `${reservationStatusLabel(entry.fromStatus)} → ` : ""}
                        {reservationStatusLabel(entry.toStatus)} · {entry.actor?.name ?? "Sistema"} ({entry.role})
                        {entry.reason ? ` · ${entry.reason}` : ""}
                        <br />
                        <time dateTime={entry.at}>{dateTime(entry.at)}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Sin movimientos registrados.</p>
                )}
              </div>

              <div>
                <h3>Notas</h3>
                {detail.notes.length ? (
                  <ul className="admin-activity">
                    {detail.notes.map((note) => (
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
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
