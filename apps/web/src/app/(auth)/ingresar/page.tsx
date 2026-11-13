import type { Metadata } from "next";
import { AuthCard } from "@/components/admin/auth-card";
import { LoginForm } from "@/components/admin/auth-forms";
import { safeNextPath } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function IngresarPage({ searchParams }: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Ingresar" intro="Acceso para el personal de la agencia.">
      <LoginForm next={safeNextPath(typeof next === "string" ? next : undefined)} />
    </AuthCard>
  );
}
