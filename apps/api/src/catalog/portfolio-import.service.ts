import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";

type Rate = { code: string; label: string; cents: number; hotel?: string };
type PortfolioPackage = {
  slug: string;
  title: string;
  days: number;
  transport: "GROUND" | "AIR";
  departures: string[];
  food: string;
  hotels: string[];
  rates: Rate[];
  itinerary: string[];
  includes: string[];
  excludes: string[];
  optionalTours: string[];
  warning?: string;
};
type PortfolioDestination = { slug: string; name: string; description: string; packages: PortfolioPackage[] };

// Transcribed from the owner-supplied DOCX. These are source values, never public prices:
// imported rows remain DRAFT and price rules have isFictitious=true pending commercial approval.
const D: PortfolioDestination[] = [
  {
    slug: "narino-encantador",
    name: "Nariño Encantador",
    description: "Pasto, Las Lajas y Laguna de La Cocha.",
    packages: [
      {
        slug: "narino-encantador-3d2n",
        title: "Nariño Encantador 3 días 2 noches",
        days: 3,
        transport: "GROUND",
        departures: ["Pasto"],
        food: "Desayunos y cenas",
        hotels: ["Ayenda La Merced", "HYG Hotel Boutique", "Hotel Confort Suite", "Hotel V1501"],
        rates: ["Ayenda La Merced", "HYG Hotel Boutique", "Hotel Confort Suite"]
          .flatMap((hotel) => [
            { code: `${hotel}-doble`, label: `${hotel} doble`, cents: 64500000, hotel },
            { code: `${hotel}-multiple`, label: `${hotel} triple o cuádruple`, cents: 59500000, hotel },
          ])
          .concat([
            { code: "v1501-doble", label: "Hotel V1501 doble", cents: 94500000, hotel: "Hotel V1501" },
            { code: "v1501-multiple", label: "Hotel V1501 triple o cuádruple", cents: 94500000, hotel: "Hotel V1501" },
          ]),
        itinerary: [
          "Llegada a Pasto, Museo del Carnaval y city tour religioso.",
          "Ipiales, Santuario de Las Lajas y teleférico.",
          "El Encano, lancha en La Cocha e Isla La Corota.",
        ],
        includes: ["Transporte terrestre", "2 noches", "Museo", "Teleférico", "Lancha", "Asistencia médica"],
        excludes: ["Almuerzos", "Gastos no especificados"],
        optionalTours: [],
      },
    ],
  },
  {
    slug: "eje-cafetero",
    name: "Eje Cafetero",
    description: "Quindío, Salento, Valle de Cocora y Parque del Café.",
    packages: [
      {
        slug: "eje-cafetero-3d2n",
        title: "Eje Cafetero 3 días 2 noches",
        days: 3,
        transport: "GROUND",
        departures: ["Ricaurte", "Pasto"],
        food: "2 desayunos y 2 cenas",
        hotels: [
          "Hacienda Karlaka",
          "Hotel Campestre La Cecilia",
          "Hotel Quindío Campestre",
          "Hotel Campestre Los Arrieros",
        ],
        rates: [
          { code: "multiple", label: "Acomodación múltiple 3 a 5 personas", cents: 52500000 },
          { code: "doble", label: "Acomodación doble", cents: 56500000 },
        ],
        itinerary: [
          "Llegada, Basílica de Buga y finca cafetera.",
          "Salento, Filandia, Willys, Cocora y Mirador Encanto.",
          "Parque del Café y regreso.",
        ],
        includes: ["Transporte", "Finca cafetera", "Parque del Café", "Willys", "Asistencia médica"],
        excludes: ["Alimentación en vía", "Miradores Cocora", "Gastos no especificados"],
        optionalTours: [],
        warning: "El resumen indica desde $525.000; la tabla conserva $525.000 múltiple y $565.000 doble.",
      },
      {
        slug: "eje-cafetero-4d3n",
        title: "Eje Cafetero 4 días 3 noches",
        days: 4,
        transport: "GROUND",
        departures: ["Ricaurte", "Pasto"],
        food: "3 desayunos y 3 cenas",
        hotels: [
          "Hacienda Karlaka",
          "Hotel Campestre La Cecilia",
          "Hotel Quindío Campestre",
          "Hotel Campestre Los Arrieros",
        ],
        rates: [
          { code: "multiple", label: "Acomodación múltiple 3 a 5 personas", cents: 74500000 },
          { code: "doble", label: "Acomodación doble", cents: 80500000 },
        ],
        itinerary: [
          "Llegada, Buga y finca cafetera.",
          "Salento, Filandia, Willys y Cocora.",
          "Termales de Santa Rosa de Cabal.",
          "Parque del Café y regreso.",
        ],
        includes: ["Todo el plan 3D/2N", "Termales Santa Rosa"],
        excludes: ["Alimentación en vía", "Miradores Cocora"],
        optionalTours: [],
        warning:
          "El texto señala adicional doble de $20.000 por persona por noche; la tabla contiene una diferencia de $60.000. Requiere validación.",
      },
    ],
  },
  {
    slug: "medellin",
    name: "Medellín",
    description: "City tour, Comuna 13 y Guatapé.",
    packages: [
      {
        slug: "medellin-4d3n",
        title: "Medellín 4 días 3 noches",
        days: 4,
        transport: "AIR",
        departures: ["Pasto", "Ipiales"],
        food: "3 desayunos y 3 cenas",
        hotels: ["Hotel Santorini 70", "Hotel OBO", "Hotel Dorado La 70"],
        rates: [
          { code: "santorini", label: "Hotel Santorini 70", cents: 149500000, hotel: "Hotel Santorini 70" },
          { code: "obo", label: "Hotel OBO", cents: 149500000, hotel: "Hotel OBO" },
          { code: "dorado", label: "Hotel Dorado La 70", cents: 164500000, hotel: "Hotel Dorado La 70" },
        ],
        itinerary: [
          "Vuelo y hotel.",
          "Plaza Botero, metro, metrocable, Pueblito Paisa y Comuna 13.",
          "Guatapé, embalse y Piedra del Peñol.",
          "Aeropuerto y regreso.",
        ],
        includes: ["Tiquete con equipaje de mano", "3 noches", "City tour", "Lancha Guatapé", "Asistencia médica"],
        excludes: ["Traslados aeropuerto", "Almuerzos", "Entrada Piedra del Peñol"],
        optionalTours: [],
      },
    ],
  },
  {
    slug: "cartagena",
    name: "Cartagena",
    description: "Ciudad Amurallada, Barú y Tierra Bomba según variante.",
    packages: [
      {
        slug: "cartagena-4d3n",
        title: "Cartagena 4 días 3 noches",
        days: 4,
        transport: "AIR",
        departures: ["Pasto", "Ipiales"],
        food: "Desayuno, almuerzo y cena",
        hotels: ["Cartagena Premium 3 Estrellas", "Hotel Costa del Sol 3 Estrellas", "Hotel Dubai 4 Estrellas"],
        rates: [
          { code: "premium", label: "Cartagena Premium", cents: 144500000 },
          { code: "costa", label: "Costa del Sol", cents: 152500000 },
          { code: "dubai", label: "Dubai", cents: 178000000 },
        ],
        itinerary: [
          "Vuelo, traslado y hotel.",
          "City tour en chiva.",
          "Tour Barú Playa Blanca.",
          "Aeropuerto y regreso.",
        ],
        includes: ["Tiquete", "Traslados", "Alimentación completa", "Chiva", "Barú", "Asistencia médica"],
        excludes: ["Castillo San Felipe", "Seguro Playa Blanca"],
        optionalTours: ["Chiva rumbera nocturna", "Tour Bahía en barco"],
      },
      {
        slug: "cartagena-5d4n",
        title: "Cartagena 5 días 4 noches",
        days: 5,
        transport: "AIR",
        departures: ["Pasto", "Ipiales"],
        food: "Desayuno, almuerzo y cena",
        hotels: ["Cartagena Premium 3 Estrellas", "Hotel Costa del Sol 3 Estrellas", "Hotel Dubai 4 Estrellas"],
        rates: [
          { code: "premium", label: "Cartagena Premium", cents: 156500000 },
          { code: "costa", label: "Costa del Sol", cents: 164500000 },
          { code: "dubai", label: "Dubai", cents: 198000000 },
        ],
        itinerary: [
          "Vuelo y hotel.",
          "City tour en chiva.",
          "Barú Playa Blanca.",
          "Tierra Bomba Playa Tranquila.",
          "Aeropuerto y regreso.",
        ],
        includes: ["Todo el plan 4D/3N", "Tierra Bomba"],
        excludes: ["Castillo San Felipe", "Seguro Playa Blanca"],
        optionalTours: ["Chiva rumbera nocturna", "Tour Bahía en barco"],
      },
    ],
  },
  {
    slug: "santa-marta",
    name: "Santa Marta",
    description: "Playa Blanca y opciones de Tayrona, Playa Cristal, Taganga y Acuario.",
    packages: [
      {
        slug: "santa-marta-4d3n",
        title: "Santa Marta 4 días 3 noches",
        days: 4,
        transport: "AIR",
        departures: ["Pasto"],
        food: "Desayunos y cenas",
        hotels: ["Hotel Vadamar", "Hotel Rodadero Dorado Blue", "Hotel 3H"],
        rates: [
          { code: "vadamar", label: "Hotel Vadamar", cents: 154500000 },
          { code: "rodadero", label: "Rodadero Dorado Blue", cents: 168000000 },
          { code: "3h", label: "Hotel 3H", cents: 174500000 },
        ],
        itinerary: [
          "Vuelo y hotel.",
          "Pasadía Playa Blanca.",
          "Día libre de tours opcionales.",
          "Aeropuerto y regreso.",
        ],
        includes: ["Tiquete", "Traslados", "Desayunos y cenas", "Playa Blanca", "Asistencia médica"],
        excludes: ["Tours opcionales", "Gastos no especificados"],
        optionalTours: ["Parque Tayrona", "Playa Cristal", "Centro de Vida Marina", "Tirolesa"],
      },
      {
        slug: "santa-marta-5d4n",
        title: "Santa Marta 5 días 4 noches",
        days: 5,
        transport: "AIR",
        departures: ["Pasto"],
        food: "Desayunos y cenas",
        hotels: ["Hotel Vadamar", "Hotel Rodadero Dorado Blue", "Hotel 3H"],
        rates: [
          { code: "vadamar", label: "Hotel Vadamar", cents: 169500000 },
          { code: "rodadero", label: "Rodadero Dorado Blue", cents: 183000000 },
          { code: "3h", label: "Hotel 3H", cents: 189500000 },
        ],
        itinerary: ["Vuelo y hotel.", "Pasadía Playa Blanca.", "Día libre.", "Día libre.", "Aeropuerto y regreso."],
        includes: ["Todo el plan 4D/3N", "Noche adicional"],
        excludes: ["Tours opcionales"],
        optionalTours: ["Parque Tayrona", "Playa Cristal", "Centro de Vida Marina", "Tirolesa"],
      },
    ],
  },
  {
    slug: "san-andres",
    name: "San Andrés",
    description: "Vuelta a la isla, Acuario, Haynes Cay y Tour Bahía.",
    packages: [
      {
        slug: "san-andres-4d3n",
        title: "San Andrés 4 días 3 noches",
        days: 4,
        transport: "AIR",
        departures: ["Pasto"],
        food: "Según hotel",
        hotels: ["Hotel Coral Crown", "Hotel Las Américas", "Hotel Portofino", "Hotel Sea Avenue"],
        rates: [
          { code: "coral", label: "Coral Crown", cents: 162500000 },
          { code: "americas", label: "Las Américas", cents: 174500000 },
          { code: "portofino", label: "Portofino", cents: 182000000 },
          { code: "sea", label: "Sea Avenue", cents: 195000000 },
        ],
        itinerary: [
          "Vuelo y hotel.",
          "Vuelta isla y Tour Bahía.",
          "Acuario y Haynes Cay.",
          "Spratt Bight y aeropuerto.",
        ],
        includes: ["Tiquete", "Traslados", "Vuelta isla", "Acuario", "Tour Bahía", "Asistencia médica"],
        excludes: ["Tarjeta turismo", "Almuerzo Haynes Cay", "Impuesto puerto"],
        optionalTours: ["Buceo", "Parasail", "Noche blanca"],
      },
      {
        slug: "san-andres-5d4n",
        title: "San Andrés 5 días 4 noches",
        days: 5,
        transport: "AIR",
        departures: ["Pasto"],
        food: "Según hotel",
        hotels: ["Hotel Coral Crown", "Hotel Las Américas", "Hotel Portofino", "Hotel Sea Avenue"],
        rates: [
          { code: "coral", label: "Coral Crown", cents: 182500000 },
          { code: "americas", label: "Las Américas", cents: 194500000 },
          { code: "portofino", label: "Portofino", cents: 202000000 },
          { code: "sea", label: "Sea Avenue", cents: 215000000 },
        ],
        itinerary: [
          "Vuelo y hotel.",
          "Vuelta isla y Tour Bahía.",
          "Acuario y Haynes Cay.",
          "Día libre Spratt Bight.",
          "Aeropuerto y regreso.",
        ],
        includes: ["Todo el plan 4D/3N", "Noche adicional"],
        excludes: ["Tarjeta turismo", "Almuerzo Haynes Cay", "Impuesto puerto"],
        optionalTours: ["Buceo", "Parasail", "Noche blanca"],
      },
    ],
  },
];

export type ImportReport = {
  destinations: number;
  packages: number;
  hotels: number;
  rates: number;
  warnings: string[];
  dryRun: boolean;
};
@Injectable()
export class PortfolioImportService {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  preview(): ImportReport {
    return {
      destinations: D.length,
      packages: D.flatMap((d) => d.packages).length,
      hotels: new Set(D.flatMap((d) => d.packages.flatMap((p) => p.hotels.map((h) => `${d.slug}/${h}`)))).size,
      rates: D.flatMap((d) => d.packages.flatMap((p) => p.rates)).length,
      warnings: D.flatMap((d) => d.packages.flatMap((p) => (p.warning ? [`${p.title}: ${p.warning}`] : []))),
      dryRun: true,
    };
  }
  async import(actorId: string): Promise<ImportReport> {
    const client = await this.db.client();
    const report = this.preview();
    await client.$transaction(async (tx) => {
      for (const d of D) {
        const destination = await tx.destination.upsert({
          where: { slug: d.slug },
          update: {},
          create: {
            slug: d.slug,
            name: d.name,
            country: "Colombia",
            category: "NACIONAL",
            description: d.description,
            status: "DRAFT",
          },
        });
        const hotels = new Map<string, string>();
        for (const h of [...new Set(d.packages.flatMap((p) => p.hotels))]) {
          const slug = `${d.slug}-${h
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}`;
          const hotel = await tx.hotel.upsert({
            where: { slug },
            update: {},
            create: { destinationId: destination.id, slug, name: h, status: "DRAFT" },
          });
          hotels.set(h, hotel.id);
        }
        for (const p of d.packages) {
          const pkg = await tx.tourPackage.upsert({
            where: { slug: p.slug },
            update: {},
            create: {
              destinationId: destination.id,
              slug: p.slug,
              title: p.title,
              summary: d.description,
              durationDays: p.days,
              currency: "COP",
              includes: p.includes,
              excludes: [...p.excludes, `Alimentación: ${p.food}`],
              status: "DRAFT",
              isFictitious: true,
            },
          });
          for (const [index, description] of p.itinerary.entries())
            await tx.itineraryDay.upsert({
              where: { packageId_day: { packageId: pkg.id, day: index + 1 } },
              update: {},
              create: { packageId: pkg.id, day: index + 1, title: `Día ${index + 1}`, description },
            });
          const transport = await tx.transportOption.upsert({
            where: {
              destinationId_mode_name: {
                destinationId: destination.id,
                mode: p.transport,
                name: `${p.transport === "AIR" ? "Aéreo" : "Terrestre"} portafolio`,
              },
            },
            update: {},
            create: {
              destinationId: destination.id,
              mode: p.transport,
              name: `${p.transport === "AIR" ? "Aéreo" : "Terrestre"} portafolio`,
              description: `Salidas: ${p.departures.join(", ")}`,
              conditions:
                p.transport === "AIR"
                  ? "Equipaje de mano según portafolio; verificar disponibilidad."
                  : "Condiciones de bus según portafolio.",
            },
          });
          if (!(await tx.packageComponent.findFirst({ where: { packageId: pkg.id, transportOptionId: transport.id } })))
            await tx.packageComponent.create({
              data: { packageId: pkg.id, type: "TRANSPORT", included: true, transportOptionId: transport.id },
            });
          for (const hotelId of hotels.values())
            if (!(await tx.packageComponent.findFirst({ where: { packageId: pkg.id, hotelId } })))
              await tx.packageComponent.create({ data: { packageId: pkg.id, type: "HOTEL", included: true, hotelId } });
          for (const tourName of p.optionalTours) {
            const slug = `${p.slug}-${tourName
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")}`;
            const tour = await tx.tour.upsert({
              where: { slug },
              update: {},
              create: { destinationId: destination.id, slug, name: tourName, status: "DRAFT" },
            });
            if (!(await tx.packageComponent.findFirst({ where: { packageId: pkg.id, tourId: tour.id } })))
              await tx.packageComponent.create({
                data: { packageId: pkg.id, type: "TOUR", included: false, tourId: tour.id },
              });
          }
          for (const r of p.rates) {
            const name = `portfolio-2026:${p.slug}:${r.code}`;
            if (!(await tx.priceRule.findFirst({ where: { name, packageId: pkg.id } })))
              await tx.priceRule.create({
                data: {
                  name,
                  ruleSetVersion: "portfolio-2026-draft",
                  unit: "PER_PERSON",
                  amountCents: BigInt(r.cents),
                  currency: "COP",
                  packageId: pkg.id,
                  active: false,
                  isFictitious: true,
                  conditions: {
                    source: "Portafolio_Ricaurte_Tours.docx",
                    label: r.label,
                    pendingCommercialApproval: true,
                  },
                },
              });
          }
        }
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: "catalog.portfolio_imported",
          entity: "portfolio",
          entityId: "portafolio-2026",
          details: { ...report, source: "docs/input/Portafolio_Ricaurte_Tours.docx" },
        },
      });
    });
    return { ...report, dryRun: false };
  }
}
