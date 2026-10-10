// Amounts are stored with two decimals (Decimal(14,2)) but travel through the
// services as JS numbers, where 0.1 + 0.2 is 0.30000000000000004 and the error
// compounds over a long ledger. Adding in whole cents keeps every intermediate
// figure an exact two-decimal value, so totals and running balances never drift.
export function toCents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

export function addMoney(a: number, b: number): number {
  return (toCents(a) + toCents(b)) / 100;
}

export function subMoney(a: number, b: number): number {
  return (toCents(a) - toCents(b)) / 100;
}
