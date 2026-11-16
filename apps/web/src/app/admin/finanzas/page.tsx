import { FinanceManager } from "@/components/admin/finance/finance-manager";
import { hasPermission } from "@/lib/auth/nav";
import { getSessionResult } from "@/lib/auth/server";

export const metadata = { title: "Finanzas" };
export default async function FinancePage() {
  const result = await getSessionResult();
  if (result.status !== "ok" || !hasPermission(result.session.permissions, "payments:read"))
    return <h1 className="admin-title">Sin permiso</h1>;
  return (
    <>
      <h1 className="admin-title">Finanzas</h1>
      <p className="admin-lead">Abonos manuales con doble control, ajustes y planes de ahorro.</p>
      <FinanceManager session={result.session} />
    </>
  );
}
