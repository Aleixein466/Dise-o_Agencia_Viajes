const CENTS_PATTERN = /^-?\d+$/;

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Formats a decimal string of cents as COP pesos using BigInt only (never Number for money). */
export function formatCop(cents: string | null | undefined): string | null {
  if (typeof cents !== "string" || !CENTS_PATTERN.test(cents)) return null;
  const value = BigInt(cents);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const pesos = (abs + BigInt(50)) / BigInt(100);
  return copFormatter.format(negative ? -pesos : pesos);
}
