import type { Metadata } from "next";
import { AuthCard } from "@/components/admin/auth-card";
import { MfaForm } from "@/components/admin/auth-forms";
import { safeNextPath } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Verificación en dos pasos", robots: { index: false, follow: false } };

export default async function MfaPage({ searchParams }: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="Verificación en dos pasos"
      intro="Ingresa el código de tu aplicación de autenticación para continuar."
    >
      <MfaForm next={safeNextPath(typeof next === "string" ? next : undefined)} />
    </AuthCard>
  );
}
