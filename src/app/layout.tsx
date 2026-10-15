import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ricaurte Tours | Viajes que se sienten", template: "%s | Ricaurte Tours" },
  description: "Propuesta digital de Ricaurte Tours. Explora ideas de viaje y solicita una cotización personalizada.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><a className="skip-link" href="#contenido">Saltar al contenido</a><SiteHeader /><main id="contenido">{children}</main><SiteFooter /></body></html>;
}
