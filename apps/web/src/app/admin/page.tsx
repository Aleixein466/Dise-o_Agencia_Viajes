import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

const PANELS = ["Cotizaciones recientes", "Reservas", "Pagos pendientes", "Cupos", "PQR abiertas"];

export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="admin-title">Dashboard</h1>
      <p className="admin-lead">Resumen de la operación. Los indicadores aparecerán cuando existan datos reales.</p>
      <div className="admin-grid">
        {PANELS.map((title, index) => (
          <section key={title} className="admin-panel" aria-labelledby={`panel-${index}`}>
            <h2 id={`panel-${index}`}>{title}</h2>
            <p className="admin-empty">Sin datos todavía</p>
          </section>
        ))}
      </div>
    </>
  );
}
