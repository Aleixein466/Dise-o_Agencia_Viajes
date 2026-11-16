"use client";
import type { AdminSession } from "@/lib/auth/types";
import {
  bpsToPercent,
  blankPromotion,
  formatCop,
  formatInstantDate,
  promotionPayload,
  promotionValues,
  validatePromotion,
} from "./helpers";
import { RuleManager, type RuleConfig, type RuleItem } from "./rule-manager";

type Promotion = RuleItem & {
  code: string;
  description: string | null;
  discountType: string;
  percentBps: number | null;
  amountOffCents: string | null;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
  redemptionCount: number;
};

const discount = (item: Promotion) =>
  item.discountType === "PERCENT" ? `${bpsToPercent(item.percentBps)} %` : formatCop(item.amountOffCents);
const validity = (item: Promotion) => `${formatInstantDate(item.startsAt)} al ${formatInstantDate(item.endsAt)}`;

const config: RuleConfig<Promotion> = {
  kind: "promotions",
  title: "Promociones",
  singular: "promoción",
  createLabel: "Nueva promoción",
  intro:
    "Códigos que el cliente escribe en el cotizador. Una cotización acepta un solo código y el descuento se aplica una vez sobre el subtotal: no hay promociones automáticas ni acumulables.",
  columns: [
    {
      header: "Promoción",
      cell: (item) => (
        <>
          <strong>{item.code}</strong>
          <br />
          <span>{item.name}</span>
        </>
      ),
    },
    { header: "Descuento", cell: discount },
    { header: "Vigencia", cell: validity },
    {
      header: "Usos",
      cell: (item) => `${item.redemptionCount}${item.maxRedemptions == null ? "" : ` de ${item.maxRedemptions}`}`,
    },
  ],
  fields: [
    {
      name: "code",
      label: "Código",
      required: true,
      maxLength: 40,
      hint: "Letras, números, guion y guion bajo. Se guarda en mayúsculas, no se repite y no se reutiliza.",
    },
    { name: "name", label: "Nombre", required: true, maxLength: 160 },
    { name: "description", label: "Descripción", type: "textarea", maxLength: 5000, wide: true },
    {
      name: "discountType",
      label: "Tipo de descuento",
      type: "select",
      required: true,
      options: [
        { value: "PERCENT", label: "Porcentaje" },
        { value: "FIXED_AMOUNT", label: "Monto fijo (COP)" },
      ],
    },
    {
      name: "percent",
      label: "Porcentaje (%)",
      required: true,
      inputMode: "decimal",
      maxLength: 6,
      hint: "Entre 0,01 y 100. Ejemplo: 10 o 12,5.",
      visible: (values) => values.discountType === "PERCENT",
    },
    {
      name: "amount",
      label: "Monto del descuento (COP)",
      required: true,
      inputMode: "decimal",
      maxLength: 18,
      hint: "En pesos, sin símbolo. Ejemplo: 50000 o 50.000.",
      visible: (values) => values.discountType === "FIXED_AMOUNT",
    },
    { name: "startsOn", label: "Vigente desde (inclusive)", type: "date", required: true },
    { name: "endsOn", label: "Vigente hasta (inclusive)", type: "date", required: true },
    {
      name: "maxRedemptions",
      label: "Máximo de usos",
      type: "number",
      maxLength: 7,
      hint: "Opcional. Vacío = sin límite.",
    },
  ],
  blank: blankPromotion,
  toValues: promotionValues,
  validate: (values, item) => validatePromotion(values, item?.redemptionCount ?? 0),
  payload: promotionPayload,
  describe: (item) => `la promoción ${item.code} (${discount(item)}, ${validity(item)})`,
  approveImpact: (item) =>
    `Quedará visible para el público: cualquier cliente que escriba el código ${item.code} en el cotizador recibirá ${discount(item)} de descuento entre esas fechas, sin combinarse con otros códigos. Ya no se podrá editar.`,
  deactivateImpact: (item) =>
    `El código ${item.code} dejará de aplicarse de inmediato en nuevas cotizaciones. Las cotizaciones ya emitidas no cambian y el código no se podrá reutilizar.`,
  messages: {
    created: "Promoción creada como borrador.",
    updated: "Promoción guardada como borrador.",
    approved: "Promoción aprobada.",
    deactivated: "Promoción desactivada.",
  },
};

export function PromotionsManager({ session }: Readonly<{ session: AdminSession }>) {
  return <RuleManager session={session} config={config} />;
}
