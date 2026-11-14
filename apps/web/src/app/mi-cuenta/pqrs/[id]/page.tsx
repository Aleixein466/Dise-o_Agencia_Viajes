import type { Metadata } from "next";
import { PortalPqrsPage } from "@/components/portal/portal-pqrs";

export const metadata: Metadata = { title: "Mi PQRS" };

export default async function MiPqrsPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PortalPqrsPage id={id} />;
}
