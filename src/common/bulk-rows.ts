import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

// One problem in one row of a bulk request (paste / import).
export interface RowError {
  index: number; // 0-based position in the request
  field: string;
  message: string;
}

function flatten(errors: ValidationError[], index: number, prefix = ''): RowError[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.children?.length) return flatten(error.children, index, field);
    const [message] = Object.values(error.constraints ?? {});
    return [{ index, field, message: message ?? 'is not valid' }];
  });
}

// Checks one raw row with the validators of `type` (the same ones a single
// new record uses). Returns the typed row, or the list of its problems, so a
// bulk request can report every bad row with its own position.
export async function validateBulkRow<T extends object>(
  type: ClassConstructor<T>,
  raw: unknown,
  index: number,
): Promise<{ row: T } | { errors: RowError[] }> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: [{ index, field: 'row', message: 'must be an object' }] };
  }
  const row = plainToInstance(type, raw);
  const problems = await validate(row, { whitelist: true, forbidNonWhitelisted: true });
  return problems.length > 0 ? { errors: flatten(problems, index) } : { row };
}
