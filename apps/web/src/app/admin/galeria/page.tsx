import { GalleryManager } from "@/components/admin/gallery-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Galería" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Galería</h1>
      <p className="admin-lead">Medios privados de borradores, accesibles sólo para personal autorizado.</p>
      <GalleryManager session={r.session} />
    </>
  );
}
