"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
type Rate = { id: string; name: string; amountCents: string; currency: string; conditions: { label?: string } | null };
type History = {
  id: string;
  actorId: string | null;
  before: { amountCents?: string } | null;
  after: { amountCents?: string } | null;
  createdAt: string;
};
type Pkg = {
  id: string;
  title: string;
  slug: string;
  durationDays: number | null;
  status: string;
  summary: string | null;
  includes: unknown;
  excludes: unknown;
  destination: { name: string };
  hotels: { id: string; name: string }[];
  itinerary: { day: number; title: string; description: string }[];
  priceRules: Rate[];
};
const money = (cents: string) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(BigInt(cents) / BigInt(100)),
  );
export function PackagesManager({ session }: Readonly<{ session: AdminSession }>) {
  const [items, setItems] = useState<Pkg[]>([]);
  const [chosen, setChosen] = useState<Pkg | null>(null);
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<{ rate: string; rows: History[] } | null>(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("");
  const [hotel, setHotel] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const r = await requestJson("/api/v1/catalog/packages?pageSize=50", "GET");
    if (r.ok && typeof r.data === "object" && r.data && Array.isArray((r.data as { items?: unknown }).items))
      setItems((r.data as { items: Pkg[] }).items);
    else setMessage("No se pudieron cargar los paquetes.");
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((v) => v.csrfToken && setCsrf(v.csrfToken));
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    const r = await requestJson(
      `/api/v1/catalog/packages/${chosen.id}`,
      "PATCH",
      { title: form.get("title"), summary: form.get("summary") },
      csrf,
    );
    setPending(false);
    setMessage(r.ok ? "Paquete guardado como borrador." : "No se pudo guardar el paquete.");
    if (r.ok) await load();
  }
  async function rate(rate: Rate) {
    const value = window.prompt("Valor en centavos COP (sin decimales)", rate.amountCents);
    if (!value?.match(/^\d+$/)) return;
    setPending(true);
    const r = await requestJson(`/api/v1/catalog/rates/${rate.id}`, "PATCH", { amountCents: value }, csrf);
    setPending(false);
    setMessage(r.ok ? "Tarifa de borrador actualizada." : "No se pudo actualizar la tarifa.");
    if (r.ok && chosen) {
      const detail = await requestJson(`/api/v1/catalog/packages/${chosen.id}/preview`, "GET");
      if (detail.ok) setChosen(detail.data as Pkg);
      await load();
    }
  }
  async function showHistory(rate: Rate) {
    setHistory({ rate: rate.conditions?.label ?? rate.name, rows: [] });
    const r = await requestJson(`/api/v1/catalog/rates/${rate.id}/history`, "GET");
    if (!r.ok || !Array.isArray(r.data)) {
      setMessage("No se pudo consultar el historial autorizado.");
      setHistory(null);
      return;
    }
    setHistory({ rate: rate.conditions?.label ?? rate.name, rows: r.data as History[] });
  }
  const destinations = [...new Set(items.map((item) => item.destination.name))].sort();
  const hotels = [...new Set(items.flatMap((item) => item.hotels.map((itemHotel) => itemHotel.name)))].sort();
  const visible = items.filter((item) => {
    const needle = query.trim().toLocaleLowerCase("es-CO");
    return (
      (!needle || [item.title, item.slug].some((value) => value.toLocaleLowerCase("es-CO").includes(needle))) &&
      (!destination || item.destination.name === destination) &&
      (!hotel || item.hotels.some((itemHotel) => itemHotel.name === hotel)) &&
      (!duration || String(item.durationDays) === duration) &&
      (!status || item.status === status)
    );
  });
  return (
    <div className="admin-users">
      <section className="admin-panel">
        <h2>Paquetes importados</h2>
        {message ? (
          <p className="admin-success" role="status">
            {message}
          </p>
        ) : null}
        <div className="admin-form" aria-label="Filtros de tarifas">
          <label className="admin-field">
            Buscar paquete
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o referencia" />
          </label>
          <label className="admin-field">
            Destino
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="">Todos</option>
              {destinations.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Hotel
            <select value={hotel} onChange={(event) => setHotel(event.target.value)}>
              <option value="">Todos</option>
              {hotels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Duración
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="">Todas</option>
              {[...new Set(items.map((item) => item.durationDays))].sort().map((value) => (
                <option key={String(value)} value={String(value)}>
                  {value} días
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Estado
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {[...new Set(items.map((item) => item.status))].sort().map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Paquete</th>
                <th>Destino</th>
                <th>Duración</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.title}</strong>
                    <br />
                    <span>{p.slug}</span>
                  </td>
                  <td>{p.destination.name}</td>
                  <td>{p.durationDays} días</td>
                  <td>
                    <span className="admin-role">{p.status}</span>
                  </td>
                  <td>
                    <button className="admin-link-button" onClick={() => setChosen(p)}>
                      Editar y previsualizar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length ? <p className="admin-empty">No hay tarifas de borrador para esos filtros.</p> : null}
      </section>
      {chosen ? (
        <section className="admin-panel">
          <h2>Editar {chosen.title}</h2>
          <form className="admin-form" onSubmit={save}>
            <div className="admin-field">
              <label>
                Título
                <input name="title" defaultValue={chosen.title} required />
              </label>
            </div>
            <div className="admin-field">
              <label>
                Resumen
                <textarea name="summary" defaultValue={chosen.summary ?? ""} />
              </label>
            </div>
            <button className="admin-btn admin-btn-primary" disabled={pending}>
              Guardar cambios
            </button>
          </form>
          <h3>Hoteles asociados</h3>
          <p>{chosen.hotels.map((h) => h.name).join(" · ") || "Sin hoteles"}</p>
          <h3>Itinerario</h3>
          <ol className="admin-activity">
            {chosen.itinerary.map((d) => (
              <li key={d.day}>
                <strong>{d.title}</strong>
                <br />
                {d.description}
              </li>
            ))}
          </ol>
          <h3>Tarifas de borrador</h3>
          <ul className="admin-activity">
            {chosen.priceRules.map((r) => (
              <li key={r.id}>
                <strong>{r.conditions?.label ?? r.name}</strong>: {money(r.amountCents)}{" "}
                <button className="admin-link-button" onClick={() => void rate(r)}>
                  Editar tarifa
                </button>
                <button className="admin-link-button" onClick={() => void showHistory(r)}>
                  Ver historial
                </button>
              </li>
            ))}
          </ul>
          {history ? (
            <section className="admin-panel" aria-live="polite">
              <h3>Historial: {history.rate}</h3>
              <button className="admin-link-button" onClick={() => setHistory(null)}>
                Cerrar
              </button>
              {history.rows.length ? (
                <ol className="admin-activity">
                  {history.rows.map((row) => (
                    <li key={row.id}>
                      <strong>
                        {row.before?.amountCents ? money(row.before.amountCents) : "Sin valor anterior"} →{" "}
                        {row.after?.amountCents ? money(row.after.amountCents) : "Sin valor nuevo"}
                      </strong>
                      <br />
                      <time>
                        {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
                          new Date(row.createdAt),
                        )}
                      </time>
                      <br />
                      <span>Actor: {row.actorId ?? "Sistema"}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="admin-empty">No hay cambios registrados.</p>
              )}
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
