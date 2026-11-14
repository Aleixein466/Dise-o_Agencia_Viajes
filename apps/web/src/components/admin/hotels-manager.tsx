"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
type Hotel = {
  id: string;
  name: string;
  description: string | null;
  stars: number | null;
  status: string;
  destination: { name: string };
  roomTypes: { name: string; maxOccupancy: number }[];
};
export function HotelsManager({ session }: Readonly<{ session: AdminSession }>) {
  const [items, setItems] = useState<Hotel[]>([]);
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await requestJson("/api/v1/catalog/hotels?pageSize=50", "GET");
    if (r.ok && r.data && Array.isArray((r.data as { items?: unknown }).items))
      setItems((r.data as { items: Hotel[] }).items);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((v) => v.csrfToken && setCsrf(v.csrfToken));
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);
  async function edit(h: Hotel) {
    const name = window.prompt("Nombre del hotel", h.name);
    if (!name || name === h.name) return;
    const r = await requestJson(`/api/v1/catalog/hotels/${h.id}`, "PATCH", { name }, csrf);
    setMessage(r.ok ? "Hotel actualizado." : "No se pudo actualizar el hotel.");
    if (r.ok) await load();
  }
  return (
    <section className="admin-panel">
      <h2>Hoteles importados</h2>
      {message ? (
        <p className="admin-success" role="status">
          {message}
        </p>
      ) : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Hotel</th>
              <th>Destino</th>
              <th>Acomodaciones</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id}>
                <td>
                  <strong>{h.name}</strong>
                </td>
                <td>{h.destination.name}</td>
                <td>{h.roomTypes.map((r) => `${r.name} (${r.maxOccupancy})`).join(", ") || "Pendiente"}</td>
                <td>
                  <span className="admin-role">{h.status}</span>
                </td>
                <td>
                  <button className="admin-link-button" onClick={() => void edit(h)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
