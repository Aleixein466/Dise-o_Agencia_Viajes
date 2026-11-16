import { ProfileManager } from "@/components/admin/profile-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Mi perfil y seguridad" };

export default async function Page() {
  const result = await getSessionResult();
  if (result.status !== "ok") return <h1 className="admin-title">Sesión no disponible</h1>;
  return (
    <>
      <h1 className="admin-title">Mi perfil y seguridad</h1>
      <p className="admin-lead">
        Actualiza tus datos de acceso, revisa el segundo factor y controla las sesiones abiertas de tu cuenta.
      </p>
      <ProfileManager session={result.session} />
    </>
  );
}
