import { useId } from "react";
import { formatDateTime } from "../commercial/helpers";

export type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  details?: unknown;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

/** Audit history list shared by the content and settings admins. `null` rows = still loading. */
export function HistoryPanel({
  title,
  rows,
  actionLabel,
  summarize,
  onClose,
}: Readonly<{
  title: string;
  rows: AuditRow[] | null;
  actionLabel: (action: string) => string;
  summarize: (row: AuditRow) => string[];
  onClose: () => void;
}>) {
  const id = useId();
  return (
    <section className="admin-panel" aria-live="polite" aria-labelledby={id}>
      <div className="admin-section-heading">
        <h2 id={id}>Historial: {title}</h2>
        <button type="button" className="admin-btn admin-btn-quiet" onClick={onClose}>
          Cerrar historial
        </button>
      </div>
      {rows === null ? (
        <p className="admin-empty">Cargando historial…</p>
      ) : rows.length ? (
        <ol className="admin-activity">
          {rows.map((row) => {
            const changes = summarize(row);
            return (
              <li key={row.id}>
                <strong>{actionLabel(row.action)}</strong>
                <br />
                <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                <span className="admin-hint"> · Actor: {row.actorId ?? "Sistema"}</span>
                {changes.length ? (
                  <ul className="admin-history-changes">
                    {changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="admin-empty">No hay cambios registrados.</p>
      )}
    </section>
  );
}
