"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { HistoryPanel, type AuditRow } from "./content/history-panel";
import { useDialog } from "./use-dialog";

type Destination = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  description: string | null;
  category: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
  sortOrder: number;
  updatedAt: string;
};
type Values = {
  slug: string;
  name: string;
  country: string;
  region: string;
  description: string;
  category: string;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  sortOrder: string;
};
const empty: Values = {
  slug: "",
  name: "",
  country: "Colombia",
  region: "",
  description: "",
  category: "NACIONAL",
  seoTitle: "",
  seoDescription: "",
  noindex: false,
  sortOrder: "0",
};
const valuesOf = (item: Destination): Values => ({
  slug: item.slug,
  name: item.name,
  country: item.country,
  region: item.region ?? "",
  description: item.description ?? "",
  category: item.category ?? "NACIONAL",
  seoTitle: item.seoTitle ?? "",
  seoDescription: item.seoDescription ?? "",
  noindex: item.noindex,
  sortOrder: String(item.sortOrder),
});
const payload = (values: Values) => ({
  ...values,
  region: values.region.trim(),
  description: values.description.trim(),
  seoTitle: values.seoTitle.trim(),
  seoDescription: values.seoDescription.trim(),
  sortOrder: Number(values.sortOrder),
});
const ACTION_LABELS: Record<string, string> = {
  created: "Creado como borrador",
  updated: "Editado",
  published: "Publicado",
  unpublished: "Retirado del sitio",
  archived: "Archivado",
};
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  slug: "Slug",
  country: "País",
  region: "Región",
  description: "Descripción",
  category: "Categoría",
  seoTitle: "Título SEO",
  seoDescription: "Descripción SEO",
  noindex: "Excluir de buscadores",
  sortOrder: "Orden",
  status: "Estado",
};

function actionLabel(action: string) {
  const suffix = action.split(".").pop() ?? action;
  return ACTION_LABELS[suffix] ?? action;
}
function summarize(row: AuditRow): string[] {
  if (!row.before || !row.after) return [];
  return Object.entries(FIELD_LABELS).flatMap(([key, label]) =>
    JSON.stringify(row.before?.[key] ?? null) === JSON.stringify(row.after?.[key] ?? null)
      ? []
      : [`${label}: ${String(row.before?.[key] ?? "sin valor")} → ${String(row.after?.[key] ?? "sin valor")}`],
  );
}
function errorMessage(result: { status: number; data: unknown }) {
  const code = (result.data as { code?: unknown } | null)?.code;
  if (code === "STALE_UPDATE")
    return "Otra persona modificó el destino. La lista se recargó; revisa e intenta de nuevo.";
  if (code === "DESTINATION_SLUG_TAKEN") return "Ese slug ya pertenece a otro destino.";
  if (result.status === 403) return "No tienes autorización para esta acción.";
  if (result.status === 404) return "El destino ya no existe.";
  return "No se pudo completar la acción.";
}

export function DestinationsManager({ session }: Readonly<{ session: AdminSession }>) {
  const { confirm, dialog } = useDialog();
  const [items, setItems] = useState<Destination[]>([]);
  const [form, setForm] = useState<Values>(empty);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [query, setQuery] = useState("");
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ item: Destination; rows: AuditRow[] | null } | null>(null);
  const canPublish = session.permissions.includes("catalog:publish") || session.permissions.includes("*");

  const load = useCallback(async (search = "") => {
    const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const result = await requestJson(`/api/v1/catalog/destinations${suffix}`, "GET");
    if (result.ok && Array.isArray(result.data)) {
      setItems(result.data as Destination[]);
      setError(null);
    } else setError("No se pudieron cargar los destinos.");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function closeForm() {
    setEditing(null);
    setForm(empty);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    const body = editing ? { ...payload(form), expectedUpdatedAt: editing.updatedAt } : payload(form);
    const result = editing
      ? await requestJson(`/api/v1/catalog/destinations/${editing.id}`, "PATCH", body, csrf)
      : await requestJson("/api/v1/catalog/destinations", "POST", body, csrf);
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      if ((result.data as { code?: unknown } | null)?.code === "STALE_UPDATE") await load(query);
      return;
    }
    setMessage(editing ? "Destino actualizado y persistido." : "Destino guardado como borrador.");
    closeForm();
    await load(query);
  }

  async function transition(item: Destination, action: "publish" | "unpublish" | "archive") {
    const label = action === "publish" ? "Publicar" : action === "unpublish" ? "Retirar del sitio" : "Archivar";
    if (!(await confirm(`${label} ${item.name}?`, { confirmLabel: label, danger: action === "archive" }))) return;
    setPending(true);
    setError(null);
    const result = await requestJson(
      `/api/v1/catalog/destinations/${item.id}/${action}`,
      "POST",
      { expectedUpdatedAt: item.updatedAt },
      csrf,
    );
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      await load(query);
      return;
    }
    setMessage(
      action === "publish"
        ? "Destino publicado."
        : action === "unpublish"
          ? "Destino retirado del sitio público."
          : "Destino archivado.",
    );
    await load(query);
  }

  async function showHistory(item: Destination) {
    setHistory({ item, rows: null });
    const result = await requestJson(`/api/v1/catalog/destinations/${item.id}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(null);
      setError("No se pudo consultar el historial.");
      return;
    }
    setHistory({ item, rows: result.data as AuditRow[] });
  }

  return (
    <div className="admin-users">
      {dialog}
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>{editing ? `Editar ${editing.name}` : "Nuevo destino"}</h2>
            <p className="admin-hint">Guardar nunca publica automáticamente.</p>
          </div>
          {editing ? (
            <button type="button" className="admin-btn admin-btn-quiet" onClick={closeForm}>
              Cancelar edición
            </button>
          ) : null}
        </div>
        <form className="admin-form admin-users-form" onSubmit={(event) => void submit(event)}>
          <div className="admin-users-filters">
            <div className="admin-field">
              <label htmlFor="destination-name">Nombre</label>
              <input
                id="destination-name"
                required
                minLength={2}
                maxLength={140}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="destination-slug">Slug</label>
              <input
                id="destination-slug"
                required
                maxLength={140}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })}
              />
            </div>
          </div>
          <div className="admin-users-filters">
            <div className="admin-field">
              <label htmlFor="destination-country">País</label>
              <input
                id="destination-country"
                required
                maxLength={100}
                value={form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="destination-region">Región</label>
              <input
                id="destination-region"
                maxLength={100}
                value={form.region}
                onChange={(event) => setForm({ ...form, region: event.target.value })}
              />
            </div>
          </div>
          <div className="admin-users-filters">
            <div className="admin-field">
              <label htmlFor="destination-category">Categoría</label>
              <select
                id="destination-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                <option value="NACIONAL">Nacional</option>
                <option value="INTERNACIONAL">Internacional</option>
                <option value="PASADIA">Pasadía</option>
                <option value="ESPECIAL">Especial</option>
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="destination-order">Orden público</label>
              <input
                id="destination-order"
                type="number"
                min="0"
                max="100000"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="destination-description">Descripción</label>
            <textarea
              id="destination-description"
              maxLength={20000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <fieldset className="admin-form admin-commercial-form">
            <legend>SEO</legend>
            <div className="admin-field">
              <label htmlFor="destination-seo-title">Título SEO</label>
              <input
                id="destination-seo-title"
                maxLength={70}
                value={form.seoTitle}
                onChange={(event) => setForm({ ...form, seoTitle: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="destination-seo-description">Descripción SEO</label>
              <textarea
                id="destination-seo-description"
                maxLength={170}
                value={form.seoDescription}
                onChange={(event) => setForm({ ...form, seoDescription: event.target.value })}
              />
            </div>
            <label className="admin-field">
              <span>
                <input
                  type="checkbox"
                  checked={form.noindex}
                  onChange={(event) => setForm({ ...form, noindex: event.target.checked })}
                />{" "}
                Excluir de buscadores
              </span>
            </label>
          </fieldset>
          <button className="admin-btn admin-btn-primary" disabled={pending}>
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar borrador"}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>Destinos</h2>
            <p className="admin-hint">{items.length} registro(s) visibles con el filtro actual.</p>
          </div>
        </div>
        <form
          className="admin-users-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <label className="admin-field">
            <span>Buscar</span>
            <input
              value={query}
              placeholder="Nombre, país o región"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="admin-btn admin-btn-quiet">Aplicar filtro</button>
        </form>
        <div className="admin-status-slot" aria-live="polite">
          {message ? (
            <p className="admin-success" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="admin-form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {items.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <br />
                      <span>
                        {item.country}
                        {item.region ? ` · ${item.region}` : ""} · {item.slug}
                      </span>
                    </td>
                    <td>{item.category ?? "Sin categoría"}</td>
                    <td>
                      <span className="admin-role">{item.status}</span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          className="admin-link-button"
                          onClick={() => {
                            setEditing(item);
                            setForm(valuesOf(item));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Editar
                        </button>
                        <button className="admin-link-button" onClick={() => void showHistory(item)}>
                          Historial
                        </button>
                        {canPublish && item.status === "DRAFT" ? (
                          <button className="admin-link-button" onClick={() => void transition(item, "publish")}>
                            Publicar
                          </button>
                        ) : null}
                        {canPublish && item.status === "PUBLISHED" ? (
                          <button className="admin-link-button" onClick={() => void transition(item, "unpublish")}>
                            Retirar
                          </button>
                        ) : null}
                        {canPublish && item.status !== "ARCHIVED" ? (
                          <button className="admin-link-button" onClick={() => void transition(item, "archive")}>
                            Archivar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">
            No hay destinos para mostrar. Los datos comerciales no se crean automáticamente.
          </p>
        )}
      </section>
      {history ? (
        <HistoryPanel
          title={history.item.name}
          rows={history.rows}
          actionLabel={actionLabel}
          summarize={summarize}
          onClose={() => setHistory(null)}
        />
      ) : null}
    </div>
  );
}
