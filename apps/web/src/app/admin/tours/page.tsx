import { ToursManager } from "@/components/admin/tours-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Tours" };
export default async function Page() {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Tours</h1>
      <p className="admin-lead">Tours incluidos, opcionales e informativos en borrador.</p>
      <ToursManager session={r.session} />
    </>
  );
}
