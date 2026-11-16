"use client";
import type { AdminSession } from "@/lib/auth/types";
import { blankSeason, formatDate, seasonPayload, seasonValues, validateSeason } from "./helpers";
import { RuleManager, type RuleConfig, type RuleItem } from "./rule-manager";

type Season = RuleItem & { startsOn: string; endsOn: string; notes: string | null };

const config: RuleConfig<Season> = {
  kind: "seasons",
  title: "Temporadas",
  singular: "temporada",
  createLabel: "Nueva temporada",
  intro:
    "Rangos de fechas de viaje (inclusivos) que el cotizador público usa para elegir tarifas. Dos temporadas aprobadas del mismo ámbito no pueden cruzarse.",
  columns: [
    {
      header: "Temporada",
      cell: (item) => (
        <>
          <strong>{item.name}</strong>
          {item.notes ? (
            <>
              <br />
              <span>{item.notes}</span>
            </>
          ) : null}
        </>
      ),
    },
    { header: "Fechas de viaje", cell: (item) => `${formatDate(item.startsOn)} al ${formatDate(item.endsOn)}` },
  ],
  fields: [
    { name: "name", label: "Nombre", required: true, maxLength: 120, wide: true },
    { name: "startsOn", label: "Desde (inclusive)", type: "date", required: true },
    { name: "endsOn", label: "Hasta (inclusive)", type: "date", required: true },
    { name: "notes", label: "Notas internas", type: "textarea", maxLength: 5000, wide: true },
  ],
  blank: blankSeason,
  toValues: seasonValues,
  validate: validateSeason,
  payload: seasonPayload,
  describe: (item) => `la temporada "${item.name}" (${formatDate(item.startsOn)} al ${formatDate(item.endsOn)})`,
  approveImpact: () =>
    "Quedará vigente: el cotizador público la usará para elegir las tarifas por fecha de viaje, y las tarifas ligadas a ella podrán aprobarse. Ya no se podrá editar.",
  deactivateImpact: () =>
    "Dejará de usarse de inmediato en el cotizador público, y las tarifas ligadas a ella también. Las cotizaciones ya emitidas no cambian.",
  messages: {
    created: "Temporada creada como borrador.",
    updated: "Temporada guardada como borrador.",
    approved: "Temporada aprobada.",
    deactivated: "Temporada desactivada.",
  },
};

export function SeasonsManager({ session }: Readonly<{ session: AdminSession }>) {
  return <RuleManager session={session} config={config} />;
}
