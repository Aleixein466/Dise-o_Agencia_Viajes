import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { DemoTrip } from "@/lib/demo-data";

export function TripCard({ trip, index = 0 }: { trip: DemoTrip; index?: number }) {
  return <article className="trip-card">
    <Link href={`/destinos/${trip.slug}`} className="trip-image-link" aria-label={`Ver viaje realizado a ${trip.name}`}>
      <Image src={trip.image} alt={trip.imageAlt} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" className="trip-image" priority={index < 2} />
      <span className="trip-badge">Viaje realizado</span>
    </Link>
    <div className="trip-body"><span className="trip-region"><MapPin size={14} /> {trip.region}</span><div className="trip-title-row"><h3>{trip.name}</h3><Link href={`/destinos/${trip.slug}`} aria-label={`Ver ${trip.name}`} className="round-arrow"><ArrowUpRight size={20} /></Link></div><p>{trip.teaser}</p><div className="trip-meta"><span>{trip.category}</span><span>{trip.duration}</span></div></div>
  </article>;
}
