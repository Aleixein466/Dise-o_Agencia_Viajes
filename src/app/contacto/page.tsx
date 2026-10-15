import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export default function Contacto() { return <div className="shell simple-page"><span className="eyebrow">HABLEMOS</span><h1>Un buen viaje empieza<br /><em>con una buena pregunta.</em></h1><p>El canal de contacto, correo y WhatsApp de Ricaurte Tours están pendientes de validación. Mientras tanto, puedes explorar el formulario de cotización del prototipo. Su envío requiere una base de datos configurada.</p><Link href="/cotizar" className="btn btn-lime">Ir a cotizaciones <ArrowUpRight size={18} /></Link></div>; }
