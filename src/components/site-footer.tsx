import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="shell footer-top">
      <div><span className="eyebrow light">EL PRÓXIMO CAPÍTULO</span><h2>El viaje empieza con<br /><em>una conversación.</em></h2></div>
      <Link className="footer-cta" href="/cotizar">Cuéntanos tu idea <ArrowUpRight size={20} /></Link>
    </div>
    <div className="shell footer-bottom">
      <div><Link href="/" className="footer-logo" aria-label="Ricaurte Tours, ir al inicio"><Image src="/images/ricaurte-logo.jpg" width={150} height={136} alt="" /></Link><p>Fotografías de viajes publicadas por Ricaurte Tours. Las salidas, tarifas y condiciones futuras están sujetas a confirmación.</p></div>
      <div><h3>Explora</h3><Link href="/destinos">Destinos</Link><Link href="/cotizar">Cotizaciones</Link><Link href="/contacto">Contacto</Link></div>
      <div><h3>Información</h3><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link><Link href="/pqrs">PQRS</Link><a href="https://www.facebook.com/ricaurtetours" target="_blank" rel="noopener noreferrer">Facebook ↗</a></div>
    </div>
    <div className="shell copyright">© {new Date().getFullYear()} Ricaurte Tours · Propuesta inicial, pendiente de validación comercial y legal.</div>
  </footer>;
}
