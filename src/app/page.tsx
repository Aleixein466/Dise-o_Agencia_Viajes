import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Camera, Compass, Globe2, Heart, Leaf, MapPin, Search, ShieldCheck, Sun, UsersRound, Wallet } from "lucide-react";
import { demoTrips, postSources, type TripPhoto } from "@/lib/demo-data";
import { HeroSlider } from "@/components/hero-slider";
import { PhotoGallery } from "@/components/photo-gallery";
import { TripCard } from "@/components/trip-card";

const experiences = [
  { title: "Naturaleza", icon: Leaf, image: "/images/social/eje-cafetero-2026.jpg", description: "Paisajes para respirar distinto" },
  { title: "Sol y playa", icon: Sun, image: "/images/social/atacames-2025.jpg", description: "Días que saben a mar" },
  { title: "Excursiones", icon: Compass, image: "/images/social/excursion-la-salle-2024.jpg", description: "Rutas para compartir" },
  { title: "Diversión", icon: Heart, image: "/images/social/parque-aguas-tobogan-2021.jpg", description: "Momentos para soltar la risa" },
];

const moments: TripPhoto[] = [
  demoTrips[0].photos[1], demoTrips[3].photos[2], demoTrips[4].photos[2], demoTrips[3].photos[4],
  demoTrips[1].photos[1], demoTrips[5].photos[3], demoTrips[3].photos[6], demoTrips[2].photos[1],
];

const steps = [
  { number: "01", title: "Inspírate", text: "Explora los viajes y lugares que ya hemos compartido." },
  { number: "02", title: "Cuéntanos tu idea", text: "Indica destino, fechas aproximadas y personas cuando se habilite el canal." },
  { number: "03", title: "Revisa la propuesta", text: "La agencia confirmará disponibilidad, condiciones y modalidades aplicables." },
  { number: "04", title: "Confirma con la agencia", text: "Una solicitud no es una reserva; espera la confirmación formal." },
  { number: "05", title: "Vive la experiencia", text: "Prepara lo necesario para disfrutar el viaje acordado." },
];

const faqs = [
  { q: "¿Puedo reservar uno de estos viajes?", a: "Las fichas muestran viajes realizados, no salidas abiertas. Las reservas estarán disponibles únicamente cuando la agencia publique fechas, cupos, tarifas y condiciones vigentes." },
  { q: "¿Qué documentos necesito para viajar?", a: "Depende del destino, la nacionalidad de cada viajero y las condiciones vigentes del recorrido. La agencia deberá confirmar los requisitos de una propuesta concreta antes de la salida." },
  { q: "¿Cómo funcionan los cambios y cancelaciones?", a: "Se definirán en las condiciones de cada paquete antes de ofrecerlo. No hay una política de cambios o cancelaciones aprobada para publicar en este prototipo." },
  { q: "¿Puedo pagar o apartar un cupo aquí?", a: "No. Este sitio todavía no procesa reservas ni pagos. Plan Separa y Ahorro Programado son conceptos en evaluación." },
  { q: "¿Cómo solicito una cotización?", a: "Puedes explorar y preparar tu idea de viaje. El envío de solicitudes se activará cuando estén configurados el canal de atención y la política de privacidad aprobada." },
  { q: "¿Dónde encuentro el contacto oficial o PQRS?", a: "Las páginas de Contacto y PQRS informan el estado de esos canales. Se actualizarán al confirmar los datos y el procedimiento oficial con Ricaurte Tours." },
];

const archivePosts = [
  { image: "/images/archive/eje-cafetero-2022.jpg", title: "Eje Cafetero · 2022", source: postSources.ejeCafeteroArchivo },
  { image: "/images/archive/dia-padre-cartagena-2022.jpg", title: "Cartagena · Día del Padre 2022", source: postSources.cartagenaPadreArchivo },
  { image: "/images/archive/cartagena-flash-2022.jpg", title: "Cartagena · 2022", source: postSources.cartagenaFlashArchivo },
  { image: "/images/archive/guatape-2021.jpg", title: "Guatapé · anuncio 2021", source: postSources.guatapeArchivo },
];

export default function Home() {
  return <>
    <section className="hero" aria-labelledby="hero-title"><div className="shell hero-layout"><div className="hero-copy"><span className="eyebrow">RICAURTE TOURS · AGENCIA DE VIAJES Y TURISMO</span><h1 id="hero-title">Viajes que se convierten en <em>historias.</em></h1><p>Hay lugares que nos sorprenden y momentos que se quedan. Recorre las experiencias que hemos compartido e imagina la siguiente.</p><div className="hero-actions"><Link href="/destinos" className="btn btn-primary">Explorar destinos <ArrowUpRight size={18} /></Link><Link href="/cotizar" className="btn btn-text">Preparar mi viaje <ArrowRight size={18} /></Link></div><a className="scroll-cue" href="#explorar"><span>DESLIZA PARA DESCUBRIR</span><ArrowDown size={17} /></a></div><HeroSlider /></div></section>

    <section className="search-section" aria-label="Explora ideas de viaje"><form className="shell discovery-search" action="/destinos"><div className="search-heading"><span className="eyebrow">TU PRÓXIMA IDEA</span><strong>¿A dónde te gustaría ir?</strong><small>Explora experiencias pasadas; no hay salidas publicadas.</small></div><label className="search-field"><MapPin size={20} /><span>Destino<input name="q" placeholder="Lugar o región" /></span></label><label className="search-field"><CalendarDays size={20} /><span>Fecha tentativa<input name="fecha" type="date" /></span></label><label className="search-field"><UsersRound size={20} /><span>Viajeros<input name="viajeros" type="number" min="1" max="30" defaultValue="2" /></span></label><label className="search-field"><Compass size={20} /><span>Experiencia<select name="categoria" defaultValue=""><option value="">Cualquiera</option><option>Naturaleza</option><option>Sol y playa</option><option>Excursiones</option><option>Diversión</option></select></span></label><button type="submit" className="search-button"><Search size={19} /> Buscar</button></form></section>

    <section className="shell availability-block" id="explorar"><div className="availability-icon"><CalendarDays size={27} /></div><div><span className="eyebrow">PRÓXIMAS AVENTURAS</span><h2>Próximas salidas por anunciar.</h2><p>Las fechas, tarifas y cupos futuros aún no están confirmados. Mientras tanto, descubre lo que ya hemos vivido y guarda una idea para tu próximo viaje.</p></div><Link className="text-link" href="/destinos">Ver experiencias <ArrowUpRight size={17} /></Link></section>

    <section className="shell section-pad" id="destinos"><div className="section-heading"><div><span className="eyebrow">VIAJES DESTACADOS · ARCHIVO REAL</span><h2>Lugares que dejaron <em>huella.</em></h2></div><div className="heading-aside"><p>Fotografías y recuerdos de recorridos publicados por la agencia. Cada ficha cuenta una experiencia pasada.</p><Link href="/destinos" className="text-link">Todas las historias <ArrowUpRight size={17} /></Link></div></div><div className="trip-grid home-trip-grid">{[demoTrips[4], demoTrips[3], demoTrips[0]].map((trip) => <TripCard trip={trip} key={trip.slug} />)}</div></section>

    <section className="place-feature"><div className="shell place-feature-layout"><div className="place-feature-photo"><Image src="/images/social/cartagena-castillo-2022.jpg" alt="Viajeros frente a una fortificación histórica de Cartagena" fill sizes="(max-width: 850px) 100vw, 51vw" /></div><div className="place-feature-copy"><span className="eyebrow">MÁS ALLÁ DEL DESTINO</span><h2>Un lugar se recuerda por <em>lo que vivimos allí.</em></h2><p>Las publicaciones de Cartagena reúnen patrimonio, calles de Getsemaní, playa y una visita al Oceanario. La historia también está en las sonrisas del grupo.</p><div className="place-tags"><span>Patrimonio</span><span>Playa</span><span>Vida marina</span><span>Risas</span></div><Link href="/destinos/cartagena" className="text-link">Conocer esta historia <ArrowUpRight size={17} /></Link></div></div></section>

    <section className="shell section-pad" id="experiencias"><div className="section-heading"><div><span className="eyebrow">EXPLORA A TU MANERA</span><h2>¿Qué despierta tus ganas de <em>viajar?</em></h2></div><p className="heading-aside">Tipos de experiencias que aparecen en los viajes documentados de Ricaurte Tours.</p></div><div className="experience-grid">{experiences.map(({ title, description, icon: Icon, image }) => <Link href={`/destinos?categoria=${encodeURIComponent(title)}`} className="experience-card" key={title}><Image src={image} alt={`Fotografía de ${title.toLowerCase()} en un viaje publicado por Ricaurte Tours`} fill sizes="(max-width: 650px) 50vw, 25vw" /><span className="experience-shade" /><span className="experience-icon"><Icon size={21} /></span><span className="experience-info"><small>{description}</small><strong>{title}</strong></span><ArrowUpRight className="experience-arrow" size={20} /></Link>)}</div></section>

    <section className="destinations-band"><div className="shell destinations-band-grid"><div><span className="eyebrow light">CERCA Y MÁS ALLÁ</span><h2>Historias en Colombia y <em>más allá de la frontera.</em></h2></div><div className="destination-mini-grid"><Link href="/destinos?region=colombia"><MapPin size={26} /><span><strong>Colombia</strong><small>Cartagena, San Andrés, Eje Cafetero y más</small></span><ArrowUpRight size={17} /></Link><Link href="/destinos?region=ecuador"><Globe2 size={26} /><span><strong>Ecuador</strong><small>Atacames en nuestro álbum de viajes</small></span><ArrowUpRight size={17} /></Link></div></div></section>

    <section className="shell section-pad" id="galeria"><div className="section-heading"><div><span className="eyebrow">MOMENTOS QUE HEMOS VIVIDO</span><h2>Los recuerdos tienen <em>rostro.</em></h2></div><div className="heading-aside"><p>Viajeros, paisajes, animales y mucha diversión en fotografías de publicaciones de Ricaurte Tours. Pulsa una imagen para verla más grande.</p><a className="text-link" href="https://www.facebook.com/ricaurtetours" target="_blank" rel="noopener noreferrer">Ver Facebook <ArrowUpRight size={17} /></a></div></div><PhotoGallery photos={moments} /></section>

    <section className="shell archive-section"><details className="archive-disclosure"><summary><span><strong>Archivo de afiches históricos</strong><small>Publicidad de años anteriores. Fechas, precios y condiciones no están vigentes.</small></span><ArrowDown size={21} /></summary><div className="archive-grid">{archivePosts.map((post) => <a href={post.source} target="_blank" rel="noopener noreferrer" className="archive-card" key={post.image}><span className="archive-photo"><Image src={post.image} alt={`Afiche histórico de ${post.title}`} fill sizes="(max-width: 650px) 50vw, 25vw" /></span><span>{post.title} <ArrowUpRight size={15} /></span></a>)}</div></details></section>

    <section className="journey-section" id="planes"><div className="shell"><div className="section-heading"><div><span className="eyebrow">PLANEA TU VIAJE</span><h2>De una idea a una <em>experiencia.</em></h2></div><p className="heading-aside">Un camino claro para cuando la agencia publique nuevas salidas y habilite sus canales de atención.</p></div><ol className="journey-steps">{steps.map((step) => <li key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol><div className="plan-grid"><article className="plan-card plan-separa"><Wallet size={28} /><span className="eyebrow">MODALIDAD EN EVALUACIÓN</span><h3>Plan Separa</h3><p>Concepto para distribuir el pago de una reserva confirmada. Requiere cronograma, contrato, valores y condiciones aprobados antes de ofrecerlo.</p><span className="plan-status">Sin pagos habilitados</span></article><article className="plan-card plan-ahorro"><Compass size={28} /><span className="eyebrow">MODALIDAD EN EVALUACIÓN</span><h3>Ahorro Programado</h3><p>Idea para planear una meta de viaje. Su funcionamiento depende de revisión jurídica, contable y comercial; aún no recibe aportes.</p><span className="plan-status">Sin aportes habilitados</span></article></div></div></section>

    <section className="trust-section"><div className="shell trust-layout"><div><span className="eyebrow light">CONFIANZA CON EVIDENCIA</span><h2>Historias reales, contadas con <em>claridad.</em></h2></div><div className="trust-list"><p><Camera size={22} /> Fotografías de viajes publicados por Ricaurte Tours, enlazadas a su fuente.</p><p><ShieldCheck size={22} /> Cada viaje histórico está marcado como experiencia realizada.</p><p><CalendarDays size={22} /> Fechas, precios y reservas se publicarán solo cuando sean confirmados.</p></div></div></section>

    <section className="shell section-pad" id="preguntas"><div className="section-heading"><div><span className="eyebrow">RESPUESTAS CLARAS</span><h2>Preguntas <em>frecuentes.</em></h2></div><p className="heading-aside">Lo que puedes hacer hoy y lo que aún está en preparación.</p></div><div className="faq-list">{faqs.map((faq) => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}</div></section>

    <section className="closing-banner"><Image src="/images/social/excursion-momento.jpg" alt="Viajeros compartiendo un momento de excursión" fill sizes="100vw" /><div className="closing-shade" /><div className="shell closing-content"><span className="eyebrow light">LA SIGUIENTE HISTORIA</span><h2>Hay mucho mundo por <em>descubrir juntos.</em></h2><Link href="/destinos" className="btn btn-primary">Explorar los destinos <ArrowUpRight size={18} /></Link></div></section>
  </>;
}
