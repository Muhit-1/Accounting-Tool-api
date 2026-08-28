// Renders the invoice HTML matching the sample template
// (Assest and doc/invoice_ec ample.pdf): logo/business info top-left,
// "Invoice" + number + balance due top-right, Bill To + dates row,
// line-item table, totals, payment details and terms in the footer.

export interface InvoiceHtmlItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceHtmlData {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    contactEmail: string | null;
    website: string | null;
    currency: string;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankRoutingNumber: string | null;
    bankSwiftCode: string | null;
    bankBranch: string | null;
    defaultTerms: string | null;
  };
  client: {
    name: string;
    address: string;
  };
  invoice: {
    number: string;
    issueDate: Date;
    terms: string;
    dueDate: Date;
    subTotal: number;
    total: number;
  };
  items: InvoiceHtmlItem[];
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

function multiline(text: string): string {
  return escapeHtml(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('<br>');
}

export function renderInvoiceHtml(data: InvoiceHtmlData): string {
  const { business, client, invoice, items } = data;
  const currency = business.currency;

  const paymentDetailsRows = [
    ['A/c name', business.bankAccountName],
    ['A/c no', business.bankAccountNumber],
    ['Routing Number', business.bankRoutingNumber],
    ['Swift Code', business.bankSwiftCode],
    ['Branch', business.bankBranch],
  ].filter(([, value]) => Boolean(value));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    padding: 40px 48px;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { max-height: 70px; max-width: 220px; margin-bottom: 10px; }
  .sender-name { font-weight: 700; font-size: 14px; margin-top: 4px; }
  .sender-details { color: #444; line-height: 1.5; margin-top: 2px; }
  .invoice-title { font-size: 32px; font-weight: 300; text-align: right; }
  .invoice-number { text-align: right; color: #444; margin-top: 2px; }
  .balance-due-label { text-align: right; margin-top: 18px; font-weight: 600; }
  .balance-due-amount { text-align: right; font-size: 18px; font-weight: 700; }

  .meta-row { display: flex; justify-content: space-between; margin-top: 40px; }
  .bill-to-label { color: #444; }
  .bill-to-name { font-weight: 700; margin-top: 4px; }
  .bill-to-address { color: #444; line-height: 1.5; margin-top: 2px; }
  .dates td { padding: 2px 0 2px 24px; text-align: right; }
  .dates td.label { color: #444; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 28px; }
  table.items thead tr { background: #2d2d2d; color: #fff; }
  table.items th, table.items td { padding: 10px 8px; text-align: left; }
  table.items th.num, table.items td.num { text-align: right; }
  table.items tbody tr { border-bottom: 1px solid #e0e0e0; }

  .totals { width: 100%; margin-top: 4px; }
  .totals td { padding: 6px 8px; text-align: right; }
  .totals tr.total td { font-weight: 700; border-top: 1px solid #ccc; }
  .totals tr.balance td { background: #f0f0f0; font-weight: 700; }

  .footer { margin-top: 60px; }
  .footer h4 { margin: 18px 0 6px; }
  .footer p { margin: 2px 0; color: #333; }
</style>
</head>
<body>
  <div class="header">
    <div>
      ${business.logoUrl ? `<img class="logo" src="${escapeHtml(business.logoUrl)}">` : ''}
      <div class="sender-name">${escapeHtml(business.name)}</div>
      <div class="sender-details">
        ${business.address ? multiline(business.address) + '<br>' : ''}
        ${business.contactEmail ? escapeHtml(business.contactEmail) + '<br>' : ''}
        ${business.website ? escapeHtml(business.website) : ''}
      </div>
    </div>
    <div>
      <div class="invoice-title">Invoice</div>
      <div class="invoice-number"># ${escapeHtml(invoice.number)}</div>
      <div class="balance-due-label">Balance Due</div>
      <div class="balance-due-amount">${formatMoney(invoice.total, currency)}</div>
    </div>
  </div>

  <div class="meta-row">
    <div>
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-name">${escapeHtml(client.name)}</div>
      <div class="bill-to-address">${multiline(client.address)}</div>
    </div>
    <table class="dates">
      <tr><td class="label">Invoice Date :</td><td>${formatDate(invoice.issueDate)}</td></tr>
      <tr><td class="label">Terms :</td><td>${escapeHtml(invoice.terms)}</td></tr>
      <tr><td class="label">Due Date :</td><td>${formatDate(invoice.dueDate)}</td></tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${multiline(item.description)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatMoney(item.rate, currency)}</td>
        <td class="num">${formatMoney(item.amount, currency)}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Sub Total</td><td style="width:140px">${formatMoney(invoice.subTotal, currency)}</td></tr>
    <tr class="total"><td>Total</td><td>${formatMoney(invoice.total, currency)}</td></tr>
    <tr class="balance"><td>Balance Due</td><td>${formatMoney(invoice.total, currency)}</td></tr>
  </table>

  <div class="footer">
    <p>Thanks for your business.</p>
    ${
      paymentDetailsRows.length
        ? `<h4>Payment Details:</h4>${paymentDetailsRows.map(([label, value]) => `<p>${label}: ${escapeHtml(String(value))}</p>`).join('')}`
        : ''
    }
    ${business.defaultTerms ? `<h4>Terms &amp; Conditions</h4><p>${multiline(business.defaultTerms)}</p>` : ''}
  </div>
</body>
</html>`;
}
