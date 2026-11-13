import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNotice, AdminShell } from "@/components/admin/admin-shell";
import { decideAdminAccess } from "@/lib/auth/access";
import { apiInternalUrl, currentPathname, getSessionResult } from "@/lib/auth/server";
import type { SessionResult } from "@/lib/auth/types";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s | Panel Ricaurte Tours" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiConfigured = apiInternalUrl() !== undefined;
  const result: SessionResult = apiConfigured ? await getSessionResult() : { status: "error" };
  const decision = decideAdminAccess({ apiConfigured, session: result, pathname: await currentPathname() });

  if (decision.kind === "redirect") redirect(decision.to);
  if (decision.kind === "unavailable") {
    return (
      <AdminNotice title="Panel no disponible en este entorno">
        <p>El servicio de acceso no está disponible. Inténtalo de nuevo más tarde.</p>
      </AdminNotice>
    );
  }
  if (decision.kind === "forbidden") {
    return (
      <AdminNotice title="Acceso denegado (403)">
        <p>Tu cuenta no tiene permiso para usar el panel interno.</p>
        <p>
          <Link href="/">Volver al sitio</Link>
        </p>
      </AdminNotice>
    );
  }

  if (result.status !== "ok") return null;
  return <AdminShell session={result.session}>{children}</AdminShell>;
}
