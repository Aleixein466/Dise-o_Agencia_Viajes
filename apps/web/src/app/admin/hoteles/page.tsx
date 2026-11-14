import { HotelsManager } from "@/components/admin/hotels-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Hoteles" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Hoteles</h1>
      <p className="admin-lead">Gestiona hoteles asociados a los destinos y paquetes borrador.</p>
      <HotelsManager session={r.session} />
    </>
  );
}
