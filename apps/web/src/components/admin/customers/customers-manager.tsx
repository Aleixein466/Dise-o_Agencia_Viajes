"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { formatCop, formatDate, formatDateTime } from "../commercial/helpers";
import { useCsrf } from "../commercial/use-commercial-data";
import { statusLabel as quoteStatusLabel } from "../crm-status";
import { reservationStatusLabel } from "../reservation-status";
import {
  NOTE_MAX,
  contactPatch,
  contactValues,
  describeCustomerError,
  latestCaption,
  paymentProviderLabel,
  paymentStatusLabel,
  pqrsStatusLabel,
  pqrsTypeLabel,
  validateContact,
  type ContactErrors,
  type ContactValues,
} from "./helpers";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string | null;
  documentType: string | null;
  documentNumberMasked: string | null;
  hasPortalAccount: boolean;
  quotesCount: number;
  reservationsCount: number;
  updatedAt: string;
};
type Profile = Omit<CustomerRow, "quotesCount" | "reservationsCount"> & {
  createdAt: string;
  counts: { quotes: number; reservations: number; payments: number; pqrs: number; notes: number };
  quotes: { id: string; reference: string; status: string; totalCents: string | null; createdAt: string }[];
  reservations: {
    id: string;
    code: string;
    status: string;
    startsOn: string | null;
    totalCents: string | null;
    createdAt: string;
  }[];
  payments: {
    id: string;
    reference: string;
    status: string;
    provider: string;
    amountCents: string | null;
    createdAt: string;
  }[];
  pqrs: { id: string; reference: string; type: string; status: string; subject: string; createdAt: string }[];
  notes: { id: string; body: string; createdAt: string; author: { id: string; name: string } | null }[];
};

const PAGE_SIZE = 20;
const BASE = "/api/v1/customers";
const CONTACT_FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre", required: true, maxLength: 120 },
  { name: "email", label: "Correo", required: true, maxLength: 254 },
  { name: "phone", label: "Teléfono", required: true, maxLength: 25, inputMode: "text" },
  { name: "country", label: "País", maxLength: 2, hint: "Código de 2 letras (CO, EC…). Opcional." },
];

export function CustomersManager({ session }: Readonly<{ session: AdminSession }>) {
  const csrf = useCsrf(session.csrfToken);
  const canWrite = session.permissions.includes("customers:write");
  const prefix = useId();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ContactValues>({ name: "", email: "", phone: "", country: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const requestId = useRef(0);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  // Focus after React commits the profile; a timeout can run before an async update renders.
  const [focusProfile, setFocusProfile] = useState(0);
  useEffect(() => {
    if (focusProfile) profileHeading.current?.focus();
  }, [focusProfile]);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    const result = await requestJson(`${BASE}?${params.toString()}`, "GET");
    if (current !== requestId.current) return;
    setLoading(false);
    const data = result.data as { items?: CustomerRow[]; total?: number; pages?: number } | null;
    if (result.ok && data && Array.isArray(data.items)) {
      setItems(data.items);
      setMeta({ total: data.total ?? data.items.length, pages: Math.max(1, data.pages ?? 1) });
      setLoadError(null);
    } else setLoadError(describeCustomerError(result).message);
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const fetchProfile = useCallback(async (id: string) => {
    const result = await requestJson(`${BASE}/${id}`, "GET");
    if (!result.ok || !result.data || typeof result.data !== "object") {
      setFailure(describeCustomerError(result).message);
      return null;
    }
    return result.data as Profile;
  }, []);

  async function openProfile(id: string) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) lastTrigger.current = active;
    setNotice(null);
    setFailure(null);
    setEditing(false);
    setNote("");
    setNoteError(null);
    setProfileLoading(true);
    const next = await fetchProfile(id);
    setProfileLoading(false);
    setProfile(next);
    if (next) setFocusProfile((value) => value + 1);
  }
  function closeProfile() {
    setProfile(null);
    setEditing(false);
    const target = lastTrigger.current;
    window.setTimeout(() => (target?.isConnected ? target.focus() : undefined), 0);
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  function startEdit() {
    if (!profile) return;
    setValues(contactValues(profile));
    setErrors({});
    setFormError(null);
    setNotice(null);
    setEditing(true);
    window.setTimeout(() => formHeading.current?.focus(), 0);
  }

  function focusField(name: string) {
    window.setTimeout(() => {
      const target = name === "summary" ? summaryRef.current : document.getElementById(`${prefix}-${name}`);
      target?.focus();
    }, 0);
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const found = validateContact(values);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("Revisa los campos marcados.");
      focusField(
        CONTACT_FIELDS.map((field) => field.name).find((name) => found[name as keyof ContactValues]) ?? "summary",
      );
      return;
    }
    const patch = contactPatch(values, contactValues(profile));
    if (!Object.keys(patch).length) {
      setEditing(false);
      setNotice("No había cambios para guardar.");
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    const result = await requestJson(
      `${BASE}/${profile.id}`,
      "PATCH",
      { ...patch, expectedUpdatedAt: profile.updatedAt },
      csrf,
    );
    setSaving(false);
    if (!result.ok) {
      const described = describeCustomerError(result);
      if (described.field) setErrors({ [described.field]: described.message });
      setFormError(described.message);
      focusField(described.field ?? "summary");
      if (described.code === "STALE_UPDATE") {
        const fresh = await fetchProfile(profile.id);
        if (fresh) {
          setProfile(fresh);
          setValues(contactValues(fresh));
        }
      }
      return;
    }
    setProfile(result.data as Profile);
    setEditing(false);
    setNotice("Datos de contacto guardados.");
    setFocusProfile((value) => value + 1);
    void load();
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const body = note.trim();
    if (!body) {
      setNoteError("Escribe la nota antes de guardarla.");
      document.getElementById(`${prefix}-note`)?.focus();
      return;
    }
    setNoteError(null);
    setNoteSaving(true);
    const result = await requestJson(`${BASE}/${profile.id}/notes`, "POST", { body }, csrf);
    setNoteSaving(false);
    if (!result.ok) {
      setNoteError(describeCustomerError(result).message);
      return;
    }
    setNote("");
    setNotice("Nota interna agregada.");
    const fresh = await fetchProfile(profile.id);
    if (fresh) setProfile(fresh);
  }

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <h2 id={`${prefix}-title`}>Clientes</h2>
        <p className="admin-hint">
          Busca por nombre, correo o teléfono. Los documentos se muestran enmascarados (solo los últimos 4 dígitos).
        </p>
        <form className="admin-users-filters" onSubmit={applySearch} role="search" aria-label="Buscar clientes">
          <label className="admin-field">
            <span>Buscar cliente</span>
            <input
              type="search"
              value={query}
              maxLength={120}
              placeholder="Nombre, correo o teléfono"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="submit" className="admin-btn admin-btn-primary" style={{ alignSelf: "end" }}>
            Buscar
          </button>
        </form>
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
            aria-label="Tabla de clientes"
            aria-busy={loading}
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Historial</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.name}
                      {item.hasPortalAccount ? <p className="admin-hint">Con cuenta en el portal</p> : null}
                    </td>
                    <td>
                      {item.email}
                      <p className="admin-hint">{item.phone}</p>
                    </td>
                    <td>
                      {item.documentNumberMasked
                        ? `${item.documentType ?? "Doc."} ${item.documentNumberMasked}`
                        : "Sin registrar"}
                    </td>
                    <td>
                      {item.quotesCount} {item.quotesCount === 1 ? "cotización" : "cotizaciones"} ·{" "}
                      {item.reservationsCount} {item.reservationsCount === 1 ? "reserva" : "reservas"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        aria-label={`Ver perfil de ${item.name}`}
                        disabled={profileLoading}
                        onClick={() => void openProfile(item.id)}
                      >
                        Ver perfil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">
            {loading ? "Cargando…" : search ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes."}
          </p>
        )}
        <nav className="admin-pagination" aria-label="Paginación de clientes">
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Anterior
          </button>
          <span>
            Página {page} de {meta.pages} · {meta.total} {meta.total === 1 ? "cliente" : "clientes"}
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

      {profile ? (
        <section className="admin-panel" aria-labelledby={`${prefix}-profile`}>
          <div className="admin-section-heading">
            <div>
              <h2 id={`${prefix}-profile`} ref={profileHeading} tabIndex={-1}>
                Cliente: {profile.name}
              </h2>
              <p className="admin-hint">
                Registrado el {formatDateTime(profile.createdAt)}
                {profile.hasPortalAccount ? " · Con cuenta en el portal" : " · Sin cuenta en el portal"}
              </p>
            </div>
            <div className="admin-row-actions">
              {canWrite && !editing ? (
                <button type="button" className="admin-btn admin-btn-primary" onClick={startEdit}>
                  Editar contacto
                </button>
              ) : null}
              <button type="button" className="admin-btn admin-btn-quiet" onClick={closeProfile}>
                Cerrar perfil
              </button>
            </div>
          </div>

          {editing ? (
            <div aria-labelledby={`${prefix}-edit`} role="group">
              <h3 id={`${prefix}-edit`} ref={formHeading} tabIndex={-1}>
                Editar datos de contacto
              </h3>
              <p className="admin-hint">
                Los campos con * son obligatorios. El documento no se edita aquí.
                {profile.hasPortalAccount ? " El correo es el de acceso al portal y no se puede cambiar." : ""}
              </p>
              {formError ? (
                <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
                  {formError}
                </p>
              ) : null}
              <form
                className="admin-form admin-commercial-form"
                noValidate
                onSubmit={(event) => void saveContact(event)}
              >
                <FormFields
                  prefix={prefix}
                  fields={CONTACT_FIELDS}
                  values={values}
                  errors={errors}
                  onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
                />
                <div className="admin-form-actions">
                  <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar contacto"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-quiet"
                    onClick={() => {
                      setEditing(false);
                      setFocusProfile((value) => value + 1);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="admin-grid" role="list" aria-label="Datos de contacto">
              {[
                ["Correo", profile.email],
                ["Teléfono", profile.phone],
                ["País", profile.country ?? "Sin registrar"],
                [
                  "Documento",
                  profile.documentNumberMasked
                    ? `${profile.documentType ?? "Doc."} ${profile.documentNumberMasked}`
                    : "Sin registrar",
                ],
              ].map(([label, value]) => (
                <div key={label} role="listitem">
                  <p className="admin-hint">{label}</p>
                  <p style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          <h3>Resumen</h3>
          <div className="admin-grid" role="list" aria-label="Totales del cliente">
            {[
              ["Cotizaciones", profile.counts.quotes],
              ["Reservas", profile.counts.reservations],
              ["Pagos", profile.counts.payments],
              ["PQRS", profile.counts.pqrs],
            ].map(([label, value]) => (
              <div key={label} role="listitem">
                <p className="admin-stat">{value}</p>
                <p className="admin-stat-detail">{label}</p>
              </div>
            ))}
          </div>

          <History
            title="Cotizaciones"
            caption={latestCaption(profile.quotes.length, profile.counts.quotes)}
            head={["Referencia", "Estado", "Total", "Fecha"]}
            rows={profile.quotes.map((item) => [
              item.reference,
              quoteStatusLabel(item.status),
              formatCop(item.totalCents),
              formatDateTime(item.createdAt),
            ])}
          />
          <History
            title="Reservas"
            caption={latestCaption(profile.reservations.length, profile.counts.reservations)}
            head={["Código", "Estado", "Salida", "Total"]}
            rows={profile.reservations.map((item) => [
              item.code,
              reservationStatusLabel(item.status),
              formatDate(item.startsOn),
              formatCop(item.totalCents),
            ])}
          />
          <History
            title="Pagos"
            caption={latestCaption(profile.payments.length, profile.counts.payments)}
            head={["Referencia", "Medio", "Estado", "Valor", "Fecha"]}
            rows={profile.payments.map((item) => [
              item.reference,
              paymentProviderLabel(item.provider),
              paymentStatusLabel(item.status),
              formatCop(item.amountCents),
              formatDateTime(item.createdAt),
            ])}
          />
          <History
            title="PQRS"
            caption={latestCaption(profile.pqrs.length, profile.counts.pqrs)}
            head={["Radicado", "Tipo", "Asunto", "Estado", "Fecha"]}
            rows={profile.pqrs.map((item) => [
              item.reference,
              pqrsTypeLabel(item.type),
              item.subject,
              pqrsStatusLabel(item.status),
              formatDateTime(item.createdAt),
            ])}
          />

          <h3 id={`${prefix}-notes`}>Notas internas</h3>
          <p className="admin-hint">
            Solo las ve el equipo de la agencia; nunca se muestran en el portal del cliente.{" "}
            {latestCaption(profile.notes.length, profile.counts.notes)}.
          </p>
          {profile.notes.length ? (
            <ol className="admin-activity" aria-labelledby={`${prefix}-notes`}>
              {profile.notes.map((item) => (
                <li key={item.id}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.body}</p>
                  <span className="admin-hint">
                    {item.author?.name ?? "Usuario eliminado"} ·{" "}
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="admin-empty">Sin notas internas.</p>
          )}
          {canWrite ? (
            <form className="admin-form" noValidate onSubmit={(event) => void addNote(event)}>
              <div className="admin-field admin-field-wide">
                <label htmlFor={`${prefix}-note`}>Nueva nota interna</label>
                <textarea
                  id={`${prefix}-note`}
                  value={note}
                  maxLength={NOTE_MAX}
                  aria-invalid={noteError ? true : undefined}
                  aria-describedby={noteError ? `${prefix}-note-error` : `${prefix}-note-hint`}
                  onChange={(event) => setNote(event.target.value)}
                />
                <p id={`${prefix}-note-hint`} className="admin-hint">
                  Máximo {NOTE_MAX} caracteres. No escribas números de documento ni datos de pago.
                </p>
                {noteError ? (
                  <p id={`${prefix}-note-error`} className="admin-field-error" role="alert">
                    {noteError}
                  </p>
                ) : null}
              </div>
              <div className="admin-form-actions">
                <button type="submit" className="admin-btn admin-btn-primary" disabled={noteSaving}>
                  {noteSaving ? "Guardando…" : "Agregar nota"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : profileLoading ? (
        <p className="admin-empty" role="status">
          Cargando perfil…
        </p>
      ) : null}
    </div>
  );
}

function History({
  title,
  caption,
  head,
  rows,
}: Readonly<{ title: string; caption: string; head: string[]; rows: string[][] }>) {
  return (
    <>
      <h3>{title}</h3>
      <p className="admin-hint">{caption}</p>
      {rows.length ? (
        <div className="admin-table-wrap" role="region" aria-label={`${title} del cliente`} tabIndex={0}>
          <table className="admin-table">
            <thead>
              <tr>
                {head.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
