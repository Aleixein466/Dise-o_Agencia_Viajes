import type { Metadata } from "next";
import { Catalog } from "./catalog";
export const metadata: Metadata = { title: "Viajes realizados" };
export default function Destinos() { return <><section className="page-hero"><div className="shell"><span className="eyebrow">HISTORIAS DE RICAURTE TOURS</span><h1>Viajes que ya <em>vivimos.</em></h1><p>Conoce experiencias publicadas por la agencia. Son registros de viajes pasados: nuevas fechas, itinerarios y precios requieren confirmación.</p></div></section><Catalog /></>; }
