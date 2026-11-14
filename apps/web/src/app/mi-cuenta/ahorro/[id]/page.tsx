import type { Metadata } from "next";
import { PortalSavingsPage } from "@/components/portal/portal-pages";

export const metadata: Metadata = { title: "Plan de ahorro" };

export default async function AhorroPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PortalSavingsPage id={id} />;
}
