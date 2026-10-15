import type { Metadata } from "next";
import { QuoteForm } from "./quote-form";
export const metadata: Metadata = { title: "Cotiza tu viaje" };
export default function Cotizar() { const enabled = process.env.QUOTE_INTAKE_ENABLED === "true" && Boolean(process.env.DATABASE_URL); return <div className="shell form-page form-grid"><div className="form-intro"><span className="eyebrow">EMPECEMOS A SOÑAR</span><h1>Tu viaje empieza <em>aquí.</em></h1><p>Comparte tu destino, fechas y preferencias cuando la agencia habilite la recepción de cotizaciones.</p><p><strong>Nota:</strong> esta versión es un prototipo. No envíes datos sensibles ni hagas pagos desde esta página.</p></div><QuoteForm enabled={enabled} /></div>; }
