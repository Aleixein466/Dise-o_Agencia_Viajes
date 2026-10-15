import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, MapPin } from "lucide-react";
import { demoTrips } from "@/lib/demo-data";
import { PhotoGallery } from "@/components/photo-gallery";
import { TripCard } from "@/components/trip-card";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };
export async function generateStaticParams() { return demoTrips.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const trip = demoTrips.find((item) => item.slug === slug);
  return { title: trip ? `${trip.name} · Viaje realizado` : "Destino", description: trip?.teaser };
}

export default async function TripDetail({ params }: Props) {
  const { slug } = await params;
  const trip = demoTrips.find((item) => item.slug === slug);
  if (!trip) notFound();
  const related = demoTrips.filter((item) => item.slug !== trip.slug && (item.category === trip.category || item.region === trip.region)).slice(0, 2);
  if (related.length < 2) related.push(...demoTrips.filter((item) => item.slug !== trip.slug && !related.includes(item)).slice(0, 2 - related.length));

  return <>
    <section className="detail-hero"><div className="detail-hero-image"><Image src={trip.image} alt={trip.imageAlt} fill priority sizes="100vw" /><div className="detail-hero-shade" /></div><div className="shell detail-hero-content"><Link href="/destinos" className="detail-back"><ArrowLeft size={17} /> Volver a destinos</Link><span className="detail-label">VIAJE REALIZADO · {trip.duration}</span><h1>{trip.name}</h1><p><MapPin size={19} /> {trip.region} <span>·</span> {trip.category}</p></div></section>

    <div className="shell detail-layout"><article className="detail-main"><span className="eyebrow">UN RECUERDO DOCUMENTADO</span><h2>Así fue esta <em>experiencia.</em></h2><p className="detail-lead">{trip.description}</p><a href={trip.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link">Ver publicación original <ArrowUpRight size={17} /></a><div className="detail-highlights"><h3>Lugares y momentos</h3><ul>{trip.highlights.map((item) => <li key={item}><Check size={18} /> {item}</li>)}</ul></div><div className="detail-pending"><CalendarDays size={25} /><div><h3>¿Y una próxima salida?</h3><p>No hay itinerario, duración futura, servicios incluidos, precio ni fechas publicados para este destino. Esos datos se definirán en una propuesta nueva de la agencia.</p></div></div></article><aside className="detail-aside"><span className="eyebrow">TU IDEA DE VIAJE</span><h3>¿Te imaginas aquí?</h3><p>Guarda este destino como punto de partida. Preparar una consulta no confirma disponibilidad ni constituye una reserva.</p><div className="detail-aside-facts"><span><MapPin size={17} /> {trip.region}</span><span><CalendarDays size={17} /> {trip.duration}</span></div><Link href={`/cotizar?destino=${encodeURIComponent(trip.name)}`} className="btn btn-primary">Preparar consulta <ArrowUpRight size={17} /></Link><small>Recepción de solicitudes pendiente de activación.</small></aside></div>

    <section className="shell detail-gallery section-pad"><div className="section-heading"><div><span className="eyebrow">POSTALES DEL RECORRIDO</span><h2>El viaje, en <em>imágenes.</em></h2></div><p className="heading-aside">Fotografías de las publicaciones de Ricaurte Tours. Abre una imagen para verla más grande y consultar su fuente.</p></div><PhotoGallery photos={trip.photos} variant="detail" /></section>

    <section className="related-section"><div className="shell"><div className="section-heading"><div><span className="eyebrow">SIGUE EXPLORANDO</span><h2>Otras historias para <em>inspirarte.</em></h2></div><Link href="/destinos" className="text-link">Ver todas <ArrowUpRight size={17} /></Link></div><div className="trip-grid related-grid">{related.map((item) => <TripCard trip={item} key={item.slug} />)}</div></div></section>
  </>;
}
