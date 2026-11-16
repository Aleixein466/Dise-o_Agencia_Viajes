import type { Metadata } from "next";
import { AuthCard } from "@/components/admin/auth-card";
import { ResetForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RestablecerPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Restablecer contraseña" intro="Elige una contraseña nueva para tu cuenta.">
      <ResetForm token={typeof token === "string" ? token : ""} />
    </AuthCard>
  );
}
