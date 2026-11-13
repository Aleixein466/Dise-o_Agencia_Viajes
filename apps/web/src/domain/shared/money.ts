export type Cents = number;
export function assertCents(n: number): asserts n is Cents {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("Amount must be a non-negative safe integer in cents");
}
