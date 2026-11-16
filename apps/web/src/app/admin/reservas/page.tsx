import { ReservationsManager } from "@/components/admin/reservations-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Reservas" };
export default async function ReservationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ id?: string | string[] }> }>) {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("reservations:read"))
    return <h1 className="admin-title">Sin permiso</h1>;
  const { id } = await searchParams;
  return (
    <>
      <h1 className="admin-title">Reservas</h1>
      <p className="admin-lead">
        Solicitudes de reserva: validación manual de disponibilidad, rechazo, cancelación y notas internas.
      </p>
      <ReservationsManager
        session={result.session}
        initialId={typeof id === "string" ? id : null}
        canWrite={result.session.permissions.includes("reservations:write")}
      />
    </>
  );
}
