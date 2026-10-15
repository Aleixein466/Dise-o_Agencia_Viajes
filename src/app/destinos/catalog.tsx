"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, Search } from "lucide-react";
import { categories, demoTrips } from "@/lib/demo-data";
import { TripCard } from "@/components/trip-card";

function CatalogContent() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("categoria") || "Todos");
  const region = params.get("region") || "";
  const date = params.get("fecha") || "";
  const travelers = params.get("viajeros") || "";
  const trips = useMemo(() => demoTrips.filter((trip) =>
    (category === "Todos" || !category || trip.category === category) &&
    (!region || (region === "ecuador" ? trip.region.toLowerCase().includes("ecuador") : !trip.region.toLowerCase().includes("ecuador"))) &&
    `${trip.name} ${trip.region} ${trip.category}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es").trim())
  ), [query, category, region]);
  const quoteParams = new URLSearchParams();
  if (query) quoteParams.set("destino", query);
  if (date) quoteParams.set("fecha", date);
  if (travelers) quoteParams.set("viajeros", travelers);
  const quoteHref = `/cotizar${quoteParams.size ? `?${quoteParams}` : ""}`;

  return <div className="shell catalog-layout">
    <div className="catalog-availability"><CalendarDays size={27} /><div><span className="eyebrow">PRÓXIMAS AVENTURAS</span><h2>Sin salidas publicadas por ahora</h2><p>{date ? `Tu fecha tentativa: ${date}. ` : ""}{travelers ? `Viajeros: ${travelers}. ` : ""}Aún no hay paquetes vigentes con fechas, precio o cupos confirmados. Puedes explorar viajes pasados y preparar una consulta para cuando el canal esté disponible.</p></div><Link href={quoteHref} className="btn btn-primary">Preparar consulta <ArrowUpRight size={17} /></Link></div>
    <div className="catalog-section-title"><span className="eyebrow">ÁLBUM DE VIAJES</span><h2>Experiencias realizadas</h2><p>Filtra fotografías e historias documentadas. Estos resultados no indican disponibilidad actual.</p></div>
    <div className="catalog-toolbar"><label className="catalog-search"><Search size={19} /><span className="sr-only">Buscar destino o región</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar destino o región" /></label><div className="filter-list" aria-label="Filtrar por experiencia">{categories.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
    <p className="catalog-count" role="status">{trips.length} {trips.length === 1 ? "historia encontrada" : "historias encontradas"}</p>
    {trips.length ? <div className="trip-grid">{trips.map((trip) => <TripCard key={trip.slug} trip={trip} />)}</div> : <div className="empty-state"><Search size={28} /><h3>No encontramos una historia con esos filtros.</h3><p>Prueba otra palabra o experiencia. La búsqueda de salidas vigentes todavía no tiene resultados publicados.</p><button type="button" className="text-link" onClick={() => { setQuery(""); setCategory("Todos"); }}>Limpiar filtros <ArrowUpRight size={17} /></button></div>}
  </div>;
}

export function Catalog() { return <Suspense fallback={<div className="shell catalog-layout">Cargando experiencias…</div>}><CatalogContent /></Suspense>; }
