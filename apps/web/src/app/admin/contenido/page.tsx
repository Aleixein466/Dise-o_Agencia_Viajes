import Link from "next/link";
import { BlocksManager } from "@/components/admin/content/blocks-manager";
import { FaqManager } from "@/components/admin/content/faq-manager";
import { CONTENT_TABS, resolveContentTab } from "@/components/admin/content/helpers";
import { PagesManager } from "@/components/admin/content/pages-manager";
import { getSessionResult } from "@/lib/auth/server";
export const metadata = { title: "Contenido y SEO" };
export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string | string[] }> }>) {
  const r = await getSessionResult();
  if (r.status !== "ok" || !r.session.permissions.includes("content:write"))
    return <h1 className="admin-title">Sin permiso</h1>;
  const { tab } = await searchParams;
  const active = resolveContentTab(tab);
  return (
    <>
      <h1 className="admin-title">Contenido y SEO</h1>
      <p className="admin-lead">
        Administra las preguntas frecuentes, las páginas y los bloques del inicio. Todo se guarda como borrador y solo
        se muestra en el sitio cuando lo publicas; cada cambio queda en el historial.
      </p>
      <nav className="admin-tabs" aria-label="Secciones de contenido">
        <ul>
          {CONTENT_TABS.map((item) => (
            <li key={item.key}>
              <Link
                href={item.key === "faq" ? "/admin/contenido" : `/admin/contenido?tab=${item.key}`}
                aria-current={item.key === active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {active === "faq" ? <FaqManager session={r.session} /> : null}
      {active === "paginas" ? <PagesManager session={r.session} /> : null}
      {active === "inicio" ? <BlocksManager session={r.session} /> : null}
    </>
  );
}
