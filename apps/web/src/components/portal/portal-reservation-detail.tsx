"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatCop } from "@/components/public/money";
import { normalizeReservationDetail, portalPost } from "./portal-api";
import {
  CANCEL_REASON_MAX,
  canCancelReservation,
  formatDateTime,
  formatDay,
  portalErrorMessage,
  reservationStatusLabel,
  validateCancelReason,
} from "./portal-logic";
import { useResource } from "./use-resource";

const CATEGORY_LABELS: Record<string, string> = { ADULT: "Adulto", CHILD: "Niño o niña", INFANT: "Infante" };

type Notice = { kind: "ok" | "error"; text: string } | null;

export function PortalReservationDetail({ id, csrfToken }: Readonly<{ id: string; csrfToken: string }>) {
  const { state, reload } = useResource(`/me/reservations/${encodeURIComponent(id)}`, normalizeReservationDetail);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const ready = state.status === "ready";

  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  useEffect(() => {
    if (cancelling) reasonRef.current?.focus();
  }, [cancelling]);

  if (state.status === "loading") return <p role="status">Cargando reserva…</p>;
  if (state.status === "error") {
    return (
      <div>
        <p className="form-status error" role="alert">
          {portalErrorMessage(state.httpStatus, "No pudimos cargar esta reserva.")}
        </p>
        <p>
          <Link href="/mi-cuenta" className="wz-link">
            Volver a mi cuenta
          </Link>
        </p>
      </div>
    );
  }

  const reservation = state.data;
  const total = formatCop(reservation.totalCents);
  const start = formatDay(reservation.startsOn);
  const validatedAt = formatDateTime(reservation.availabilityValidatedAt);

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const problem = validateCancelReason(reason);
    setReasonError(problem);
    if (problem) {
      reasonRef.current?.focus();
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await portalPost(
      `/me/reservations/${reservation.id}/cancel`,
      { reason: reason.trim(), expectedVersion: reservation.version },
      csrfToken,
    );
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: "Tu reserva fue cancelada." });
    } else {
      setNotice({
        kind: "error",
        text:
          result.status === 409
            ? "La reserva cambió de estado y ya no se puede cancelar desde aquí. Actualizamos la información."
            : portalErrorMessage(result.status),
      });
    }
    setCancelling(false);
    setReason("");
    reload();
  }

  return (
    <article className="portal-detail" aria-labelledby="portal-reservation-title">
      <p>
        <Link href="/mi-cuenta" className="wz-link">
          ← Volver a mi cuenta
        </Link>
      </p>
      <h2 id="portal-reservation-title" ref={headingRef} tabIndex={-1} className="portal-title">
        {reservation.packageName ?? "Reserva"}
      </h2>
      <p>
        <span className="portal-badge" data-status={reservation.status}>
          {reservationStatusLabel(reservation.status)}
        </span>
      </p>
      <div aria-live="polite" className="portal-notice">
        {notice ? (
          <p
            className={notice.kind === "error" ? "form-status error" : "form-status"}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <p className="form-status portal-availability-note">
        La disponibilidad la confirma un asesor; no hay cupos garantizados hasta la confirmación.
      </p>

      <section className="wz-summary portal-panel" aria-labelledby="portal-res-summary">
        <h3 id="portal-res-summary">Resumen</h3>
        <dl>
          <div>
            <dt>Código</dt>
            <dd>{reservation.code}</dd>
          </div>
          {start ? (
            <div>
              <dt>Inicio del viaje</dt>
              <dd>{start}</dd>
            </div>
          ) : null}
          <div>
            <dt>Viajeros</dt>
            <dd>
              {reservation.adults} {reservation.adults === 1 ? "adulto" : "adultos"}
              {reservation.children > 0
                ? ` · ${reservation.children} ${reservation.children === 1 ? "menor" : "menores"}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{total ?? "Por confirmar"}</dd>
          </div>
          <div>
            <dt>Disponibilidad</dt>
            <dd>
              {validatedAt ? `Confirmada por un asesor el ${validatedAt}` : "Pendiente de confirmación por un asesor"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="portal-panel" aria-labelledby="portal-res-history">
        <h3 id="portal-res-history">Historial</h3>
        {reservation.history.length === 0 ? (
          <p className="portal-empty">Aún no hay movimientos.</p>
        ) : (
          <ol className="portal-timeline">
            {reservation.history.map((entry, index) => (
              <li key={index}>
                <strong>{reservationStatusLabel(entry.toStatus)}</strong>
                <span className="portal-meta">{formatDateTime(entry.at) ?? ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="portal-panel" aria-labelledby="portal-res-travelers">
        <h3 id="portal-res-travelers">Viajeros</h3>
        <ul className="wz-list">
          {reservation.travelers.map((traveler, index) => (
            <li key={index}>
              {traveler.fullName} · {CATEGORY_LABELS[traveler.category] ?? traveler.category}
              {typeof traveler.ageYears === "number" ? ` · ${traveler.ageYears} años` : ""}
            </li>
          ))}
        </ul>
      </section>

      {reservation.conditions.inclusions.length || reservation.conditions.exclusions.length ? (
        <section className="portal-panel wz-lists" aria-label="Condiciones">
          {reservation.conditions.inclusions.length ? (
            <div>
              <h3>Incluye</h3>
              <ul className="wz-list">
                {reservation.conditions.inclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {reservation.conditions.exclusions.length ? (
            <div>
              <h3>No incluye</h3>
              <ul className="wz-list">
                {reservation.conditions.exclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {canCancelReservation(reservation.status) ? (
        <section className="portal-panel" aria-labelledby="portal-res-cancel">
          <h3 id="portal-res-cancel">Cancelar reserva</h3>
          {cancelling ? (
            <form onSubmit={cancel} aria-busy={pending} noValidate>
              <label className="field">
                Motivo de la cancelación
                <textarea
                  ref={reasonRef}
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  minLength={3}
                  maxLength={CANCEL_REASON_MAX}
                  aria-invalid={reasonError ? true : undefined}
                  aria-describedby={reasonError ? "cancel-reason-error" : undefined}
                />
                {reasonError ? (
                  <span id="cancel-reason-error" className="field-error">
                    {reasonError}
                  </span>
                ) : null}
              </label>
              <p className="wz-note">¿Seguro que quieres cancelar? Esta acción no se puede deshacer.</p>
              <div className="wz-nav">
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? "Cancelando…" : "Sí, cancelar mi reserva"}
                </button>
                <button
                  type="button"
                  className="portal-btn-quiet"
                  disabled={pending}
                  onClick={() => {
                    setCancelling(false);
                    setReasonError(null);
                  }}
                >
                  Volver
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="portal-btn-quiet" onClick={() => setCancelling(true)}>
              Cancelar reserva
            </button>
          )}
        </section>
      ) : null}
    </article>
  );
}
