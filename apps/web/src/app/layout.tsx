import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { indexingAllowed, siteUrl } from "@/lib/seo";
import "./globals.css";

// Self-hosted at build time by next/font: the browser never requests Google, and no CSP change is needed.
// (The former CSS @import of Google Fonts was dropped by the CSS pipeline, so pages rendered in Arial.)
const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-dm-sans",
  display: "swap",
});
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

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
    <html lang="es-CO" className={`${body.variable} ${display.variable}`}>
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
