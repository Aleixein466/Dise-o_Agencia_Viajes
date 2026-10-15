export type DemoTrip = {
  slug: string;
  name: string;
  region: string;
  category: string;
  duration: string;
  image: string;
  imageAlt: string;
  sourceUrl: string;
  teaser: string;
  description: string;
  highlights: string[];
};

// Documented past trips from posts supplied by the client. They are not current offers.
export const demoTrips: DemoTrip[] = [
  {
    slug: "eje-cafetero",
    name: "Eje Cafetero",
    region: "Colombia",
    category: "Naturaleza",
    duration: "Viaje realizado en 2026",
    image: "/images/social/eje-cafetero-2026.jpg",
    imageAlt: "Grupo de viajeros de Ricaurte Tours durante un viaje al Eje Cafetero en 2026",
    sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid02qekU9VFtujNEhXBo1NDofAwCF7KdP7sw6EuRy6HYVjBsg67qAUGm551KMeymmjFgl",
    teaser: "Un recorrido compartido por paisajes y tradiciones cafeteras en julio de 2026.",
    description: "Ricaurte Tours publicó un viaje al Eje Cafetero realizado del 27 al 29 de julio de 2026 con un grupo de Madres Comunitarias de la zonal Tumaco. La publicación recuerda los paisajes, la cultura y los momentos compartidos. Esta ficha documenta esa experiencia pasada; no indica fechas ni disponibilidad futuras.",
    highlights: ["Paisajes cafeteros", "Cultura y tradiciones de la región", "Experiencia grupal documentada"],
  },
  {
    slug: "atacames",
    name: "Atacames",
    region: "Ecuador",
    category: "Sol y playa",
    duration: "Viaje realizado en 2025",
    image: "/images/social/atacames-2025.jpg",
    imageAlt: "Grupo de viajeros de Ricaurte Tours en la playa de Atacames en 2025",
    sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid024bTj1rCqxL4D27wYoouNGbTe87HBtVcer3wTQ5sSfnncZRhgC5J4jRbfHHrm5vaNl",
    teaser: "Un grupo de viajeros disfrutó de Atacames del 8 al 10 de enero de 2025.",
    description: "La agencia agradeció públicamente a un grupo de turistas de Mocoa, Putumayo, que viajó a Atacames, Ecuador, del 8 al 10 de enero de 2025. Esta ficha muestra un viaje ya realizado, sin trasladar sus condiciones comerciales a una oferta actual.",
    highlights: ["Viaje grupal documentado", "Destino de costa en Ecuador", "Fotografías de la publicación original"],
  },
  {
    slug: "excursion-chevere",
    name: "Excursión Chévere",
    region: "Eje Cafetero · Cartagena · Medellín",
    category: "Excursiones",
    duration: "Viaje realizado en 2024",
    image: "/images/social/excursion-la-salle-2024.jpg",
    imageAlt: "Estudiantes y acompañantes durante la excursión Chévere 2024 de Ricaurte Tours",
    sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid0EV2uYFLFLoME96q6fWpeP52ft68sFeVyfWfVg3Z7BJvLoAh9gT5GdkcnRZGpXLa2l",
    teaser: "Una excursión estudiantil que recorrió Eje Cafetero, Cartagena y Medellín.",
    description: "En una publicación de agradecimiento a la Institución Educativa La Salle, Ricaurte Tours documentó su Excursión Chévere 2024 por el Eje Cafetero, Cartagena y Medellín. La ruta se muestra como antecedente de experiencia y no como paquete vigente.",
    highlights: ["Eje Cafetero", "Cartagena", "Medellín"],
  },
];

export const categories = ["Todos", "Naturaleza", "Sol y playa", "Excursiones"];
