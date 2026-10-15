import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { demoTrips } from "@/lib/demo-data";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };
export async function generateStaticParams() { return demoTrips.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const trip = demoTrips.find((item) => item.slug === slug); return { title: trip ? `${trip.name} · Viaje realizado` : "Destino" }; }
export default async function TripDetail({ params }: Props) {
  const { slug } = await params; const trip = demoTrips.find((item) => item.slug === slug); if (!trip) notFound();
  return <><div className="detail-hero detail-hero-split"><div className="shell detail-hero-split-inner"><div className="detail-hero-copy"><span className="eyebrow light">VIAJE REALIZADO · {trip.region.toUpperCase()}</span><h1>{trip.name}</h1><p>{trip.category} · {trip.duration}</p></div><div className="detail-hero-photo"><Image src={trip.image} fill priority sizes="(max-width: 800px) 100vw, 58vw" alt={trip.imageAlt} /></div></div></div><div className="shell detail-grid"><div className="detail-main"><Link className="text-link" href="/destinos"><ArrowLeft size={17} /> Volver a destinos</Link><h2 style={{marginTop:45}}>Una historia que ya vivimos.</h2><p>{trip.description}</p><a className="text-link" href={trip.sourceUrl} target="_blank" rel="noopener noreferrer">Ver publicación original <ArrowUpRight size={17} /></a><h3>Lo que muestra esta experiencia</h3><ul className="highlight-list">{trip.highlights.map((item) => <li key={item}>{item}</li>)}</ul><h3>Para un próximo viaje</h3><p>La publicación documenta una salida pasada. Antes de ofrecer un viaje similar, la agencia debe definir y publicar fechas, cupos, inclusiones, exclusiones, itinerario, precio y políticas. Una cotización no garantiza disponibilidad ni constituye una reserva.</p></div><aside className="detail-aside"><span className="eyebrow">PLANEA TU VIAJE</span><h3>¿Te gustaría algo parecido?</h3><p>Comparte tus fechas e intereses cuando la recepción de cotizaciones esté activa. La agencia deberá confirmar una propuesta nueva.</p><Link className="btn btn-lime" href={`/cotizar?destino=${encodeURIComponent(trip.name)}`}>Preparar consulta <ArrowUpRight size={18} /></Link><p className="fine-print">Precio y disponibilidad pendientes de confirmación.</p></aside></div></>;
}
