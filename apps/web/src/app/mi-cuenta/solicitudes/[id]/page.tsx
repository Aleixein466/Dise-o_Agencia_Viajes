import type { Metadata } from "next";
import { PortalQuotePage } from "@/components/portal/portal-pages";

export const metadata: Metadata = { title: "Solicitud" };

export default async function SolicitudPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PortalQuotePage id={id} />;
}
