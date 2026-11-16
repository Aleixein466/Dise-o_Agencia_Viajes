"use client";

import { useState, type FormEvent } from "react";
import { requestPublic, type ApiFailure, type TrackResult } from "./api";
import { formatCop } from "./money";
import "./wizard.css";

export const STATUS_LABELS: Record<string, string> = {
  NEW: "Recibida",
  REQUIRES_MANUAL_REVIEW: "En revisión por un asesor",
  DRAFT: "En preparación",
  ASSIGNED: "Asignada a un asesor",
  PROPOSAL_SENT: "Propuesta enviada",
  ACCEPTED: "Aceptada",
  DECLINED: "No aceptada",
  CLOSED: "Cerrada",
};

const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function TrackResultView({ result }: Readonly<{ result: TrackResult }>) {
  const total = formatCop(result.totalCents);
  const created = new Date(result.createdAt);
  const travel = result.travelDate ? new Date(`${result.travelDate.slice(0, 10)}T00:00:00Z`) : null;
  return (
    <div className="wz-track-result" role="status">
      <dl>
        <div>
          <dt>Referencia</dt>
          <dd>{result.reference}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{STATUS_LABELS[result.status] ?? result.status}</dd>
        </div>
        {result.packageName ? (
          <div>
            <dt>Paquete</dt>
            <dd>{result.packageName}</dd>
          </div>
        ) : null}
        {Number.isNaN(created.getTime()) ? null : (
          <div>
            <dt>Fecha de solicitud</dt>
            <dd>{dateTimeFormat.format(created)}</dd>
          </div>
        )}
        {travel && !Number.isNaN(travel.getTime()) ? (
          <div>
            <dt>Fecha tentativa</dt>
            <dd>{dateFormat.format(travel)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Valor estimado</dt>
          <dd>{total ?? "Un asesor confirmará el valor"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TrackForm() {
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const response = await requestPublic<TrackResult>("/api/v1/public/quote-requests/track", {
      method: "POST",
      body: { reference: reference.trim(), trackingCode: code.trim() },
    });
    setLoading(false);
    if (response.ok) setResult(response.data);
    else
      setError(
        response.code === "notfound" || response.code === "invalid"
          ? { ...response, message: "No encontramos una solicitud con esa referencia y ese código. Revisa los datos." }
          : response,
      );
  }

  return (
    <form className="form-panel wizard-panel" onSubmit={submit} aria-labelledby="track-title">
      <h2 id="track-title">Consulta tu solicitud</h2>
      <p>Ingresa la referencia y el código de seguimiento que recibiste al enviar tu solicitud.</p>
      <label className="field">
        Referencia
        <input
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          required
          maxLength={64}
          autoComplete="off"
        />
      </label>
      <label className="field">
        Código de seguimiento
        <input
          name="trackingCode"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          maxLength={64}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <div aria-live="assertive">
        {error ? (
          <p className="form-status error" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Consultando…" : "Consultar"}
      </button>
      {result ? <TrackResultView result={result} /> : null}
    </form>
  );
}
