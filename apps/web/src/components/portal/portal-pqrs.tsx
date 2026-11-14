"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  PQRS_TYPES,
  canReceiveMessages,
  formatDate,
  normalizeTicket,
  pqrsErrorMessage,
  pqrsStatusLabel,
  pqrsTypeLabel,
  validateIntake,
  validateMessage,
} from "@/components/pqrs/pqrs-logic";
import { PqrsMessages, PqrsSummary } from "@/components/pqrs/pqrs-thread";
import { loadCustomerSession, portalPost } from "./portal-api";
import { PortalGate } from "./portal-gate";
import { portalErrorMessage } from "./portal-logic";
import { useResource, type ResourceState } from "./use-resource";

type PqrsRow = {
  id: string;
  reference: string;
  type: string;
  status: string;
  subject: string;
  createdAt: string;
  responseDueAt: string | null;
};

const parseList = (data: unknown): PqrsRow[] | null => {
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as PqrsRow[]) : null;
};

function ListBody({ state, onRetry }: Readonly<{ state: ResourceState<PqrsRow[]>; onRetry: () => void }>) {
  if (state.status === "loading") return <p role="status">Cargando…</p>;
  if (state.status === "error") {
    return (
      <div role="alert" className="form-status error">
        {portalErrorMessage(state.httpStatus, "No pudimos cargar tus PQRS.")}{" "}
        <button type="button" className="wz-link" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (state.data.length === 0) return <p className="portal-empty">Aún no has radicado ninguna PQRS.</p>;
  return (
    <ul className="portal-cards">
      {state.data.map((item) => (
        <li key={item.id} className="portal-card">
          <div className="portal-card-head">
            <strong>{item.subject}</strong>
            <span className="portal-badge" data-status={item.status}>
              {pqrsStatusLabel(item.status)}
            </span>
          </div>
          <p className="portal-meta">
            Ref. {item.reference} · {pqrsTypeLabel(item.type)} · Respuesta antes de: {formatDate(item.responseDueAt)}
          </p>
          <div className="portal-actions">
            <Link className="btn btn-primary" href={`/mi-cuenta/pqrs/${item.id}`}>
              Ver PQRS
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NewPqrsForm({ csrfToken, onCreated }: Readonly<{ csrfToken: string; onCreated: () => void }>) {
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = validateIntake({ type, subject, description }, false);
    setErrors(found);
    setFailure(null);
    setDone(null);
    if (Object.keys(found).length > 0) return;
    key.current ??= crypto.randomUUID();
    setPending(true);
    const result = await portalPost(
      "/me/pqrs",
      { type, subject: subject.trim(), description: description.trim(), idempotencyKey: key.current },
      csrfToken,
    );
    setPending(false);
    if (!result.ok) {
      if (result.status === 400) key.current = null;
      setFailure(pqrsErrorMessage(result.status, result.data, "No pudimos radicar tu PQRS. Inténtalo de nuevo."));
      return;
    }
    const reference = (result.data as { reference?: unknown } | null)?.reference;
    setDone(`Radicamos tu PQRS${typeof reference === "string" ? ` con la referencia ${reference}` : ""}.`);
    key.current = null;
    setType("");
    setSubject("");
    setDescription("");
    onCreated();
  }

  const invalid = (field: string) =>
    errors[field] ? { "aria-invalid": true, "aria-describedby": `portal-pqrs-err-${field}` } : {};
  const fieldError = (field: string) =>
    errors[field] ? (
      <small className="field-error" id={`portal-pqrs-err-${field}`}>
        {errors[field]}
      </small>
    ) : null;

  return (
    <form className="form-panel" onSubmit={submit} noValidate aria-labelledby="portal-pqrs-new-title">
      <h4 id="portal-pqrs-new-title">Nueva PQRS</h4>
      <label className="field">
        Tipo de solicitud *
        <select value={type} onChange={(event) => setType(event.target.value)} required {...invalid("type")}>
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
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={5000}
          rows={5}
          required
          {...invalid("description")}
        />
        {fieldError("description")}
      </label>
      <div aria-live="polite">{done ? <p className="form-status">{done}</p> : null}</div>
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

export function PortalPqrsSection() {
  const list = useResource("/me/pqrs", parseList);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfFailed, setCsrfFailed] = useState(false);

  async function openForm() {
    setCsrfFailed(false);
    const session = await loadCustomerSession();
    if (session.status === "ready") setCsrfToken(session.csrfToken);
    else setCsrfFailed(true);
  }
  return (
    <section aria-labelledby="portal-pqrs-title" className="portal-section">
      <h3 id="portal-pqrs-title">Mis PQRS</h3>
      <ListBody state={list.state} onRetry={list.reload} />
      {csrfToken ? (
        <NewPqrsForm csrfToken={csrfToken} onCreated={list.reload} />
      ) : (
        <div className="portal-actions">
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            Nueva PQRS
          </button>
          <div aria-live="assertive">
            {csrfFailed ? (
              <p className="form-status error" role="alert">
                Tu sesión expiró. Vuelve a iniciar sesión.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export function PortalPqrsPage({ id }: Readonly<{ id: string }>) {
  return <PortalGate>{(session) => <PortalPqrsDetail id={id} csrfToken={session.csrfToken} />}</PortalGate>;
}

function PortalPqrsDetail({ id, csrfToken }: Readonly<{ id: string; csrfToken: string }>) {
  const { state, reload } = useResource(`/me/pqrs/${encodeURIComponent(id)}`, normalizeTicket);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const ready = state.status === "ready";

  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  if (state.status === "loading") return <p role="status">Cargando PQRS…</p>;
  if (state.status === "error") {
    return (
      <div>
        <p className="form-status error" role="alert">
          {portalErrorMessage(state.httpStatus, "No pudimos cargar esta PQRS.")}
        </p>
        <p>
          <Link href="/mi-cuenta" className="wz-link">
            Volver a mi cuenta
          </Link>
        </p>
      </div>
    );
  }

  const ticket = state.data;

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const invalid = validateMessage(message);
    setSent(false);
    setProblem(invalid);
    if (invalid) return;
    setPending(true);
    const result = await portalPost(
      `/me/pqrs/${encodeURIComponent(id)}/messages`,
      { message: message.trim() },
      csrfToken,
    );
    setPending(false);
    if (result.ok) {
      setMessage("");
      setSent(true);
    } else setProblem(pqrsErrorMessage(result.status, result.data, "No pudimos enviar tu mensaje."));
    if (result.ok || result.status === 409) reload();
  }

  return (
    <div className="portal-dashboard">
      <p>
        <Link href="/mi-cuenta" className="wz-link">
          Volver a mi cuenta
        </Link>
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="portal-title">
        {ticket.subject}
      </h2>
      <PqrsSummary ticket={ticket} />
      <section aria-labelledby="portal-pqrs-messages-title" className="portal-section">
        <h3 id="portal-pqrs-messages-title">Mensajes</h3>
        <PqrsMessages ticket={ticket} />
      </section>
      {canReceiveMessages(ticket.status) ? (
        <form className="form-panel" onSubmit={reply} noValidate aria-labelledby="portal-pqrs-reply-title">
          <h3 id="portal-pqrs-reply-title">Responder</h3>
          <label className="field">
            Tu mensaje
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={5000}
              rows={4}
              required
              {...(problem ? { "aria-invalid": true } : {})}
            />
          </label>
          <div aria-live="polite">{sent ? <p className="form-status">Mensaje enviado.</p> : null}</div>
          <div aria-live="assertive">
            {problem ? (
              <p className="form-status error" role="alert">
                {problem}
              </p>
            ) : null}
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Enviando…" : "Enviar mensaje"}
          </button>
        </form>
      ) : (
        <p className="portal-meta">Esta PQRS está cerrada y ya no recibe mensajes.</p>
      )}
    </div>
  );
}
