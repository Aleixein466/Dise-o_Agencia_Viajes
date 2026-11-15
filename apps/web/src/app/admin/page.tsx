import type { Metadata } from "next";
import { DashboardSummary } from "@/components/admin/dashboard-summary";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="admin-title">Dashboard</h1>
      <p className="admin-lead">Pendientes de la operación según los módulos de tu rol.</p>
      <DashboardSummary />
    </>
  );
}
