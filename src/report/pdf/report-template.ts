// Renders a report as HTML for Puppeteer to turn into a PDF — mirrors
// invoice-template.ts's approach. A single-business report is just one
// "section"; the combined report is the same layout repeated per business.

export interface ReportPdfTransaction {
  date: Date;
  memo: string | null;
  counterparty: string | null;
  categoryName: string | null;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
}

export interface ReportPdfCategoryRow {
  categoryName: string;
  type: 'INCOME' | 'EXPENSE';
  total: number;
}

export interface ReportPdfSection {
  businessName: string;
  currency: string;
  accountName?: string | null;
  totals: { totalIncome: number; totalExpense: number; balance: number };
  byCategory: ReportPdfCategoryRow[];
  transactions: ReportPdfTransaction[];
}

export interface ReportPdfData {
  title: string;
  periodLabel: string;
  sections: ReportPdfSection[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function renderSection(section: ReportPdfSection): string {
  const { businessName, currency, accountName, totals, byCategory, transactions } = section;
  return `
  <div class="section">
    <h2>${escapeHtml(businessName)}${accountName ? ` — ${escapeHtml(accountName)}` : ''}</h2>

    <table class="totals">
      <tr><td>Total income</td><td class="num income">${formatMoney(totals.totalIncome, currency)}</td></tr>
      <tr><td>Total expense</td><td class="num expense">${formatMoney(totals.totalExpense, currency)}</td></tr>
      <tr class="balance"><td>Balance</td><td class="num">${formatMoney(totals.balance, currency)}</td></tr>
    </table>

    ${
      byCategory.length > 0
        ? `<h3>By category</h3>
    <table class="items">
      <thead><tr><th>Category</th><th>Type</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${byCategory
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.categoryName)}</td>
          <td>${row.type === 'INCOME' ? 'Income' : 'Expense'}</td>
          <td class="num ${row.type === 'INCOME' ? 'income' : 'expense'}">${formatMoney(row.total, currency)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }

    ${
      transactions.length > 0
        ? `<h3>Entries</h3>
    <table class="items">
      <thead><tr><th>Date</th><th>Entry</th><th>Category</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${transactions
          .map(
            (tx) => `<tr>
          <td>${formatDate(tx.date)}</td>
          <td>${escapeHtml(tx.memo || tx.categoryName || '—')}${tx.counterparty ? ` <span class="muted">(${tx.type === 'INCOME' ? 'from' : 'to'} ${escapeHtml(tx.counterparty)})</span>` : ''}</td>
          <td>${tx.categoryName ? escapeHtml(tx.categoryName) : ''}</td>
          <td class="num ${tx.type === 'INCOME' ? 'income' : 'expense'}">${tx.type === 'INCOME' ? '+' : '−'}${formatMoney(tx.amount, currency)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
        : '<p class="muted">No entries in this period.</p>'
    }
  </div>`;
}

export function renderReportHtml(data: ReportPdfData): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 12px; padding: 40px 48px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
  .period { color: #444; margin: 0 0 24px; }
  .section { margin-bottom: 36px; page-break-inside: avoid; }
  .section h2 { font-size: 16px; border-bottom: 2px solid #2d2d2d; padding-bottom: 6px; margin-bottom: 12px; }
  .section h3 { font-size: 13px; margin: 18px 0 6px; }
  table.totals { width: 260px; border-collapse: collapse; }
  table.totals td { padding: 3px 0; }
  table.totals tr.balance td { font-weight: 700; border-top: 1px solid #ccc; padding-top: 6px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead tr { background: #2d2d2d; color: #fff; }
  table.items th, table.items td { padding: 7px 8px; text-align: left; }
  table.items th.num, table.items td.num { text-align: right; }
  table.items tbody tr { border-bottom: 1px solid #e0e0e0; }
  .num.income { color: #1e7d3a; }
  .num.expense { color: #a3372a; }
  .muted { color: #777; font-size: 11px; }
</style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="period">${escapeHtml(data.periodLabel)}</p>
  ${data.sections.map(renderSection).join('')}
</body>
</html>`;
}
