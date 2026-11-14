"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
type Tour = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  status: string;
  destination: { name: string };
  packageComponents: { included: boolean; package: { title: string } }[];
};
type Destination = { id: string; name: string };
export function ToursManager({ session }: Readonly<{ session: AdminSession }>) {
  const [items, setItems] = useState<Tour[]>([]),
    [destinations, setDestinations] = useState<Destination[]>([]),
    [csrf, setCsrf] = useState(session.csrfToken),
    [message, setMessage] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    const [t, d] = await Promise.all([
      requestJson("/api/v1/catalog/tours?pageSize=50", "GET"),
      requestJson("/api/v1/catalog/destinations", "GET"),
    ]);
    if (t.ok && t.data && Array.isArray((t.data as { items?: unknown }).items))
      setItems((t.data as { items: Tour[] }).items);
    if (d.ok && Array.isArray(d.data)) setDestinations(d.data as Destination[]);
  }, []);
  useEffect(() => {
    const x = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((v) => v.csrfToken && setCsrf(v.csrfToken));
    }, 0);
    return () => window.clearTimeout(x);
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    const r = await requestJson(
      "/api/v1/catalog/tours",
      "POST",
      {
        destinationId: f.get("destinationId"),
        slug: f.get("slug"),
        name: f.get("name"),
        summary: f.get("summary") || undefined,
        included: f.get("included") === "on",
      },
      csrf,
    );
    setPending(false);
    setMessage(r.ok ? "Tour creado como borrador." : "No se pudo crear el tour.");
    if (r.ok) {
      e.currentTarget.reset();
      await load();
    }
  }
  return (
    <div className="admin-users">
      <section className="admin-panel">
        <h2>Nuevo tour</h2>
        <form className="admin-form" onSubmit={create}>
          <label className="admin-field">
            Destino
            <select name="destinationId" required>
              <option value="">Selecciona</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Nombre
            <input name="name" required minLength={2} />
          </label>
          <label className="admin-field">
            Slug
            <input name="slug" pattern="[a-z0-9-]+" required />
          </label>
          <label className="admin-field">
            Descripción
            <textarea name="summary" />
          </label>
          <label>
            <input name="included" type="checkbox" /> Incluir en un paquete al asociarlo
          </label>
          <button className="admin-btn admin-btn-primary" disabled={pending}>
            Crear borrador
          </button>
        </form>
      </section>
      <section className="admin-panel">
        <h2>Tours</h2>
        {message ? (
          <p className="admin-success" role="status">
            {message}
          </p>
        ) : null}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tour</th>
                <th>Destino</th>
                <th>Relación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <br />
                    <span>{t.summary}</span>
                  </td>
                  <td>{t.destination.name}</td>
                  <td>
                    {t.packageComponents
                      .map((x) => `${x.included ? "Incluido" : "Opcional"}: ${x.package.title}`)
                      .join(", ") || "Informativo / sin paquete"}
                  </td>
                  <td>
                    <span className="admin-role">{t.status}</span>
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
