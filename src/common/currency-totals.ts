import { addMoney } from './money.js';

export interface MoneyTotals {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export interface CurrencyTotals extends MoneyTotals {
  currency: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Sums per currency and never across them: adding BDT to EUR as plain numbers
// gives a figure that means nothing, and converting would need an agreed rate
// source. Clients use this to show one total per currency (and a notice when
// there is more than one) instead of a single misleading "combined" number.
// Order follows first appearance, so the owner's first business leads.
export function totalsByCurrency(items: Array<MoneyTotals & { currency: string }>): CurrencyTotals[] {
  const groups = new Map<string, CurrencyTotals>();
  for (const item of items) {
    const group = groups.get(item.currency) ?? { currency: item.currency, totalIncome: 0, totalExpense: 0, balance: 0 };
    group.totalIncome = addMoney(group.totalIncome, item.totalIncome);
    group.totalExpense = addMoney(group.totalExpense, item.totalExpense);
    group.balance = addMoney(group.balance, item.balance);
    groups.set(item.currency, group);
  }
  return [...groups.values()].map((group) => ({
    currency: group.currency,
    totalIncome: round2(group.totalIncome),
    totalExpense: round2(group.totalExpense),
    balance: round2(group.balance),
  }));
}
