"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatCop } from "@/components/public/money";
import { asList, type QuoteSummary, type ReservationSummary } from "./portal-api";
import { formatDay, portalErrorMessage, quoteStatusLabel, reservationStatusLabel } from "./portal-logic";
import { useResource, type ResourceState } from "./use-resource";

const parseQuotes = (data: unknown): QuoteSummary[] | null => (Array.isArray(data) ? asList<QuoteSummary>(data) : null);
const parseReservations = (data: unknown): ReservationSummary[] | null =>
  Array.isArray(data) ? asList<ReservationSummary>(data) : null;

function travelersText(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? "adulto" : "adultos"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "menor" : "menores"}`);
  return parts.join(" · ");
}

function SectionState<T>({
  state,
  onRetry,
  empty,
  children,
}: Readonly<{
  state: ResourceState<T[]>;
  onRetry: () => void;
  empty: string;
  children: (items: T[]) => React.ReactNode;
}>) {
  if (state.status === "loading") return <p role="status">Cargando…</p>;
  if (state.status === "error") {
    return (
      <div role="alert" className="form-status error">
        {portalErrorMessage(state.httpStatus, "No pudimos cargar esta información.")}{" "}
        <button type="button" className="wz-link" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (state.data.length === 0) return <p className="portal-empty">{empty}</p>;
  return <>{children(state.data)}</>;
}

export function PortalDashboard() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const quotes = useResource("/me/quotes", parseQuotes);
  const reservations = useResource("/me/reservations", parseReservations);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="portal-dashboard">
      <h2 ref={headingRef} tabIndex={-1} className="portal-title">
        Tu cuenta
      </h2>

      <section aria-labelledby="portal-quotes-title" className="portal-section">
        <h3 id="portal-quotes-title">Mis solicitudes</h3>
        <SectionState
          state={quotes.state}
          onRetry={quotes.reload}
          empty="Aún no tienes solicitudes vinculadas a este correo. Cuando prepares una consulta, aparecerá aquí."
        >
          {(items) => (
            <ul className="portal-cards">
              {items.map((quote) => {
                const total = formatCop(quote.totalCents);
                const travel = formatDay(quote.travelDate);
                return (
                  <li key={quote.id} className="portal-card">
                    <div className="portal-card-head">
                      <strong>{quote.packageName ?? "Solicitud de viaje"}</strong>
                      <span className="portal-badge" data-status={quote.status}>
                        {quoteStatusLabel(quote.status)}
                      </span>
                    </div>
                    <p className="portal-meta">
                      Ref. {quote.reference}
                      {quote.destinationName ? ` · ${quote.destinationName}` : ""}
                    </p>
                    <p className="portal-meta">
                      {travelersText(quote.adults, quote.children)}
                      {travel ? ` · Fecha tentativa: ${travel}` : ""}
                    </p>
                    <p className="portal-meta">{total ? `Total: ${total}` : "Un asesor confirmará el valor"}</p>
                    <div className="portal-actions">
                      <Link className="btn btn-primary" href={`/mi-cuenta/solicitudes/${quote.id}`}>
                        Ver solicitud
                      </Link>
                      {quote.reservation ? (
                        <span className="portal-meta">
                          Reserva {quote.reservation.code} · {reservationStatusLabel(quote.reservation.status)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionState>
      </section>

      <section aria-labelledby="portal-reservations-title" className="portal-section">
        <h3 id="portal-reservations-title">Mis reservas</h3>
        <SectionState
          state={reservations.state}
          onRetry={reservations.reload}
          empty="Todavía no tienes reservas. Cuando aceptes una propuesta podrás solicitar tu reserva."
        >
          {(items) => (
            <ul className="portal-cards">
              {items.map((reservation) => {
                const total = formatCop(reservation.totalCents);
                const start = formatDay(reservation.startsOn);
                return (
                  <li key={reservation.id} className="portal-card">
                    <div className="portal-card-head">
                      <strong>{reservation.packageName ?? "Reserva"}</strong>
                      <span className="portal-badge" data-status={reservation.status}>
                        {reservationStatusLabel(reservation.status)}
                      </span>
                    </div>
                    <p className="portal-meta">
                      Código {reservation.code}
                      {start ? ` · Inicio: ${start}` : ""}
                    </p>
                    <p className="portal-meta">
                      {travelersText(reservation.adults, reservation.children)}
                      {total ? ` · ${total}` : ""}
                    </p>
                    <div className="portal-actions">
                      <Link className="btn btn-primary" href={`/mi-cuenta/reservas/${reservation.id}`}>
                        Ver reserva
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionState>
      </section>
    </div>
  );
}
