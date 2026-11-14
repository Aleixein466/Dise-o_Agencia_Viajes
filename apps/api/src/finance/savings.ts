export type InstallmentRow = { sequence: number; dueOn: Date; amountCents: bigint };
export type InstallmentStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE";

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/** Applies the plan's ledger total to installments in sequence order. Pure: no I/O, no clock beyond `today`. */
export function allocateInstallments(rows: InstallmentRow[], paidCents: bigint, today: Date) {
  let remaining = paidCents > 0n ? paidCents : 0n;
  const todayIso = isoDay(today);
  const items = [...rows]
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => {
      const paid = remaining >= row.amountCents ? row.amountCents : remaining;
      remaining -= paid;
      const status: InstallmentStatus =
        paid >= row.amountCents ? "PAID" : isoDay(row.dueOn) < todayIso ? "OVERDUE" : paid > 0n ? "PARTIAL" : "PENDING";
      return {
        sequence: row.sequence,
        dueOn: isoDay(row.dueOn),
        amountCents: row.amountCents.toString(),
        paidCents: paid.toString(),
        status,
      };
    });
  const next = items.find((item) => item.status !== "PAID");
  return {
    installments: items,
    nextDue: next ? { sequence: next.sequence, dueOn: next.dueOn, amountCents: next.amountCents } : null,
  };
}

/** Validates a proposed schedule: 1..60 rows, strictly increasing dates from today, positive amounts summing to goal. */
export function validateSchedule(
  rows: Array<{ dueOn: string; amountCents: bigint }>,
  goalCents: bigint,
  today: Date,
): string | null {
  if (rows.length < 1 || rows.length > 60) return "El plan debe tener entre 1 y 60 cuotas";
  if (goalCents <= 0n) return "La meta debe ser mayor que cero";
  const todayIso = isoDay(today);
  let previous = "";
  let sum = 0n;
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dueOn) || Number.isNaN(Date.parse(`${row.dueOn}T00:00:00Z`)))
      return "Fecha de cuota inválida";
    if (row.dueOn < todayIso) return "Las cuotas no pueden vencer en el pasado";
    if (row.dueOn <= previous) return "Las fechas de las cuotas deben ser crecientes";
    if (row.amountCents <= 0n) return "Cada cuota debe ser mayor que cero";
    previous = row.dueOn;
    sum += row.amountCents;
  }
  return sum === goalCents ? null : "La suma de las cuotas debe ser igual a la meta";
}
