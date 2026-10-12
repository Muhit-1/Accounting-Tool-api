// The "Amount type" choice on the entry form. The owner picks a type and fills
// named boxes; the server recomputes the amount from them. There is no formula
// text anywhere: a fixed set of types, each with fixed arithmetic. Keep this in
// step with accounting-web/src/lib/calc.ts (same cases are tested on both).
export const AMOUNT_TYPES = ['FIXED', 'SUM', 'MULTIPLY', 'RATE_MONTHS', 'SPLIT', 'PERCENT', 'AVERAGE'] as const;
export type AmountType = (typeof AMOUNT_TYPES)[number];

export const MAX_AMOUNT_INPUTS = 10;
export const MAX_INPUT_ABS = 1_000_000_000;
// Same ceiling the plain Amount box has (CreateTransactionDto), well inside Decimal(14,2).
export const MAX_AMOUNT = 9_999_999_999;

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalcError';
  }
}

// SUM / AVERAGE take a list; the others take exactly two named boxes.
const LIST_TYPES: ReadonlySet<string> = new Set(['SUM', 'AVERAGE']);

export function isAmountType(value: unknown): value is AmountType {
  return typeof value === 'string' && (AMOUNT_TYPES as readonly string[]).includes(value);
}

// Whole-cent rounding, half up. Plain `Math.round(x * 100)` (what money.ts's
// toCents does) turns 2.5 x 3.33 = 8.325 into 8.32 because 8.325 has no exact
// binary form; here 12 significant digits (every valid result is at most 12)
// clears that noise first, and the "e2" shift is done on the decimal text.
function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return value;
  const clean = String(Number(value.toPrecision(12)));
  if (clean.includes('e')) return Math.round(value * 100) / 100;
  return Math.round(Number(`${clean}e2`)) / 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assertInputs(type: AmountType, inputs: unknown): number[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new CalcError('Fill in the boxes to calculate the amount.');
  }
  if (inputs.length > MAX_AMOUNT_INPUTS) {
    throw new CalcError(`Use at most ${MAX_AMOUNT_INPUTS} numbers.`);
  }
  for (const value of inputs) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CalcError('Every box must be a number.');
    }
    if (Math.abs(value) > MAX_INPUT_ABS) {
      throw new CalcError('One of the numbers is too big.');
    }
  }
  const count = inputs.length;
  if (type === 'FIXED' && count !== 1) {
    throw new CalcError('A fixed amount has one number.');
  }
  if (LIST_TYPES.has(type) && count < 2) {
    throw new CalcError('Enter at least two numbers.');
  }
  if (!LIST_TYPES.has(type) && type !== 'FIXED' && count !== 2) {
    throw new CalcError('Fill in both boxes.');
  }
  return inputs as number[];
}

// Returns the amount in whole cents-rounded form (e.g. 5000, 33.33). Throws
// CalcError, with a plain-words message, for anything that cannot be saved.
export function computeAmount(type: string, inputs: unknown): number {
  if (!isAmountType(type)) {
    throw new CalcError('Unknown amount type.');
  }
  const values = assertInputs(type, inputs);
  const [a, b] = values;

  let raw: number;
  switch (type) {
    case 'FIXED':
      raw = a;
      break;
    case 'SUM':
      raw = sum(values);
      break;
    case 'AVERAGE':
      raw = sum(values) / values.length;
      break;
    case 'MULTIPLY':
    case 'RATE_MONTHS':
      raw = a * b;
      break;
    case 'SPLIT':
      if (b === 0) {
        throw new CalcError("Number of people can't be 0.");
      }
      raw = a / b;
      break;
    case 'PERCENT':
      raw = (a * b) / 100;
      break;
  }

  const result = roundToCents(raw);
  if (!Number.isFinite(result) || result <= 0) {
    throw new CalcError('The amount must be more than 0.');
  }
  if (result > MAX_AMOUNT) {
    throw new CalcError('The amount is too big.');
  }
  return result;
}
