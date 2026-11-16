import { QuotesManager } from "@/components/admin/quotes-manager";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Cotizaciones" };
export default async function QuotesPage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !result.session.permissions.includes("quotes:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Cotizaciones administrativas</h1>
      <p className="admin-lead">
        Los precios de borrador sólo se usan en este panel y nunca crean reservas automáticamente.
      </p>
      <QuotesManager session={result.session} />
    </>
  );
}
