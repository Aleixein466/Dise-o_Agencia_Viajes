import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getAgencyProfile, mailHref, telHref, whatsappHref } from "@/lib/public-content";
// noindex until the agency confirms its official contact channels (PC-6 / §26.1).
export const metadata: Metadata = { alternates: { canonical: "/contacto" }, robots: { index: false, follow: true } };
export default async function Contacto() {
  const agency = await getAgencyProfile();
  const whatsapp = whatsappHref(agency?.whatsapp);
  const email = mailHref(agency?.contactEmail);
  const phone = telHref(agency?.phone);
  const configured = Boolean(whatsapp || email || phone);
  return (
    <div className="shell simple-page">
      <span className="eyebrow">HABLEMOS</span>
      <h1>
        Un buen viaje empieza
        <br />
        <em>con una pregunta.</em>
      </h1>
      {configured ? (
        <>
          <p>Estos son los canales de atención que Ricaurte Tours tiene publicados.</p>
          <ul className="contact-channels">
            {whatsapp ? (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  Escribir por WhatsApp <ArrowUpRight size={18} />
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                Correo: <a href={email}>{agency?.contactEmail}</a>
              </li>
            ) : null}
            {phone ? (
              <li>
                Teléfono: <a href={phone}>{agency?.phone}</a>
              </li>
            ) : null}
            {agency?.businessHours ? <li>Horario: {agency.businessHours}</li> : null}
            {agency?.address ? <li>Dirección: {[agency.address, agency.city].filter(Boolean).join(", ")}</li> : null}
          </ul>
        </>
      ) : (
        <p>
          Puedes visitar la página de Facebook que Ricaurte Tours compartió para conocer sus publicaciones y contactar a
          la agencia allí. El número oficial de WhatsApp y el correo aún están pendientes de confirmación.
        </p>
      )}
      <a
        href="https://www.facebook.com/ricaurtetours"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
      >
        Ir a Facebook <ArrowUpRight size={18} />
      </a>
      <p>
        Para planear una idea de viaje sin enviar datos personales, explora los{" "}
        <Link href="/destinos" className="inline-link">
          destinos documentados
        </Link>
        .
      </p>
    </div>
  );
}
