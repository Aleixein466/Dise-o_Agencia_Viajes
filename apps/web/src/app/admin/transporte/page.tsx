import { TransportManager } from "@/components/admin/transport/transport-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Transporte" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Transporte</h1>
      <p className="admin-lead">
        Administra las opciones de transporte por destino y modo (terrestre, aéreo o marítimo). Cada cambio queda en el
        historial.
      </p>
      <TransportManager session={r.session} />
    </>
  );
}
