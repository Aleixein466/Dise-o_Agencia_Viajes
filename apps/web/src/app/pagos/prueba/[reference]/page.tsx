import type { Metadata } from "next";
import { SandboxCheckoutPage } from "@/components/portal/sandbox-checkout";

export const metadata: Metadata = { title: "Pago de prueba", robots: { index: false } };

export default async function PagoPruebaPage({ params }: Readonly<{ params: Promise<{ reference: string }> }>) {
  const { reference } = await params;
  return <SandboxCheckoutPage reference={reference} />;
}
