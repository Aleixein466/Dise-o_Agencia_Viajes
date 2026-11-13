import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAccessModule, findModule } from "@/lib/auth/nav";
import { getSessionResult } from "@/lib/auth/server";

type Props = Readonly<{ params: Promise<{ modulo: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = findModule((await params).modulo);
  return { title: item?.label ?? "Módulo" };
}

export default async function AdminModulePage({ params }: Props) {
  const item = findModule((await params).modulo);
  if (!item) notFound();

  // Layouts are not re-rendered on client navigation, so each page re-checks its own permission.
  const result = await getSessionResult();
  if (result.status !== "ok" || !canAccessModule(result.session.permissions, item)) {
    return (
      <>
        <h1 className="admin-title">Sin permiso</h1>
        <p className="admin-lead">Tu cuenta no tiene permiso para ver este módulo.</p>
      </>
    );
  }

  return (
    <>
      <h1 className="admin-title">{item.label}</h1>
      <section className="admin-panel" aria-labelledby="modulo-estado">
        <h2 id="modulo-estado">Estado</h2>
        <p className="admin-empty">Módulo en construcción</p>
      </section>
    </>
  );
}
