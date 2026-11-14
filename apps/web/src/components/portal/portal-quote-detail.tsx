"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatCop } from "@/components/public/money";
import { asList, normalizeQuoteDetail, portalPost, type QuoteDetail, type ReservationSummary } from "./portal-api";
import {
  buildReservationBody,
  buildTravelerRows,
  formatDay,
  hasFormErrors,
  minStartDate,
  portalErrorMessage,
  quoteStatusLabel,
  reservationStatusLabel,
  validateReservationForm,
  type ReservationFormErrors,
  type TravelerCategory,
  type TravelerRow,
} from "./portal-logic";
import { useResource } from "./use-resource";

type Notice = { kind: "ok" | "error"; text: string } | null;

const parseReservations = (data: unknown): ReservationSummary[] | null =>
  Array.isArray(data) ? asList<ReservationSummary>(data) : null;

function NoticeView({ notice }: Readonly<{ notice: Notice }>) {
  return (
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
  );
}

function ReservationForm({
  quote,
  csrfToken,
  onConflict,
}: Readonly<{ quote: QuoteDetail; csrfToken: string; onConflict: () => void }>) {
  const router = useRouter();
  const minDate = minStartDate();
  const travelDay = quote.travelDate?.slice(0, 10) ?? "";
  const [startsOn, setStartsOn] = useState(travelDay >= minDate ? travelDay : "");
  const [rows, setRows] = useState<TravelerRow[]>(() => buildTravelerRows(quote.adults, quote.children));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<ReservationFormErrors>({ rows: {} });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function updateRow(index: number, patch: Partial<TravelerRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const input = { startsOn, rows, notes };
    const found = validateReservationForm(input, minDate);
    setErrors(found);
    setFormError(null);
    if (hasFormErrors(found)) {
      setFormError("Revisa los campos marcados antes de enviar tu solicitud de reserva.");
      queueMicrotask(() => summaryRef.current?.focus());
      return;
    }
    setPending(true);
    const result = await portalPost(`/me/quotes/${quote.id}/reservation`, buildReservationBody(input), csrfToken);
    if (!result.ok) {
      if (result.status === 409) onConflict();
      setFormError(
        result.status === 400
          ? "Revisa los datos: los viajeros deben coincidir con los adultos y menores de la propuesta, y la fecha debe ser futura."
          : portalErrorMessage(result.status),
      );
      setPending(false);
      queueMicrotask(() => summaryRef.current?.focus());
      return;
    }
    const reservationId = (result.data as { id?: unknown } | null)?.id;
    router.push(typeof reservationId === "string" ? `/mi-cuenta/reservas/${reservationId}` : "/mi-cuenta");
  }

  return (
    <form
      className="portal-panel"
      onSubmit={submit}
      aria-labelledby="portal-reserve-title"
      aria-busy={pending}
      noValidate
    >
      <h3 id="portal-reserve-title">Solicitar reserva</h3>
      <p className="wz-note">
        Indica la fecha de inicio y los datos de cada viajero. Un asesor validará la disponibilidad antes de cualquier
        pago.
      </p>
      <div ref={summaryRef} tabIndex={-1} aria-live="assertive" className="portal-error-summary">
        {formError ? (
          <p className="form-status error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>
      <label className="field">
        Fecha de inicio del viaje
        <input
          type="date"
          name="startsOn"
          value={startsOn}
          min={minDate}
          onChange={(event) => setStartsOn(event.target.value)}
          required
          aria-invalid={errors.startsOn ? true : undefined}
          aria-describedby={errors.startsOn ? "startsOn-error" : undefined}
        />
        {errors.startsOn ? (
          <span id="startsOn-error" className="field-error">
            {errors.startsOn}
          </span>
        ) : null}
      </label>
      {rows.map((row, index) => {
        const rowErrors = errors.rows[index];
        const isMinor = row.category !== "ADULT";
        return (
          <fieldset key={index} className="wz-fieldset portal-traveler">
            <legend>{`Viajero ${index + 1} · ${isMinor ? "Menor" : "Adulto"}`}</legend>
            <label className="field">
              Nombre completo
              <input
                name={`traveler-${index}-name`}
                value={row.fullName}
                onChange={(event) => updateRow(index, { fullName: event.target.value })}
                required
                minLength={2}
                maxLength={160}
                autoComplete="off"
                aria-invalid={rowErrors?.fullName ? true : undefined}
                aria-describedby={rowErrors?.fullName ? `traveler-${index}-name-error` : undefined}
              />
              {rowErrors?.fullName ? (
                <span id={`traveler-${index}-name-error`} className="field-error">
                  {rowErrors.fullName}
                </span>
              ) : null}
            </label>
            {isMinor ? (
              <div className="portal-traveler-minor">
                <label className="field">
                  Categoría
                  <select
                    name={`traveler-${index}-category`}
                    value={row.category}
                    onChange={(event) => updateRow(index, { category: event.target.value as TravelerCategory })}
                  >
                    <option value="CHILD">Niño o niña</option>
                    <option value="INFANT">Infante</option>
                  </select>
                </label>
                <label className="field">
                  Edad (años)
                  <input
                    name={`traveler-${index}-age`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={17}
                    step={1}
                    value={row.ageYears}
                    onChange={(event) => updateRow(index, { ageYears: event.target.value })}
                    required
                    aria-invalid={rowErrors?.ageYears ? true : undefined}
                    aria-describedby={rowErrors?.ageYears ? `traveler-${index}-age-error` : undefined}
                  />
                  {rowErrors?.ageYears ? (
                    <span id={`traveler-${index}-age-error`} className="field-error">
                      {rowErrors.ageYears}
                    </span>
                  ) : null}
                </label>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      <label className="field">
        Notas para el asesor (opcional)
        <textarea
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          aria-invalid={errors.notes ? true : undefined}
        />
        {errors.notes ? <span className="field-error">{errors.notes}</span> : null}
      </label>
      <p className="wz-note">
        La disponibilidad la confirma un asesor; no hay cupos garantizados hasta la confirmación.
      </p>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Enviando solicitud…" : "Enviar solicitud de reserva"}
      </button>
    </form>
  );
}

function ListBlock({ title, items }: Readonly<{ title: string; items: string[] }>) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="wz-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function PortalQuoteDetail({ id, csrfToken }: Readonly<{ id: string; csrfToken: string }>) {
  const { state, reload } = useResource(`/me/quotes/${encodeURIComponent(id)}`, normalizeQuoteDetail);
  const reservations = useResource("/me/reservations", parseReservations);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const ready = state.status === "ready";

  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (state.status === "loading") return <p role="status">Cargando solicitud…</p>;
  if (state.status === "error") {
    return (
      <div>
        <p className="form-status error" role="alert">
          {portalErrorMessage(state.httpStatus, "No pudimos cargar esta solicitud.")}
        </p>
        <p>
          <Link href="/mi-cuenta" className="wz-link">
            Volver a mi cuenta
          </Link>
        </p>
      </div>
    );
  }

  const quote = state.data;
  const total = formatCop(quote.totalCents);
  const travel = formatDay(quote.travelDate);
  const reservationId =
    quote.reservation?.id ??
    (reservations.state.status === "ready"
      ? reservations.state.data.find((item) => item.code === quote.reservation?.code)?.id
      : undefined);

  async function decide(decision: "ACCEPT" | "DECLINE") {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const result = await portalPost(
      `/me/quotes/${quote.id}/decision`,
      { decision, expectedRevision: quote.revision },
      csrfToken,
    );
    setPending(false);
    setConfirming(null);
    reload();
    if (result.ok) {
      setNotice({
        kind: "ok",
        text:
          decision === "ACCEPT"
            ? "Aceptaste la propuesta. Ahora puedes solicitar tu reserva."
            : "Rechazaste la propuesta. Si cambias de opinión, escríbenos y un asesor te ayudará.",
      });
    } else {
      setNotice({ kind: "error", text: portalErrorMessage(result.status) });
    }
  }

  return (
    <article className="portal-detail" aria-labelledby="portal-quote-title">
      <p>
        <Link href="/mi-cuenta" className="wz-link">
          ← Volver a mi cuenta
        </Link>
      </p>
      <h2 id="portal-quote-title" ref={headingRef} tabIndex={-1} className="portal-title">
        {quote.packageName ?? "Solicitud de viaje"}
      </h2>
      <p>
        <span className="portal-badge" data-status={quote.status}>
          {quoteStatusLabel(quote.status)}
        </span>
      </p>
      <NoticeView notice={notice} />

      <section className="wz-summary portal-panel" aria-labelledby="portal-quote-summary">
        <h3 id="portal-quote-summary">Resumen</h3>
        <dl>
          <div>
            <dt>Referencia</dt>
            <dd>{quote.reference}</dd>
          </div>
          {quote.destinationName ? (
            <div>
              <dt>Destino</dt>
              <dd>{quote.destinationName}</dd>
            </div>
          ) : null}
          {quote.hotelName ? (
            <div>
              <dt>Alojamiento</dt>
              <dd>
                {quote.hotelName}
                {quote.roomTypeName ? ` · ${quote.roomTypeName}` : ""}
              </dd>
            </div>
          ) : null}
          {travel ? (
            <div>
              <dt>Fecha tentativa</dt>
              <dd>{travel}</dd>
            </div>
          ) : null}
          <div>
            <dt>Viajeros</dt>
            <dd>
              {quote.adults} {quote.adults === 1 ? "adulto" : "adultos"}
              {quote.children > 0 ? ` · ${quote.children} ${quote.children === 1 ? "menor" : "menores"}` : ""}
            </dd>
          </div>
        </dl>
      </section>

      <section className="portal-panel" aria-labelledby="portal-quote-price">
        <h3 id="portal-quote-price">Valor</h3>
        {total ? (
          <div className="wz-price" data-status="priced">
            {quote.lines.length ? (
              <ul className="wz-lines">
                {quote.lines.map((line, index) => {
                  const lineTotal = formatCop(line.totalCents ?? null);
                  return (
                    <li key={index}>
                      <span>
                        {line.label}
                        {line.quantity && line.quantity > 1 ? <small>Cantidad: {line.quantity}</small> : null}
                      </span>
                      {lineTotal ? <strong>{lineTotal}</strong> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="wz-total">
              <span>Total</span>
              <strong>{total}</strong>
            </p>
            <p className="wz-note">Valores en pesos colombianos ({quote.currency}).</p>
          </div>
        ) : (
          <div className="wz-price wz-price-manual" data-status="manual">
            <p>Un asesor confirmará el valor antes de cualquier compromiso.</p>
            {quote.reviewReasons.length ? (
              <ul className="wz-list">
                {quote.reviewReasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {quote.inclusions.length || quote.exclusions.length ? (
        <section className="portal-panel wz-lists" aria-label="Inclusiones y exclusiones">
          <ListBlock title="Incluye" items={quote.inclusions} />
          <ListBlock title="No incluye" items={quote.exclusions} />
        </section>
      ) : null}

      {quote.status === "PROPOSAL_SENT" ? (
        <section className="portal-panel" aria-labelledby="portal-decision-title">
          <h3 id="portal-decision-title">Tu decisión</h3>
          <p className="wz-note">Un asesor te envió esta propuesta. Puedes aceptarla o rechazarla.</p>
          {confirming ? (
            <div
              ref={confirmRef}
              tabIndex={-1}
              role="group"
              aria-labelledby="portal-confirm-title"
              className="portal-confirm"
            >
              <p id="portal-confirm-title">
                {confirming === "ACCEPT"
                  ? "¿Confirmas que aceptas esta propuesta? Después podrás solicitar tu reserva; la disponibilidad aún no está garantizada."
                  : "¿Confirmas que rechazas esta propuesta? Esta acción no se puede deshacer."}
              </p>
              <div className="wz-nav">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => void decide(confirming)}
                >
                  {pending ? "Enviando…" : confirming === "ACCEPT" ? "Sí, aceptar" : "Sí, rechazar"}
                </button>
                <button
                  type="button"
                  className="portal-btn-quiet"
                  disabled={pending}
                  onClick={() => setConfirming(null)}
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="wz-nav">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!total}
                onClick={() => setConfirming("ACCEPT")}
              >
                Aceptar propuesta
              </button>
              <button type="button" className="portal-btn-quiet" onClick={() => setConfirming("DECLINE")}>
                Rechazar propuesta
              </button>
            </div>
          )}
        </section>
      ) : null}

      {quote.status === "ACCEPTED" && !quote.reservation && total ? (
        <ReservationForm key={quote.revision} quote={quote} csrfToken={csrfToken} onConflict={reload} />
      ) : null}

      {quote.reservation ? (
        <section className="portal-panel" aria-labelledby="portal-linked-reservation">
          <h3 id="portal-linked-reservation">Tu reserva</h3>
          <p>
            Reserva {quote.reservation.code} · {reservationStatusLabel(quote.reservation.status)}
          </p>
          {reservationId ? (
            <Link className="btn btn-primary" href={`/mi-cuenta/reservas/${reservationId}`}>
              Ver reserva
            </Link>
          ) : (
            <Link className="wz-link" href="/mi-cuenta">
              Ver mis reservas
            </Link>
          )}
        </section>
      ) : null}
    </article>
  );
}
