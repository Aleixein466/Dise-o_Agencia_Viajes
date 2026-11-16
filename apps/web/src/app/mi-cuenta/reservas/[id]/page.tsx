import type { Metadata } from "next";
import { PortalReservationPage } from "@/components/portal/portal-pages";

export const metadata: Metadata = { title: "Reserva" };

export default async function ReservaPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PortalReservationPage id={id} />;
}
