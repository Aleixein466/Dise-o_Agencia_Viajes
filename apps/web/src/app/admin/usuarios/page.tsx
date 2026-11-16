import { UsersManager } from "@/components/admin/users-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("staff:read")) {
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no tiene permiso para consultar usuarios.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="admin-title">Usuarios</h1>
      <p className="admin-lead">Gestiona cuentas internas. La API valida cada permiso, MFA y confirmación de sesión.</p>
      <UsersManager session={result.session} />
    </>
  );
}
