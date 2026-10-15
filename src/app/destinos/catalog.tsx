"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { categories, demoTrips } from "@/lib/demo-data";
import { TripCard } from "@/components/trip-card";

function CatalogContent() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("categoria") || "Todos");
  const trips = useMemo(() => demoTrips.filter((trip) => (category === "Todos" || !category || trip.category === category) && `${trip.name} ${trip.region} ${trip.category}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es").trim())), [query, category]);
  return <div className="shell catalog-layout"><div className="catalog-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar destino o región" aria-label="Buscar destino o región" /><div className="filter-list" aria-label="Filtrar por experiencia">{categories.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div><p className="catalog-count">{trips.length} {trips.length === 1 ? "viaje documentado" : "viajes documentados"} · Sin salidas vigentes confirmadas</p>{trips.length ? <div className="trip-grid">{trips.map((trip, i) => <TripCard key={trip.slug} trip={trip} index={i} />)}</div> : <div className="empty-state">No encontramos un viaje con esos filtros. Prueba con otra búsqueda.</div>}</div>;
}
export function Catalog() { return <Suspense fallback={<div className="shell catalog-layout">Cargando destinos…</div>}><CatalogContent /></Suspense>; }
