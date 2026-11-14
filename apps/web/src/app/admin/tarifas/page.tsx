import { PackagesManager } from "@/components/admin/packages-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Tarifas" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Tarifas de borrador</h1>
      <p className="admin-lead">Selecciona un paquete para filtrar y editar reglas de precio inactivas.</p>
      <PackagesManager session={r.session} />
    </>
  );
}
