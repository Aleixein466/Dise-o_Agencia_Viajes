import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Compass, Leaf, MapPin, Plane, Search, Sun, UsersRound, Wallet } from "lucide-react";
import { demoTrips, postSources } from "@/lib/demo-data";
import { TripCard } from "@/components/trip-card";

const categories = [
  { label: "Naturaleza", icon: Leaf, image: "/images/social/eje-cafetero-2026.jpg" },
  { label: "Sol y playa", icon: Sun, image: "/images/social/san-andres-playa-2022.jpg" },
  { label: "Excursiones", icon: Compass, image: "/images/social/excursion-la-salle-2024.jpg" },
  { label: "Diversión", icon: UsersRound, image: "/images/social/parque-aguas-2021.jpg" },
];

const places = [
  { image: "/images/social/san-andres-playa-2022.jpg", alt: "Playa de San Andrés con visitantes disfrutando el mar", label: "San Andrés", detail: "Playas y mar turquesa", href: "/destinos/san-andres" },
  { image: "/images/social/cartagena-castillo-2022.jpg", alt: "Viajeros frente a una fortificación de Cartagena", label: "Cartagena", detail: "Historia y arquitectura", href: "/destinos/cartagena" },
  { image: "/images/social/cartagena-delfines-2022.jpg", alt: "Viajera junto a delfines en una fotografía de un tour a Cartagena", label: "Delfines", detail: "Vida marina documentada", href: "/destinos/cartagena" },
  { image: "/images/social/parque-aguas-2021.jpg", alt: "Visitantes en los flotadores del Parque de las Aguas", label: "Parque de las Aguas", detail: "Atracciones y diversión", href: "/destinos/parque-de-las-aguas" },
];

const gallery = [
  { image: "/images/social/eje-cafetero-momento.jpg", alt: "Viajera durante el recorrido al Eje Cafetero", label: "Eje Cafetero · 2026", source: demoTrips[0].sourceUrl },
  { image: "/images/social/atacames-momento.jpg", alt: "Viajeros en la playa de Atacames", label: "Atacames · 2025", source: demoTrips[1].sourceUrl },
  { image: "/images/social/excursion-momento.jpg", alt: "Grupo de la Excursión Chévere 2024", label: "Excursión Chévere · 2024", source: demoTrips[2].sourceUrl },
  { image: "/images/social/excursion-ie-ricaurte-2024.jpg", alt: "Grupo de la Institución Educativa Ricaurte durante una excursión", label: "Excursión escolar · 2024", source: "https://www.facebook.com/ricaurtetours/posts/pfbid02RYeEvAnDm7gX3QrtknDvAxE1qoKho32xFu2ro4jj8LNw4U7X1MQJ7eBWsT6iw7Gvl" },
  { image: "/images/social/cartagena-playa-2022.jpg", alt: "Viajeros de Ecuador posando en una playa de Cartagena", label: "Cartagena · playa", source: postSources.cartagenaEcuador },
  { image: "/images/social/cartagena-alegria-2022.jpg", alt: "Viajeros posando con alegría en Cartagena", label: "Cartagena · risas", source: postSources.cartagenaEcuador },
  { image: "/images/social/cartagena-oceanario-2022.jpg", alt: "Viajeros en la entrada del Oceanario de las Islas del Rosario", label: "Islas del Rosario", source: postSources.cartagenaOceanario },
  { image: "/images/social/cartagena-getsemani-2022.jpg", alt: "Viajeros frente a una fachada colorida de Getsemaní", label: "Getsemaní", source: postSources.cartagenaTour },
  { image: "/images/social/san-andres-familia-2022.jpg", alt: "Familia y acompañantes bajo palmeras en San Andrés", label: "San Andrés · familia", source: postSources.sanAndres },
  { image: "/images/social/san-andres-diversion-2022.jpg", alt: "Niñas y acompañantes posando bajo palmeras", label: "San Andrés · alegría", source: postSources.sanAndres },
  { image: "/images/social/san-andres-mar-2022.jpg", alt: "Viajeros divirtiéndose en el mar de San Andrés", label: "San Andrés · mar", source: postSources.sanAndres },
  { image: "/images/social/parque-aguas-tobogan-2021.jpg", alt: "Visitante deslizándose en un tobogán azul", label: "Parque de las Aguas", source: postSources.parqueAguas },
];

const archivePosts = [
  { image: "/images/archive/eje-cafetero-2022.jpg", title: "Eje Cafetero · 2022", source: postSources.ejeCafeteroArchivo },
  { image: "/images/archive/dia-padre-cartagena-2022.jpg", title: "Cartagena · Día del Padre 2022", source: postSources.cartagenaPadreArchivo },
  { image: "/images/archive/cartagena-flash-2022.jpg", title: "Cartagena · 2022", source: postSources.cartagenaFlashArchivo },
  { image: "/images/archive/guatape-2021.jpg", title: "Guatapé · anuncio 2021", source: postSources.guatapeArchivo },
];

export default function Home() {
  return <>
    <section className="hero hero-reference">
      <Image src="/images/social/san-andres-playa-2022.jpg" alt="Playa y mar turquesa de San Andrés fotografiados en un viaje de Ricaurte Tours" fill priority sizes="100vw" className="hero-photo" />
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

    <div className="demo-ribbon"><span className="shell">VIAJES DOCUMENTADOS · Fotografías de las publicaciones de Ricaurte Tours. No hay salidas, tarifas ni disponibilidad confirmadas.</span></div>

    <section className="shell section-pad" id="destinos">
      <div className="section-heading"><div><span className="eyebrow">HISTORIAS DE VIAJE</span><h2>Destinos que ya<br /><em>recorrimos.</em></h2></div><div className="heading-aside"><p>Estas experiencias aparecen en publicaciones de Ricaurte Tours. Descubre las historias y consulta más adelante por nuevas posibilidades de viaje.</p><Link href="/destinos" className="text-link">Ver viajes realizados <ArrowUpRight size={18} /></Link></div></div>
      <div className="trip-grid">{demoTrips.map((trip, i) => <TripCard trip={trip} index={i} key={trip.slug} />)}</div>
    </section>

    <section className="places-section" id="lugares"><div className="shell"><div className="section-heading"><div><span className="eyebrow">LUGARES QUE INSPIRAN</span><h2>Un viaje lleno de<br /><em>lugares para recordar.</em></h2></div><div className="heading-aside"><p>Playas, patrimonio, vida marina y planes para divertirse, vistos en los viajes y visitas que publicó la agencia.</p><Link href="/destinos" className="text-link">Conocer los destinos <ArrowUpRight size={18} /></Link></div></div><div className="places-grid">{places.map((place, index) => <Link className={`place-card place-card-${index + 1}`} href={place.href} key={place.label}><Image src={place.image} alt={place.alt} fill sizes={index === 0 ? "(max-width: 750px) 100vw, 42vw" : "(max-width: 750px) 50vw, 26vw"} /><span className="place-shade" /><span className="place-content"><small>{place.detail}</small><strong>{place.label}</strong></span><ArrowUpRight className="place-arrow" size={21} /></Link>)}</div></div></section>

    <section className="category-section" id="experiencias"><div className="shell"><div className="category-heading"><span className="eyebrow">VIAJA COMO TE GUSTA</span><h2>¿Qué te mueve a <em>explorar?</em></h2><p>Encuentra experiencias vividas por viajeros de Ricaurte Tours.</p></div><div className="category-grid">{categories.map(({ label, icon: Icon, image }) => <Link className="category-card" href={`/destinos?categoria=${encodeURIComponent(label)}`} key={label}><Image src={image} alt={`Fotografía de un viaje de ${label.toLowerCase()} publicado por Ricaurte Tours`} fill sizes="(max-width: 750px) 100vw, 33vw" /><span className="category-tint" /><span className="category-icon"><Icon size={23} /></span><strong>{label}</strong><span className="category-arrow"><ArrowUpRight size={19} /></span></Link>)}</div></div></section>

    <section className="shell social-gallery section-pad"><div className="section-heading"><div><span className="eyebrow">MOMENTOS REALES</span><h2>Así se han vivido<br /><em>nuestros viajes.</em></h2></div><div className="heading-aside"><p>Risas, poses, paisajes y diversión en fotografías de las publicaciones que compartiste. Cada imagen lleva a su fuente.</p><a href="https://www.facebook.com/ricaurtetours" className="text-link" target="_blank" rel="noopener noreferrer">Visitar Facebook <ArrowUpRight size={18} /></a></div></div><div className="gallery-grid">{gallery.map((item) => <a className="gallery-item" key={item.image} href={item.source} target="_blank" rel="noopener noreferrer" aria-label={`Ver publicación de ${item.label} en Facebook`}><Image src={item.image} alt={item.alt} fill sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw" /><span>{item.label}<ArrowUpRight size={16} /></span></a>)}</div></section>

    <section className="shell archive-section"><details className="archive-disclosure"><summary><span><strong>Archivo de publicaciones</strong><small>Cuatro afiches promocionales antiguos que también compartiste. Sus precios, fechas y condiciones ya no están vigentes.</small></span><ArrowRight size={22} /></summary><div className="archive-grid">{archivePosts.map((post) => <a className="archive-card" key={post.image} href={post.source} target="_blank" rel="noopener noreferrer" aria-label={`Ver publicación histórica de ${post.title} en Facebook`}><span className="archive-photo"><Image src={post.image} alt={`Afiche histórico de ${post.title} publicado por Ricaurte Tours`} fill sizes="(max-width: 600px) 50vw, 25vw" /></span><span className="archive-card-meta"><strong>{post.title}</strong><small>Publicidad histórica · Ver publicación <ArrowUpRight size={13} /></small></span></a>)}</div></details></section>

    <section className="shell travel-plans section-pad" id="planes"><div className="section-heading"><div><span className="eyebrow">PLANEACIÓN A TU RITMO</span><h2>Hablemos de la forma<br /><em>de hacerlo posible.</em></h2></div><p className="how-intro">Estas modalidades son conceptos del proyecto y requieren condiciones comerciales y legales aprobadas antes de ofrecerse.</p></div><div className="plan-grid"><article className="plan-card plan-separa"><div className="plan-icon"><Wallet size={27} /></div><span className="plan-label">MODALIDAD POR DEFINIR</span><h3>Plan Separa</h3><p>Una propuesta futura para distribuir el pago de una reserva confirmada, con cronograma y condiciones visibles desde el inicio.</p><ul><li><Check size={16} /> Cuotas asociadas a una reserva</li><li><Check size={16} /> Saldo y fechas claras</li></ul><span className="plan-status">Pendiente de condiciones</span></article><article className="plan-card plan-ahorro"><div className="plan-icon"><Compass size={27} /></div><span className="plan-label">EN EVALUACIÓN</span><h3>Ahorro programado</h3><p>Una posibilidad de planeación que solo se habilitaría después de revisar su alcance contractual, contable y regulatorio.</p><ul><li><Check size={16} /> Meta de viaje personal</li><li><Check size={16} /> Movimientos consultables</li></ul><span className="plan-status">Aún no disponible</span></article></div></section>

    <section className="visual-story"><div className="shell visual-grid"><div className="visual-copy"><span className="eyebrow">EXPERIENCIAS QUE DEJAN RECUERDOS</span><h2>Del patrimonio<br />al encuentro con <em>la vida marina.</em></h2><p>Las publicaciones de Cartagena muestran playas, calles históricas, el Oceanario y una fotografía junto a delfines. También hay momentos para posar, reír y compartir en familia.</p><div className="story-points"><span><b>01</b> Descubre</span><span><b>02</b> Comparte</span><span><b>03</b> Recuerda</span></div><Link href="/destinos/cartagena" className="text-link">Explorar Cartagena <ArrowUpRight size={18} /></Link></div><a className="visual-photo" href={postSources.cartagenaTour} target="_blank" rel="noopener noreferrer"><Image src="/images/social/cartagena-delfines-2022.jpg" alt="Viajera junto a delfines en una foto de un tour a Cartagena de 2022" fill sizes="(max-width: 800px) 100vw, 50vw" /><span className="visual-caption">Fotografía del tour Cartagena 2022 · Ver publicación <ArrowUpRight size={15} /></span></a></div></section>

    <section className="shell faq-section section-pad" id="preguntas"><div className="section-heading"><div><span className="eyebrow">TE ACOMPAÑAMOS</span><h2>Preguntas <em>frecuentes.</em></h2></div><p className="how-intro">Lo esencial sobre esta primera versión del sitio.</p></div><div className="faq-list"><details><summary>¿Puedo reservar uno de los destinos que aparece aquí?</summary><p>Estas páginas documentan viajes pasados. La agencia debe confirmar sus paquetes, fechas, cupos y precios antes de recibir nuevas reservas.</p></details><details><summary>¿Cómo solicito una cotización?</summary><p>El formulario está preparado, pero su envío se activará cuando la agencia configure la base de datos y apruebe su política de privacidad.</p></details><details><summary>¿Ya está disponible Plan Separa o ahorro programado?</summary><p>No. Ambas modalidades siguen en definición. El ahorro programado requiere una revisión jurídica y contable antes de habilitar aportes.</p></details></div></section>

    <section className="closing-banner"><Image src="/images/social/cartagena-getsemani-2022.jpg" alt="Fachada colorida de Getsemaní fotografiada en un viaje a Cartagena" fill sizes="100vw" /><div className="closing-shade" /><div className="shell closing-content"><span className="eyebrow light">RICAURTE TOURS</span><h2>Tu próxima historia<br /><em>puede empezar aquí.</em></h2><Link href="/destinos" className="btn btn-lime">Explorar ideas de viaje <ArrowUpRight size={19} /></Link></div></section>
  </>;
}
