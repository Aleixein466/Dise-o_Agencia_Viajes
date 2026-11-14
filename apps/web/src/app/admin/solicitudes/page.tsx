import { CrmManager } from "@/components/admin/crm-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Solicitudes" };
export default async function RequestsPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("quotes:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Solicitudes de cotización</h1>
      <p className="admin-lead">
        Seguimiento comercial de las solicitudes recibidas: asignación, estado y notas internas.
      </p>
      <CrmManager session={result.session} />
    </>
  );
}
