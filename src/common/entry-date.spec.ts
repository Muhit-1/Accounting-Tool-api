import { BadRequestException } from '@nestjs/common';
import { assertPlausibleEntryDate } from './entry-date.js';

const NOW = new Date('2026-10-11T12:00:00Z');

describe('assertPlausibleEntryDate', () => {
  it('accepts past dates and today', () => {
    expect(assertPlausibleEntryDate('2026-10-11', NOW)).toEqual(new Date('2026-10-11'));
    expect(assertPlausibleEntryDate('2026-01-01', NOW)).toEqual(new Date('2026-01-01'));
  });

  it("accepts tomorrow's date, because the server's UTC day can lag the owner's", () => {
    expect(() => assertPlausibleEntryDate('2026-10-12', NOW)).not.toThrow();
  });

  it('rejects dates further in the future', () => {
    expect(() => assertPlausibleEntryDate('2026-10-14', NOW)).toThrow(BadRequestException);
    expect(() => assertPlausibleEntryDate('2062-01-01', NOW)).toThrow(BadRequestException);
  });

  it('rejects dates before 2000 and unparseable input', () => {
    expect(() => assertPlausibleEntryDate('1999-12-31', NOW)).toThrow(BadRequestException);
    expect(() => assertPlausibleEntryDate('not-a-date', NOW)).toThrow(BadRequestException);
  });
});
