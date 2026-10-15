export type TripPhoto = {
  image: string;
  alt: string;
  caption: string;
  sourceUrl: string;
};

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
  photos: TripPhoto[];
};

export const postSources = {
  ejeCafeteroArchivo: "https://www.facebook.com/ricaurtetours/posts/pfbid0HVDxYjmsvyKt4jMwvW9PXUPE9YoVDqhAKYAbAhiRXfkLY6fJSgyumc3ZPANPMzuNl",
  cartagenaPadreArchivo: "https://www.facebook.com/ricaurtetours/posts/pfbid0dJzGiRd9oiaWLUhZEgwKefXd7Rx3zysvwQFufVbSpz6UsKr7hkic22ek2soZLgwrl",
  cartagenaFlashArchivo: "https://www.facebook.com/ricaurtetours/posts/pfbid02M78Cq3UYpqtruJoiXovkA6sDeTt8gxFYE8aYtVyrtdjWEQHTZL9vJyKSH6pRU8pal",
  guatapeArchivo: "https://www.facebook.com/ricaurtetours/posts/pfbid07rcbW6JfKeawNBoHeywhNUp5kdHfoCzYScR6jFwDoVJnKunb7DSpfPqtyfgzTDtGl",
  cartagenaEcuador: "https://www.facebook.com/ricaurtetours/posts/pfbid03UvHFJ4CiYjZg1PDy7GSA6rcSJr2KejYRVo85BQ4C3pQTaq44A6FskWCvWdVEVuql",
  cartagenaTour: "https://www.facebook.com/ricaurtetours/posts/pfbid02XQwYJStrikBfnCofdAszzUFtcCAowdkbGCtLXZfCt9BuWTigsSNeVTp4CEKKqLcxl",
  cartagenaOceanario: "https://www.facebook.com/ricaurtetours/posts/pfbid0pqaAFA7RHYau1trFpB2BD9AJmdiVRpCaFzi1ZDwAj3qnpqyfkQmhpxuy1tCNSwoil",
  sanAndres: "https://www.facebook.com/ricaurtetours/posts/pfbid08nZi3SnRmpBRES81vtEyXd4xcMWZTjM8uwGo41SgcMWRG1R6MbL5hkt8wq6xzdihl",
  parqueAguas: "https://www.facebook.com/ricaurtetours/posts/pfbid02uEaRdAX1bZnj3NPkzZuBD95NCSiGXt72fxCjquWf7aJP1Krn6bDJPnReX3RpXxQFl",
} as const;

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
    photos: [
      { image: "/images/social/eje-cafetero-2026.jpg", alt: "Grupo de viajeras en el Eje Cafetero", caption: "Viaje en grupo · 2026", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid02qekU9VFtujNEhXBo1NDofAwCF7KdP7sw6EuRy6HYVjBsg67qAUGm551KMeymmjFgl" },
      { image: "/images/social/eje-cafetero-momento.jpg", alt: "Viajera posando durante el recorrido al Eje Cafetero", caption: "Un momento del recorrido", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid02qekU9VFtujNEhXBo1NDofAwCF7KdP7sw6EuRy6HYVjBsg67qAUGm551KMeymmjFgl" },
    ],
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
    photos: [
      { image: "/images/social/atacames-2025.jpg", alt: "Grupo de viajeros en la playa de Atacames", caption: "Playa de Atacames · 2025", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid024bTj1rCqxL4D27wYoouNGbTe87HBtVcer3wTQ5sSfnncZRhgC5J4jRbfHHrm5vaNl" },
      { image: "/images/social/atacames-momento.jpg", alt: "Viajeros compartiendo un momento en Atacames", caption: "Recuerdos junto al mar", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid024bTj1rCqxL4D27wYoouNGbTe87HBtVcer3wTQ5sSfnncZRhgC5J4jRbfHHrm5vaNl" },
    ],
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
    photos: [
      { image: "/images/social/excursion-la-salle-2024.jpg", alt: "Grupo de la Excursión Chévere 2024 en la playa", caption: "Excursión Chévere · 2024", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid0EV2uYFLFLoME96q6fWpeP52ft68sFeVyfWfVg3Z7BJvLoAh9gT5GdkcnRZGpXLa2l" },
      { image: "/images/social/excursion-momento.jpg", alt: "Grupo de estudiantes durante la excursión", caption: "Momentos en grupo", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid0EV2uYFLFLoME96q6fWpeP52ft68sFeVyfWfVg3Z7BJvLoAh9gT5GdkcnRZGpXLa2l" },
      { image: "/images/social/excursion-ie-ricaurte-2024.jpg", alt: "Grupo de la Institución Educativa Ricaurte en otra excursión", caption: "Otra excursión escolar · 2024", sourceUrl: "https://www.facebook.com/ricaurtetours/posts/pfbid02RYeEvAnDm7gX3QrtknDvAxE1qoKho32xFu2ro4jj8LNw4U7X1MQJ7eBWsT6iw7Gvl" },
    ],
  },
  {
    slug: "cartagena",
    name: "Cartagena",
    region: "Colombia",
    category: "Sol y playa",
    duration: "Viajes realizados en 2022",
    image: "/images/social/cartagena-playa-2022.jpg",
    imageAlt: "Viajeros de Ricaurte Tours en una playa de Cartagena",
    sourceUrl: postSources.cartagenaEcuador,
    teaser: "Historia, playa, Getsemaní y recuerdos de viajeros en Cartagena.",
    description: "Ricaurte Tours publicó viajes a Cartagena en 2022. Una publicación muestra a visitantes de Ecuador disfrutando sus playas, arquitectura e historia. Otras fotografías documentan recorridos por fortificaciones, Getsemaní y el Oceanario. Las imágenes corresponden a viajes pasados y no anuncian una salida actual.",
    highlights: ["Playas de Cartagena", "Fortificaciones y Getsemaní", "Oceanario y vida marina vistos en las publicaciones"],
    photos: [
      { image: "/images/social/cartagena-playa-2022.jpg", alt: "Grupo de viajeros en una playa de Cartagena", caption: "Playa y viajeros · 2022", sourceUrl: postSources.cartagenaEcuador },
      { image: "/images/social/cartagena-castillo-2022.jpg", alt: "Viajeros frente a una fortificación histórica de Cartagena", caption: "Historia de Cartagena", sourceUrl: postSources.cartagenaEcuador },
      { image: "/images/social/cartagena-alegria-2022.jpg", alt: "Viajeros posando con alegría durante el recorrido de Cartagena", caption: "Momentos de diversión", sourceUrl: postSources.cartagenaEcuador },
      { image: "/images/social/cartagena-getsemani-2022.jpg", alt: "Viajeros frente a una fachada colorida de Getsemaní", caption: "Calles de Getsemaní", sourceUrl: postSources.cartagenaTour },
      { image: "/images/social/cartagena-oceanario-2022.jpg", alt: "Viajeros frente a la entrada del Oceanario de las Islas del Rosario", caption: "Oceanario", sourceUrl: postSources.cartagenaOceanario },
      { image: "/images/social/cartagena-fortaleza-2022.jpg", alt: "Viajeros en una fortificación de Cartagena", caption: "Fortificaciones de Cartagena", sourceUrl: postSources.cartagenaOceanario },
      { image: "/images/social/cartagena-delfines-2022.jpg", alt: "Viajera en el agua junto a delfines durante un tour documentado", caption: "Fotografía con delfines", sourceUrl: postSources.cartagenaTour },
    ],
  },
  {
    slug: "san-andres",
    name: "San Andrés",
    region: "Colombia insular",
    category: "Sol y playa",
    duration: "Viaje realizado en 2022",
    image: "/images/social/san-andres-playa-2022.jpg",
    imageAlt: "Visitantes disfrutando una playa de San Andrés",
    sourceUrl: postSources.sanAndres,
    teaser: "Mar turquesa, palmeras y vacaciones familiares en la isla.",
    description: "Una publicación de Ricaurte Tours de junio de 2022 muestra las vacaciones de la familia Rojas en San Andrés. Las fotografías registran la playa, el paisaje de palmeras y momentos de diversión en el mar. No se presentan como un paquete disponible hoy.",
    highlights: ["Playa y mar turquesa", "Paisaje de palmeras", "Vacaciones familiares documentadas"],
    photos: [
      { image: "/images/social/san-andres-playa-2022.jpg", alt: "Playa y aguas turquesas de San Andrés con visitantes", caption: "La playa de San Andrés", sourceUrl: postSources.sanAndres },
      { image: "/images/social/san-andres-familia-2022.jpg", alt: "Familia y acompañantes posando bajo palmeras en San Andrés", caption: "Viaje en familia", sourceUrl: postSources.sanAndres },
      { image: "/images/social/san-andres-diversion-2022.jpg", alt: "Niñas y acompañantes posando alegremente bajo palmeras", caption: "Momentos de alegría", sourceUrl: postSources.sanAndres },
      { image: "/images/social/san-andres-mar-2022.jpg", alt: "Viajeros disfrutando del mar de San Andrés", caption: "Diversión en el mar", sourceUrl: postSources.sanAndres },
    ],
  },
  {
    slug: "parque-de-las-aguas",
    name: "Parque de las Aguas",
    region: "Medellín, Colombia",
    category: "Diversión",
    duration: "Visita documentada en 2021",
    image: "/images/social/parque-aguas-2021.jpg",
    imageAlt: "Visitantes disfrutando de flotadores en el Parque de las Aguas",
    sourceUrl: postSources.parqueAguas,
    teaser: "Flotadores, toboganes y diversión acuática cerca de Medellín.",
    description: "En una publicación de noviembre de 2021, Ricaurte Tours contó que visitó el Parque de las Aguas en Medellín y compartió fotografías de las atracciones acuáticas y los visitantes. Es una visita pasada, sin fechas ni condiciones comerciales vigentes.",
    highlights: ["Atracciones acuáticas", "Toboganes y flotadores", "Visita documentada por la agencia"],
    photos: [
      { image: "/images/social/parque-aguas-2021.jpg", alt: "Visitantes disfrutando flotadores en el Parque de las Aguas", caption: "Diversión en el agua", sourceUrl: postSources.parqueAguas },
      { image: "/images/social/parque-aguas-deslizadero-2021.jpg", alt: "Deslizaderos del Parque de las Aguas", caption: "Deslizaderos", sourceUrl: postSources.parqueAguas },
      { image: "/images/social/parque-aguas-rio-2021.jpg", alt: "Visitantes recorriendo una atracción acuática", caption: "Recorrido acuático", sourceUrl: postSources.parqueAguas },
      { image: "/images/social/parque-aguas-tobogan-2021.jpg", alt: "Visitante bajando por un tobogán azul", caption: "Un momento de diversión", sourceUrl: postSources.parqueAguas },
    ],
  },
];

export const categories = ["Todos", "Naturaleza", "Sol y playa", "Excursiones", "Diversión"];
