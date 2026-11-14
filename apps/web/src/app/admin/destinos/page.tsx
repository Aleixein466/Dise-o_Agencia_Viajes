import { DestinationsManager } from "@/components/admin/destinations-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Destinos" };
export default async function DestinationsPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("catalog:write"))
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no puede administrar destinos.</p>
      </>
    );
  return (
    <>
      <h1 className="admin-title">Destinos</h1>
      <p className="admin-lead">
        Crea y edita borradores. Solo quien tiene autorización de publicación puede hacerlos visibles.
      </p>
      <DestinationsManager session={result.session} />
    </>
  );
}
