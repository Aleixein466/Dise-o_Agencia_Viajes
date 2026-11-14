"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";

type Destination = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  category: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  updatedAt: string;
};
const empty = { slug: "", name: "", country: "Colombia", region: "", description: "", category: "NACIONAL" };

export function DestinationsManager({ session }: Readonly<{ session: AdminSession }>) {
  const [items, setItems] = useState<Destination[]>([]);
  const [form, setForm] = useState(empty);
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canPublish = session.permissions.includes("catalog:publish");
  const load = useCallback(async () => {
    const result = await requestJson("/api/v1/catalog/destinations", "GET");
    if (result.ok && Array.isArray(result.data)) setItems(result.data as Destination[]);
    else setMessage("No se pudieron cargar los destinos.");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await requestJson("/api/v1/catalog/destinations", "POST", form, csrf);
    setPending(false);
    if (!result.ok) {
      setMessage(
        result.status === 403 ? "No tienes autorización para crear destinos." : "No se pudo guardar el destino.",
      );
      return;
    }
    setForm(empty);
    setMessage("Destino guardado como borrador.");
    await load();
  }
  async function status(item: Destination, action: "publish" | "archive") {
    if (!window.confirm(`${action === "publish" ? "Publicar" : "Archivar"} ${item.name}?`)) return;
    setPending(true);
    const result = await requestJson(`/api/v1/catalog/destinations/${item.id}/${action}`, "POST", {}, csrf);
    setPending(false);
    setMessage(
      result.ok ? `Destino ${action === "publish" ? "publicado" : "archivado"}.` : "No se pudo cambiar el estado.",
    );
    if (result.ok) await load();
  }
  return (
    <div className="admin-users">
      <section className="admin-panel">
        <h2>Nuevo destino</h2>
        <form className="admin-form admin-users-form" onSubmit={submit}>
          <div className="admin-field">
            <label htmlFor="destination-name">Nombre</label>
            <input
              id="destination-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="destination-slug">Slug</label>
            <input
              id="destination-slug"
              required
              pattern="[a-z0-9-]+"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            />
            <p className="admin-hint">Minúsculas, números y guiones.</p>
          </div>
          <div className="admin-users-filters">
            <label className="admin-field">
              <span>País</span>
              <input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>Categoría</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="NACIONAL">Nacional</option>
                <option value="INTERNACIONAL">Internacional</option>
                <option value="PASADIA">Pasadía</option>
                <option value="ESPECIAL">Especial</option>
              </select>
            </label>
          </div>
          <div className="admin-field">
            <label htmlFor="destination-description">Descripción</label>
            <textarea
              id="destination-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button className="admin-btn admin-btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar borrador"}
          </button>
        </form>
      </section>
      <section className="admin-panel">
        <h2>Destinos</h2>
        {message ? (
          <p className="admin-success" role="status">
            {message}
          </p>
        ) : null}
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
                      {item.country} · {item.slug}
                    </span>
                  </td>
                  <td>{item.category ?? "Sin categoría"}</td>
                  <td>
                    <span className="admin-role">{item.status}</span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {canPublish && item.status === "DRAFT" ? (
                        <button className="admin-link-button" onClick={() => void status(item, "publish")}>
                          Publicar
                        </button>
                      ) : null}
                      {canPublish && item.status !== "ARCHIVED" ? (
                        <button className="admin-link-button" onClick={() => void status(item, "archive")}>
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
      </section>
    </div>
  );
}
