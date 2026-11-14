import { PackagesManager } from "@/components/admin/packages-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Paquetes" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Paquetes</h1>
      <p className="admin-lead">Edición y vista previa protegida de borradores.</p>
      <PackagesManager session={r.session} />
    </>
  );
}
