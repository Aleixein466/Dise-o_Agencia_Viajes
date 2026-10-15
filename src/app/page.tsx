import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Compass, Leaf, MapPin, Plane, Search, Sun, UsersRound, Wallet } from "lucide-react";
import { demoTrips } from "@/lib/demo-data";
import { TripCard } from "@/components/trip-card";

const categories = [
  { label: "Naturaleza", icon: Leaf, image: "/images/social/eje-cafetero-2026.jpg" },
  { label: "Sol y playa", icon: Sun, image: "/images/social/atacames-2025.jpg" },
  { label: "Excursiones", icon: Compass, image: "/images/social/excursion-la-salle-2024.jpg" },
];

const gallery = [
  { image: "/images/social/eje-cafetero-momento.jpg", alt: "Viajera durante el recorrido al Eje Cafetero", label: "Eje Cafetero · 2026", source: demoTrips[0].sourceUrl },
  { image: "/images/social/atacames-momento.jpg", alt: "Viajeros en la playa de Atacames", label: "Atacames · 2025", source: demoTrips[1].sourceUrl },
  { image: "/images/social/excursion-momento.jpg", alt: "Grupo de la Excursión Chévere 2024", label: "Excursión Chévere · 2024", source: demoTrips[2].sourceUrl },
  { image: "/images/social/excursion-ie-ricaurte-2024.jpg", alt: "Grupo de la Institución Educativa Ricaurte durante una excursión", label: "Excursión escolar · 2024", source: "https://www.facebook.com/ricaurtetours/posts/pfbid02RYeEvAnDm7gX3QrtknDvAxE1qoKho32xFu2ro4jj8LNw4U7X1MQJ7eBWsT6iw7Gvl" },
];

export default function Home() {
  return <>
    <section className="hero hero-reference">
      <Image src="/images/hero-andes.webp" alt="Paisaje andino ilustrativo al amanecer" fill priority sizes="100vw" className="hero-photo" />
      <div className="hero-shade" />
      <div className="shell hero-content">
        <div className="hero-copy">
          <span className="hero-kicker"><Plane size={17} /> RICAURTE TOURS · VIAJES A TU MANERA</span>
          <h1>Tu destino, <em>tu momento.</em></h1>
          <p>Hay viajes que empiezan con una idea. Encuentra la inspiración para el siguiente y cuéntanos cómo te gustaría vivirlo.</p>
          <div className="hero-actions"><Link href="/destinos" className="btn btn-lime">Descubrir destinos <ArrowUpRight size={19} /></Link><Link href="/cotizar" className="btn btn-outline">Solicitar propuesta <ArrowRight size={18} /></Link></div>
        </div>
      </div>
      <form className="hero-search shell" action="/cotizar">
        <div className="search-intro"><span className="eyebrow">EMPIEZA AQUÍ</span><strong>Planea tu viaje</strong></div>
        <label className="search-field"><MapPin size={19} /><span><small>¿A dónde?</small><input name="destino" placeholder="Destino de interés" aria-label="Destino de interés" /></span></label>
        <label className="search-field"><CalendarDays size={19} /><span><small>¿Cuándo?</small><input name="fecha" type="date" aria-label="Fecha tentativa" /></span></label>
        <label className="search-field"><UsersRound size={19} /><span><small>Viajeros</small><input name="viajeros" type="number" min="1" max="30" defaultValue="2" aria-label="Número de viajeros" /></span></label>
        <button type="submit" className="search-button"><Search size={19} /><span>Planear</span></button>
      </form>
    </section>

    <div className="demo-ribbon"><span className="shell">VIAJES DOCUMENTADOS · Fotografías de publicaciones de Ricaurte Tours. La portada paisajística es ilustrativa. No hay salidas, tarifas ni disponibilidad confirmadas.</span></div>

    <section className="shell section-pad" id="destinos">
      <div className="section-heading"><div><span className="eyebrow">HISTORIAS DE VIAJE</span><h2>Destinos que ya<br /><em>recorrimos.</em></h2></div><div className="heading-aside"><p>Estas experiencias aparecen en publicaciones de Ricaurte Tours. Descubre las historias y consulta más adelante por nuevas posibilidades de viaje.</p><Link href="/destinos" className="text-link">Ver viajes realizados <ArrowUpRight size={18} /></Link></div></div>
      <div className="trip-grid">{demoTrips.slice(0, 3).map((trip, i) => <TripCard trip={trip} index={i} key={trip.slug} />)}</div>
    </section>

    <section className="category-section" id="experiencias"><div className="shell"><div className="category-heading"><span className="eyebrow">VIAJA COMO TE GUSTA</span><h2>¿Qué te mueve a <em>explorar?</em></h2><p>Encuentra experiencias vividas por viajeros de Ricaurte Tours.</p></div><div className="category-grid">{categories.map(({ label, icon: Icon, image }) => <Link className="category-card" href={`/destinos?categoria=${encodeURIComponent(label)}`} key={label}><Image src={image} alt={`Fotografía de un viaje de ${label.toLowerCase()} publicado por Ricaurte Tours`} fill sizes="(max-width: 750px) 100vw, 33vw" /><span className="category-tint" /><span className="category-icon"><Icon size={23} /></span><strong>{label}</strong><span className="category-arrow"><ArrowUpRight size={19} /></span></Link>)}</div></div></section>

    <section className="shell social-gallery section-pad"><div className="section-heading"><div><span className="eyebrow">MOMENTOS REALES</span><h2>Así se han vivido<br /><em>nuestros viajes.</em></h2></div><div className="heading-aside"><p>Fotografías tomadas de las publicaciones de la agencia que compartiste. Cada imagen lleva a su publicación original.</p><a href="https://www.facebook.com/ricaurtetours" className="text-link" target="_blank" rel="noopener noreferrer">Visitar Facebook <ArrowUpRight size={18} /></a></div></div><div className="gallery-grid">{gallery.map((item) => <a className="gallery-item" key={item.image} href={item.source} target="_blank" rel="noopener noreferrer" aria-label={`Ver publicación de ${item.label} en Facebook`}><Image src={item.image} alt={item.alt} fill sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw" /><span>{item.label}<ArrowUpRight size={16} /></span></a>)}</div></section>

    <section className="shell travel-plans section-pad" id="planes"><div className="section-heading"><div><span className="eyebrow">PLANEACIÓN A TU RITMO</span><h2>Hablemos de la forma<br /><em>de hacerlo posible.</em></h2></div><p className="how-intro">Estas modalidades son conceptos del proyecto y requieren condiciones comerciales y legales aprobadas antes de ofrecerse.</p></div><div className="plan-grid"><article className="plan-card plan-separa"><div className="plan-icon"><Wallet size={27} /></div><span className="plan-label">MODALIDAD POR DEFINIR</span><h3>Plan Separa</h3><p>Una propuesta futura para distribuir el pago de una reserva confirmada, con cronograma y condiciones visibles desde el inicio.</p><ul><li><Check size={16} /> Cuotas asociadas a una reserva</li><li><Check size={16} /> Saldo y fechas claras</li></ul><span className="plan-status">Pendiente de condiciones</span></article><article className="plan-card plan-ahorro"><div className="plan-icon"><Compass size={27} /></div><span className="plan-label">EN EVALUACIÓN</span><h3>Ahorro programado</h3><p>Una posibilidad de planeación que solo se habilitaría después de revisar su alcance contractual, contable y regulatorio.</p><ul><li><Check size={16} /> Meta de viaje personal</li><li><Check size={16} /> Movimientos consultables</li></ul><span className="plan-status">Aún no disponible</span></article></div></section>

    <section className="visual-story"><div className="shell visual-grid"><div className="visual-copy"><span className="eyebrow">CONTIGO EN CADA PASO</span><h2>El viaje se disfruta<br />desde que <em>lo imaginas.</em></h2><p>Explora un destino, comparte tus fechas y preferencias, y revisa una propuesta con servicios y condiciones claras antes de decidir.</p><div className="story-points"><span><b>01</b> Descubre</span><span><b>02</b> Consulta</span><span><b>03</b> Decide</span></div><Link href="/cotizar" className="text-link">Cuéntanos tu idea <ArrowUpRight size={18} /></Link></div><div className="visual-photo"><Image src="/images/andes.webp" alt="Paisaje de montaña ilustrativo" fill sizes="(max-width: 800px) 100vw, 50vw" /></div></div></section>

    <section className="shell faq-section section-pad" id="preguntas"><div className="section-heading"><div><span className="eyebrow">TE ACOMPAÑAMOS</span><h2>Preguntas <em>frecuentes.</em></h2></div><p className="how-intro">Lo esencial sobre esta primera versión del sitio.</p></div><div className="faq-list"><details><summary>¿Puedo reservar uno de los destinos que aparece aquí?</summary><p>Estas páginas documentan viajes pasados. La agencia debe confirmar sus paquetes, fechas, cupos y precios antes de recibir nuevas reservas.</p></details><details><summary>¿Cómo solicito una cotización?</summary><p>El formulario está preparado, pero su envío se activará cuando la agencia configure la base de datos y apruebe su política de privacidad.</p></details><details><summary>¿Ya está disponible Plan Separa o ahorro programado?</summary><p>No. Ambas modalidades siguen en definición. El ahorro programado requiere una revisión jurídica y contable antes de habilitar aportes.</p></details></div></section>

    <section className="closing-banner"><Image src="/images/pacifico.webp" alt="Costa del Pacífico ilustrativa" fill sizes="100vw" /><div className="closing-shade" /><div className="shell closing-content"><span className="eyebrow light">RICAURTE TOURS</span><h2>Tu próxima historia<br /><em>puede empezar aquí.</em></h2><Link href="/destinos" className="btn btn-lime">Explorar ideas de viaje <ArrowUpRight size={19} /></Link></div></section>
  </>;
}
