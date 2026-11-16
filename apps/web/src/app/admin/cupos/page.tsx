import { DeparturesManager } from "@/components/admin/departures/departures-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Cupos" };

export default async function DeparturesPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("catalog:write")) {
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no tiene permiso para administrar cupos.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="admin-title">Cupos</h1>
      <p className="admin-lead">
        Administra las salidas de cada paquete y sus cupos. La capacidad es manual: es la que el equipo escribe según lo
        confirmado con hoteles y transportadores; el sistema no consulta inventario externo.
      </p>
      <DeparturesManager session={result.session} />
    </>
  );
}
