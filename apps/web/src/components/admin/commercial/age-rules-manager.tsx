"use client";
import type { AdminSession } from "@/lib/auth/types";
import { CATEGORY_LABELS, ageRulePayload, ageRuleValues, blankAgeRule, validateAgeRule } from "./helpers";
import { RuleManager, type RuleConfig, type RuleItem } from "./rule-manager";

type AgeRule = RuleItem & { category: string; minValue: number | null; maxValue: number | null };

const range = (item: AgeRule) => `${item.minValue ?? "?"} a ${item.maxValue ?? "?"} años`;

const config: RuleConfig<AgeRule> = {
  kind: "age-rules",
  title: "Edades",
  singular: "banda de edad",
  createLabel: "Nueva banda de edad",
  intro:
    "Bandas de edad en años (0 a 17, inclusivas) que clasifican a los menores en el cotizador público. Dos bandas aprobadas del mismo ámbito no pueden cruzarse.",
  columns: [
    { header: "Banda", cell: (item) => <strong>{item.name}</strong> },
    { header: "Categoría", cell: (item) => CATEGORY_LABELS[item.category] ?? item.category },
    { header: "Edades", cell: range },
  ],
  fields: [
    { name: "name", label: "Nombre", required: true, maxLength: 120, wide: true },
    {
      name: "category",
      label: "Categoría",
      type: "select",
      required: true,
      options: [
        { value: "CHILD", label: "Niño" },
        { value: "INFANT", label: "Bebé" },
      ],
    },
    { name: "minValue", label: "Edad mínima (años)", type: "number", required: true, maxLength: 2 },
    { name: "maxValue", label: "Edad máxima (años)", type: "number", required: true, maxLength: 2 },
  ],
  blank: blankAgeRule,
  toValues: ageRuleValues,
  validate: validateAgeRule,
  payload: ageRulePayload,
  describe: (item) => `la banda "${item.name}" (${range(item)})`,
  approveImpact: () =>
    "Quedará vigente: el cotizador público la usará para clasificar a los menores por edad y las tarifas ligadas a ella podrán aprobarse. Ya no se podrá editar.",
  deactivateImpact: () =>
    "Dejará de usarse de inmediato en el cotizador público, y las tarifas ligadas a ella también. Las cotizaciones ya emitidas no cambian.",
  messages: {
    created: "Banda de edad creada como borrador.",
    updated: "Banda de edad guardada como borrador.",
    approved: "Banda de edad aprobada.",
    deactivated: "Banda de edad desactivada.",
  },
};

export function AgeRulesManager({ session }: Readonly<{ session: AdminSession }>) {
  return <RuleManager session={session} config={config} />;
}
