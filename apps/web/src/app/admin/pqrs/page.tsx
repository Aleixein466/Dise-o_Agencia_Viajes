import { PqrsManager } from "@/components/admin/pqrs/pqrs-manager";
import { hasPermission } from "@/lib/auth/nav";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "PQRS" };
export default async function PqrsPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !hasPermission(result.session.permissions, "pqrs:read"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">PQRS</h1>
      <p className="admin-lead">Peticiones, quejas, reclamos y sugerencias: responde, asigna y da seguimiento.</p>
      <PqrsManager session={result.session} />
    </>
  );
}
