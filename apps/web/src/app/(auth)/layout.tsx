import type { Metadata } from "next";
import "../admin/admin.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="auth-root">{children}</div>;
}
