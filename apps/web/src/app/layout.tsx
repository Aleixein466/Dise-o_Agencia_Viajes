import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { indexingAllowed, siteUrl } from "@/lib/seo";
import "./globals.css";

// Brand fonts are self-hosted (SIL OFL 1.1; provenance and limits in ./fonts/README.md). Nothing is fetched from Google
// at build, dev or run time, so an unreachable Google CDN can no longer fail `next build` or drop pages to Arial, and
// no CSP change is needed. The faces mirror what the former Google loader generated (the same variable file per
// weight and the same fallback faces), so the rendering is unchanged. Do not widen the weights to a range.
const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});
const playfair = localFont({
  src: [
    { path: "./fonts/playfair-display-latin-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/playfair-display-latin-wght-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display-latin-wght-italic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/playfair-display-latin-wght-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
  adjustFontFallback: "Times New Roman",
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
    <html lang="es-CO" className={`${dmSans.variable} ${playfair.variable}`}>
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
