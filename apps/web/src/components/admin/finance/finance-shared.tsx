import { formatCop } from "@/components/public/money";

export type Notice = { kind: "ok" | "error"; text: string } | null;

export const API = "/api/v1/finance";
export const money = (value: string | null | undefined) => formatCop(value) ?? "—";
export const day = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("es-CO", { dateStyle: "medium", timeZone: "UTC" }) : "—";
export const today = () => new Date().toISOString().slice(0, 10);

export function NoticeLine({ notice }: Readonly<{ notice: Notice }>) {
  return (
    <div aria-live="polite" role="status">
      {notice ? <p className={notice.kind === "error" ? "admin-form-error" : "admin-hint"}>{notice.text}</p> : null}
    </div>
  );
}

export function TargetFields({
  reservationId,
  planId,
  onReservation,
  onPlan,
}: Readonly<{
  reservationId: string;
  planId: string;
  onReservation: (value: string) => void;
  onPlan: (value: string) => void;
}>) {
  return (
    <>
      <label className="admin-field">
        Código de la reserva
        <input
          value={reservationId}
          onChange={(event) => onReservation(event.target.value)}
          autoComplete="off"
          placeholder="RES-…"
        />
      </label>
      <label className="admin-field">
        ID del plan de ahorro
        <input value={planId} onChange={(event) => onPlan(event.target.value)} autoComplete="off" />
      </label>
      <p className="admin-hint">Indica solo una de las dos.</p>
    </>
  );
}

export function targetBody(reservationId: string, planId: string): Record<string, string> | null {
  const reservation = reservationId.trim();
  const plan = planId.trim();
  if ((reservation && plan) || (!reservation && !plan)) return null;
  if (!reservation) return { savingsPlanId: plan };
  // Staff type the visible code (RES-…); a pasted UUID still works.
  return /^RES-/i.test(reservation) ? { reservationCode: reservation.toUpperCase() } : { reservationId: reservation };
}
