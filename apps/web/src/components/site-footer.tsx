import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { getAgencyProfile, mailHref, safeHref, telHref, whatsappHref } from "@/lib/public-content";

export async function SiteFooter() {
  const agency = await getAgencyProfile();
  const whatsapp = whatsappHref(agency?.whatsapp);
  const email = mailHref(agency?.contactEmail);
  const phone = telHref(agency?.phone);
  const socials = [
    ["Facebook", safeHref(agency?.facebookUrl) ?? "https://www.facebook.com/ricaurtetours"],
    ["Instagram", safeHref(agency?.instagramUrl)],
    ["TikTok", safeHref(agency?.tiktokUrl)],
    ["YouTube", safeHref(agency?.youtubeUrl)],
  ] as const;
  const address = [agency?.address, agency?.city].filter(Boolean).join(", ");
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div>
          <span className="eyebrow light">RICAURTE TOURS</span>
          <h2>
            La próxima historia empieza con <em>una idea.</em>
          </h2>
        </div>
        <Link href="/destinos" className="footer-cta">
          Explorar historias <ArrowUpRight size={19} />
        </Link>
      </div>
      <div className="shell footer-main">
        <div className="footer-about">
          <Link href="/" className="footer-logo" aria-label="Ricaurte Tours, ir al inicio">
            <Image src="/images/ricaurte-logo.jpg" width={152} height={138} alt="" />
          </Link>
          <p>
            Agencia de viajes y turismo. Compartimos fotografías de experiencias realizadas; las salidas futuras están
            pendientes de confirmación.
          </p>
        </div>
        <div>
          <h3>Explora</h3>
          <Link href="/destinos">Destinos</Link>
          <Link href="/#galeria">Galería</Link>
          <Link href="/#planes">Planea tu viaje</Link>
          <Link href="/cotizar">Preparar consulta</Link>
        </div>
        <div>
          <h3>Atención</h3>
          <Link href="/contacto">Contacto</Link>
          <Link href="/pqrs">PQRS</Link>
          {socials.map(([label, href]) =>
            href ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer">
                {label} <ArrowUpRight size={14} />
              </a>
            ) : null,
          )}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              WhatsApp <ArrowUpRight size={14} />
            </a>
          ) : null}
          {email ? <a href={email}>{agency?.contactEmail}</a> : null}
          {phone ? <a href={phone}>{agency?.phone}</a> : null}
          {address ? <small>{address}</small> : null}
          {agency?.businessHours ? <small>{agency.businessHours}</small> : null}
          {!whatsapp && !email ? <small>WhatsApp y correo oficial pendientes de confirmación.</small> : null}
        </div>
        <div>
          <h3>Información</h3>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <small>Pagos en línea en modo de prueba: no se realizan cobros reales.</small>
        </div>
      </div>
      <div className="shell copyright">
        © {new Date().getFullYear()} Ricaurte Tours · Prototipo pendiente de validación comercial y legal.
      </div>
    </footer>
  );
}
