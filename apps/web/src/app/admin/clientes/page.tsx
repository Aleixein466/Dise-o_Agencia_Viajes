import { CustomersManager } from "@/components/admin/customers/customers-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("customers:read")) {
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no tiene permiso para consultar clientes.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="admin-title">Clientes</h1>
      <p className="admin-lead">
        Consulta el perfil de cada cliente con sus cotizaciones, reservas, pagos y PQRS, corrige sus datos de contacto y
        deja notas internas para el equipo.
      </p>
      <CustomersManager session={result.session} />
    </>
  );
}
