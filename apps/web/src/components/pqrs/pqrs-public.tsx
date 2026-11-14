"use client";

import { useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import "@/components/public/wizard.css";
import {
  PQRS_TYPES,
  formatDate,
  normalizeTicket,
  pqrsErrorMessage,
  pqrsTypeLabel,
  validateIntake,
  type PqrsTicket,
} from "./pqrs-logic";
import { PqrsMessages, PqrsSummary } from "./pqrs-thread";

type Created = { reference: string; trackingCode: string | null; responseDueAt: string | null; replay: boolean };

export function PqrsIntakeForm() {
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const key = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = validateIntake({ type, subject, description, name, email, phone }, true);
    if (!consent) found.dataConsent = "Debes autorizar el tratamiento de tus datos para continuar.";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    key.current ??= crypto.randomUUID();
    setPending(true);
    const result = await requestJson("/api/v1/public/pqrs", "POST", {
      type,
      subject: subject.trim(),
      description: description.trim(),
      name: name.trim(),
      email: email.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      dataConsent: true,
      idempotencyKey: key.current,
      website,
    });
    setPending(false);
    if (!result.ok) {
      if (result.status === 400) key.current = null;
      setFailure(pqrsErrorMessage(result.status, result.data, "No pudimos radicar tu PQRS. Inténtalo de nuevo."));
      return;
    }
    const data = (result.data ?? {}) as { reference?: unknown; trackingCode?: unknown; responseDueAt?: unknown };
    setCreated({
      reference: typeof data.reference === "string" ? data.reference : "",
      trackingCode: typeof data.trackingCode === "string" ? data.trackingCode : null,
      responseDueAt: typeof data.responseDueAt === "string" ? data.responseDueAt : null,
      replay: result.status === 200,
    });
  }

  if (created) {
    return (
      <div className="form-panel wizard-panel wz-done" aria-labelledby="pqrs-done-title">
        <h2 id="pqrs-done-title">Recibimos tu PQRS</h2>
        {created.reference ? (
          <dl>
            <div>
              <dt>Referencia</dt>
              <dd className="wz-code">{created.reference}</dd>
            </div>
            {created.trackingCode ? (
              <div>
                <dt>Código de seguimiento</dt>
                <dd className="wz-code">{created.trackingCode}</dd>
              </div>
            ) : null}
            {created.responseDueAt ? (
              <div>
                <dt>Fecha límite de respuesta</dt>
                <dd>{formatDate(created.responseDueAt)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="form-status" role="status">
          {created.trackingCode
            ? "Guárdalo ahora: este código de seguimiento solo se muestra una vez y lo necesitas, junto con la referencia, para consultar tu PQRS. No lo enviamos por correo."
            : "El código de seguimiento solo se muestra al radicar la PQRS por primera vez."}
        </p>
      </div>
    );
  }

  const invalid = (field: string) =>
    errors[field] ? { "aria-invalid": true, "aria-describedby": `pqrs-err-${field}` } : {};
  const fieldError = (field: string) =>
    errors[field] ? (
      <span id={`pqrs-err-${field}`} className="field-error" role="alert">
        {errors[field]}
      </span>
    ) : null;

  return (
    <form className="form-panel wizard-panel" onSubmit={submit} noValidate aria-labelledby="pqrs-form-title">
      <h2 id="pqrs-form-title">Radica tu PQRS</h2>
      <label className="field">
        Tipo de solicitud *
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          required
          {...invalid("type")}
        >
          <option value="">Selecciona una opción</option>
          {PQRS_TYPES.map((item) => (
            <option key={item} value={item}>
              {pqrsTypeLabel(item)}
            </option>
          ))}
        </select>
        {fieldError("type")}
      </label>
      <label className="field">
        Asunto *
        <input
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={160}
          required
          {...invalid("subject")}
        />
        {fieldError("subject")}
      </label>
      <label className="field">
        Descripción *
        <textarea
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={5000}
          rows={6}
          required
          {...invalid("description")}
        />
        {fieldError("description")}
      </label>
      <div className="form-row">
        <label className="field">
          Nombre completo *
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={120}
            required
            {...invalid("name")}
          />
          {fieldError("name")}
        </label>
        <label className="field">
          Correo electrónico *
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            {...invalid("email")}
          />
          {fieldError("email")}
        </label>
      </div>
      <label className="field">
        Teléfono (opcional)
        <input
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          maxLength={25}
          {...invalid("phone")}
        />
        {fieldError("phone")}
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Sitio web
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      <label className="checkbox-field">
        <input
          name="dataConsent"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          required
          {...invalid("dataConsent")}
        />
        <span>
          Autorizo el tratamiento de mis datos para gestionar esta PQRS según la{" "}
          <a href="/privacidad" target="_blank" rel="noopener">
            política de privacidad
          </a>
          . *
        </span>
      </label>
      {fieldError("dataConsent")}
      <div aria-live="assertive">
        {failure ? (
          <p className="form-status error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Radicar PQRS"}
      </button>
    </form>
  );
}

export function PqrsTrackForm() {
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<PqrsTicket | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setTicket(null);
    const result = await requestJson("/api/v1/public/pqrs/track", "POST", {
      reference: reference.trim(),
      trackingCode: code.trim(),
    });
    setPending(false);
    const found = result.ok ? normalizeTicket(result.data) : null;
    if (found) setTicket(found);
    else if (result.status === 404 || result.status === 400)
      setError("No encontramos una PQRS con esa referencia y ese código. Revisa los datos.");
    else setError(pqrsErrorMessage(result.status, result.data, "No pudimos consultar tu PQRS. Inténtalo de nuevo."));
  }

  return (
    <form className="form-panel wizard-panel" onSubmit={submit} aria-labelledby="pqrs-track-title">
      <h2 id="pqrs-track-title">Consulta tu PQRS</h2>
      <p>Ingresa la referencia y el código de seguimiento que recibiste al radicarla.</p>
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
            {error}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Consultando…" : "Consultar PQRS"}
      </button>
      <div aria-live="polite">
        {ticket ? (
          <div className="wz-track-result">
            <PqrsSummary ticket={ticket} />
            <h3>Mensajes</h3>
            <PqrsMessages ticket={ticket} />
          </div>
        ) : null}
      </div>
    </form>
  );
}
