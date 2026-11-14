"use client";
import { FormEvent, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
type Destination = { id: string; name: string };
type Hotel = { id: string; name: string; destination: { id?: string; name: string } };
export function PackageCreateForm({ session }: Readonly<{ session: AdminSession }>) {
  const [dest, setDest] = useState<Destination[]>([]),
    [hotels, setHotels] = useState<Hotel[]>([]),
    [csrf, setCsrf] = useState(session.csrfToken),
    [msg, setMsg] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      requestJson("/api/v1/catalog/destinations", "GET"),
      requestJson("/api/v1/catalog/hotels?pageSize=50", "GET"),
      fetchCsrfToken(),
    ]).then(([d, h, c]) => {
      if (d.ok && Array.isArray(d.data)) setDest(d.data as Destination[]);
      if (h.ok && h.data && Array.isArray((h.data as { items?: unknown }).items))
        setHotels((h.data as { items: Hotel[] }).items);
      if (c.csrfToken) setCsrf(c.csrfToken);
    });
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await requestJson(
      "/api/v1/catalog/packages",
      "POST",
      {
        destinationId: f.get("destinationId"),
        slug: f.get("slug"),
        title: f.get("title"),
        durationDays: Number(f.get("durationDays")),
        hotelIds: f.getAll("hotelIds"),
      },
      csrf,
    );
    setBusy(false);
    setMsg(
      r.ok ? "Paquete creado como borrador. Recarga la lista." : "No se pudo crear: revisa los campos y permisos.",
    );
    if (r.ok) e.currentTarget.reset();
  }
  return (
    <section className="admin-panel">
      <h2>Nuevo paquete borrador</h2>
      {msg ? (
        <p className="admin-success" role="status">
          {msg}
        </p>
      ) : null}
      <form className="admin-form" onSubmit={save}>
        <label className="admin-field">
          Destino
          <select name="destinationId" required>
            <option value="" />
            {dest.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Título
          <input name="title" required minLength={2} />
        </label>
        <label className="admin-field">
          Slug
          <input name="slug" required pattern="[a-z0-9-]+" />
        </label>
        <label className="admin-field">
          Duración (días)
          <input name="durationDays" type="number" min="1" max="30" required />
        </label>
        <fieldset className="admin-role-field">
          <legend>Hoteles asociados</legend>
          {hotels.map((h) => (
            <label key={h.id}>
              <input name="hotelIds" value={h.id} type="checkbox" /> {h.name} — {h.destination.name}
            </label>
          ))}
        </fieldset>
        <button className="admin-btn admin-btn-primary" disabled={busy}>
          Crear borrador
        </button>
      </form>
    </section>
  );
}
export function HotelCreateForm({ session }: Readonly<{ session: AdminSession }>) {
  const [dest, setDest] = useState<Destination[]>([]),
    [csrf, setCsrf] = useState(session.csrfToken),
    [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([requestJson("/api/v1/catalog/destinations", "GET"), fetchCsrfToken()]).then(([d, c]) => {
      if (d.ok && Array.isArray(d.data)) setDest(d.data as Destination[]);
      if (c.csrfToken) setCsrf(c.csrfToken);
    });
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await requestJson(
      "/api/v1/catalog/hotels",
      "POST",
      {
        destinationId: f.get("destinationId"),
        slug: f.get("slug"),
        name: f.get("name"),
        stars: f.get("stars") ? Number(f.get("stars")) : undefined,
      },
      csrf,
    );
    setMsg(r.ok ? "Hotel creado como borrador. Recarga la lista." : "No se pudo crear el hotel.");
    if (r.ok) e.currentTarget.reset();
  }
  return (
    <section className="admin-panel">
      <h2>Nuevo hotel borrador</h2>
      {msg ? (
        <p className="admin-success" role="status">
          {msg}
        </p>
      ) : null}
      <form className="admin-form" onSubmit={save}>
        <label className="admin-field">
          Destino
          <select name="destinationId" required>
            <option value="" />
            {dest.map((d) => (
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
          <input name="slug" required pattern="[a-z0-9-]+" />
        </label>
        <label className="admin-field">
          Estrellas
          <input name="stars" type="number" min="1" max="5" />
        </label>
        <button className="admin-btn admin-btn-primary">Crear borrador</button>
      </form>
    </section>
  );
}
