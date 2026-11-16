import type { Metadata } from "next";
import { AuthCard } from "@/components/admin/auth-card";
import { ForgotForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function RecuperarPage() {
  return (
    <AuthCard
      title="Recuperar contraseña"
      intro="Escribe el correo de tu cuenta y te enviaremos instrucciones si está registrada."
    >
      <ForgotForm />
    </AuthCard>
  );
}
