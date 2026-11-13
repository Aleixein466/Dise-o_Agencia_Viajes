import type { Metadata } from "next";
import { connection } from "next/server";
import { quoteIntakeOpen } from "@/lib/env";
import { QuoteForm } from "./quote-form";
export const metadata: Metadata = { title: "Prepara tu viaje", alternates: { canonical: "/cotizar" }, robots: { index: false, follow: true } };
export default async function Cotizar() { await connection(); const enabled = quoteIntakeOpen(); return <div className="shell form-page form-grid"><div className="form-intro"><span className="eyebrow">UNA IDEA PARA EL FUTURO</span><h1>Empecemos por <em>imaginarlo.</em></h1><p>Guarda un destino, una fecha tentativa y el tamaño del grupo mientras la agencia prepara su canal de cotizaciones.</p><p>El envío de datos personales y las reservas aún no están habilitados. No se realizan pagos desde esta página.</p></div><QuoteForm enabled={enabled} /></div>; }
