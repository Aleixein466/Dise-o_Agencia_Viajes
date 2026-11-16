import Link from "next/link";
import { AgeRulesManager } from "@/components/admin/commercial/age-rules-manager";
import { PromotionsManager } from "@/components/admin/commercial/promotions-manager";
import { SeasonsManager } from "@/components/admin/commercial/seasons-manager";
import { TARIFF_TABS, resolveTab } from "@/components/admin/commercial/tabs";
import { PackagesManager } from "@/components/admin/packages-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Tarifas y temporadas" };
export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string | string[] }> }>) {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("catalog:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  const { tab } = await searchParams;
  const active = resolveTab(tab);
  return (
    <>
      <h1 className="admin-title">Tarifas y temporadas</h1>
      <p className="admin-lead">
        Administra las reglas de precio, las temporadas, las bandas de edad de menores y las promociones. Todo se crea
        como borrador; con permiso de publicación puedes aprobar o desactivar.
      </p>
      <nav className="admin-tabs" aria-label="Secciones de tarifas y temporadas">
        <ul>
          {TARIFF_TABS.map((item) => (
            <li key={item.key}>
              <Link
                href={item.key === "reglas" ? "/admin/tarifas" : `/admin/tarifas?tab=${item.key}`}
                aria-current={item.key === active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {active === "reglas" ? <PackagesManager session={r.session} /> : null}
      {active === "temporadas" ? <SeasonsManager session={r.session} /> : null}
      {active === "edades" ? <AgeRulesManager session={r.session} /> : null}
      {active === "promociones" ? <PromotionsManager session={r.session} /> : null}
    </>
  );
}
