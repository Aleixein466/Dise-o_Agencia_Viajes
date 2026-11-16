import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Mi cuenta", template: "%s | Mi cuenta" },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell form-page">
      <div className="form-intro wizard-intro">
        <span className="eyebrow">MI CUENTA</span>
        <h1>
          Tus solicitudes y <em>reservas</em>
        </h1>
        <p>Consulta el estado de tus solicitudes, acepta propuestas y gestiona tus reservas.</p>
      </div>
      {children}
    </div>
  );
}
