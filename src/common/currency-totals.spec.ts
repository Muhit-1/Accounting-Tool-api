import { totalsByCurrency } from './currency-totals.js';

describe('totalsByCurrency', () => {
  it('keeps different currencies apart instead of adding them together', () => {
    const result = totalsByCurrency([
      { currency: 'BDT', totalIncome: 1000, totalExpense: 400, balance: 600 },
      { currency: 'EUR', totalIncome: 50, totalExpense: 10, balance: 40 },
    ]);

    expect(result).toEqual([
      { currency: 'BDT', totalIncome: 1000, totalExpense: 400, balance: 600 },
      { currency: 'EUR', totalIncome: 50, totalExpense: 10, balance: 40 },
    ]);
  });

  it('sums businesses that share a currency, in order of first appearance', () => {
    const result = totalsByCurrency([
      { currency: 'USD', totalIncome: 10, totalExpense: 1, balance: 9 },
      { currency: 'BDT', totalIncome: 100, totalExpense: 0, balance: 100 },
      { currency: 'USD', totalIncome: 5, totalExpense: 2, balance: 3 },
    ]);

    expect(result.map((r) => r.currency)).toEqual(['USD', 'BDT']);
    expect(result[0]).toEqual({ currency: 'USD', totalIncome: 15, totalExpense: 3, balance: 12 });
  });

  it('rounds away floating-point drift', () => {
    const result = totalsByCurrency([
      { currency: 'BDT', totalIncome: 0.1, totalExpense: 0, balance: 0.1 },
      { currency: 'BDT', totalIncome: 0.2, totalExpense: 0, balance: 0.2 },
    ]);

    expect(result[0].totalIncome).toBe(0.3);
  });

  it('returns nothing for no businesses', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});
