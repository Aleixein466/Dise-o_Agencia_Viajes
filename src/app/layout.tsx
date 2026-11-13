import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { indexingAllowed, siteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ricaurte Tours | Viajes que se convierten en historias", template: "%s | Ricaurte Tours" },
  description:
    "Explora experiencias realizadas y fotografías de Ricaurte Tours. Nuevas salidas, cotizaciones y reservas requieren confirmación de la agencia.",
  metadataBase: new URL(siteUrl()),
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { siteName: "Ricaurte Tours", locale: "es_CO", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
