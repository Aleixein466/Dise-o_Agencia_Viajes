import { AgencyForm } from "@/components/admin/settings/agency-form";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Configuración" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("settings:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Configuración</h1>
      <p className="admin-lead">
        Datos de la agencia: nombre, registros legales, contacto, horario, redes y logo. Cada cambio queda en el
        historial.
      </p>
      <AgencyForm session={r.session} />
    </>
  );
}
