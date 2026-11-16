import { AuditLog } from "@/components/admin/audit/audit-log";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Auditoría" };

export default async function AuditPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("audit:read")) {
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no tiene permiso para consultar la auditoría.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="admin-title">Auditoría</h1>
      <p className="admin-lead">Consulta quién hizo qué y cuándo en el sistema. Es un registro de solo lectura.</p>
      <AuditLog />
    </>
  );
}
