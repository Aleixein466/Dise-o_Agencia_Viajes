export const TARIFF_TABS = [
  { key: "reglas", label: "Reglas de precio" },
  { key: "temporadas", label: "Temporadas" },
  { key: "edades", label: "Edades" },
  { key: "promociones", label: "Promociones" },
] as const;

export type TariffTab = (typeof TARIFF_TABS)[number]["key"];

/** ?tab= value (possibly repeated or unknown) -> a valid tab; defaults to the price rules. */
export function resolveTab(value: string | string[] | undefined): TariffTab {
  const first = Array.isArray(value) ? value[0] : value;
  return TARIFF_TABS.find((tab) => tab.key === first)?.key ?? "reglas";
}
