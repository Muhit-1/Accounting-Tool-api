const API = 'http://localhost:3000';
const EMAIL = 'design-review@example.com';
const PASSWORD = 'password123';

async function req(path, options = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

function iso(monthsAgoFromSep, day) {
  // "today" is 2026-09-12; monthsAgo counts back from September (0 = Sep).
  const month = 9 - monthsAgoFromSep;
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function getOrCreateBusiness(token, name, currency) {
  const existing = await req('/businesses', {}, token);
  const found = existing.find((b) => b.name === name);
  if (found) return found;
  return req('/businesses', { method: 'POST', body: JSON.stringify({ name, currency }) }, token);
}

async function seedBusiness(token, { name, currency, monthly, client, invoices }) {
  const business = await getOrCreateBusiness(token, name, currency);
  const accounts = await req(`/businesses/${business.id}/accounts`, {}, token);
  const accountId = accounts[0].id;

  const existingCategories = await req(`/businesses/${business.id}/categories`, {}, token);
  const categoryIds = Object.fromEntries(existingCategories.map((c) => [c.name, c.id]));
  for (const [catName, type] of [
    ['Sales', 'INCOME'],
    ['Materials', 'EXPENSE'],
    ['Software', 'EXPENSE'],
    ['Rent', 'EXPENSE'],
  ]) {
    if (categoryIds[catName]) continue;
    const category = await req(
      `/businesses/${business.id}/categories`,
      { method: 'POST', body: JSON.stringify({ name: catName, type }) },
      token,
    );
    categoryIds[catName] = category.id;
  }

  for (const entry of monthly) {
    for (const line of entry.lines) {
      await req(
        `/businesses/${business.id}/transactions`,
        {
          method: 'POST',
          body: JSON.stringify({
            accountId,
            date: iso(entry.monthsAgo, entry.day),
            amount: line.amount,
            type: line.type,
            categoryId: categoryIds[line.category],
            counterparty: line.counterparty,
          }),
        },
        token,
      );
    }
  }

  const existingClients = await req(`/businesses/${business.id}/clients`, {}, token);
  const clientRecord =
    existingClients.find((c) => c.name === client.name) ??
    (await req(`/businesses/${business.id}/clients`, { method: 'POST', body: JSON.stringify(client) }, token));

  for (const inv of invoices) {
    const created = await req(
      `/businesses/${business.id}/invoices`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientId: clientRecord.id,
          issueDate: iso(inv.monthsAgo, inv.day),
          terms: 'Net 30',
          dueDate: iso(inv.monthsAgo, Math.min(inv.day + 20, 28)),
          items: inv.items,
        }),
      },
      token,
    );
    if (inv.status !== 'DRAFT') {
      await req(`/businesses/${business.id}/invoices/${created.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: inv.status }) }, token);
    }
  }

  console.log(`Seeded ${name}: ${monthly.reduce((n, e) => n + e.lines.length, 0)} transactions, ${invoices.length} invoices.`);
}

async function main() {
  const { accessToken } = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });

  await seedBusiness(accessToken, {
    name: 'ShopnoJhuri',
    currency: 'BDT',
    monthly: [
      { monthsAgo: 5, day: 10, lines: [{ type: 'INCOME', amount: 12000, category: 'Sales', counterparty: 'Storefront' }, { type: 'EXPENSE', amount: 3000, category: 'Rent', counterparty: 'Landlord' }] },
      { monthsAgo: 4, day: 12, lines: [{ type: 'INCOME', amount: 18000, category: 'Sales', counterparty: 'Storefront' }, { type: 'EXPENSE', amount: 4000, category: 'Materials', counterparty: 'Wholesale supplier' }] },
      { monthsAgo: 3, day: 8, lines: [{ type: 'INCOME', amount: 9000, category: 'Sales', counterparty: 'Storefront' }, { type: 'EXPENSE', amount: 3000, category: 'Rent', counterparty: 'Landlord' }] },
      { monthsAgo: 2, day: 15, lines: [{ type: 'INCOME', amount: 21000, category: 'Sales', counterparty: 'Storefront' }, { type: 'EXPENSE', amount: 6000, category: 'Materials', counterparty: 'Wholesale supplier' }, { type: 'EXPENSE', amount: 1200, category: 'Software', counterparty: 'POS system' }] },
      { monthsAgo: 1, day: 10, lines: [{ type: 'INCOME', amount: 15000, category: 'Sales', counterparty: 'Storefront' }, { type: 'EXPENSE', amount: 3000, category: 'Rent', counterparty: 'Landlord' }] },
      { monthsAgo: 0, day: 2, lines: [{ type: 'EXPENSE', amount: 3000, category: 'Materials', counterparty: 'Wholesale supplier' }] },
    ],
    client: { name: 'Local Traders Ltd', address: 'House 12, Road 5, Dhanmondi, Dhaka', email: 'orders@localtraders.example' },
    invoices: [
      { monthsAgo: 4, day: 15, status: 'PAID', items: [{ description: 'Retail consignment — batch 1', quantity: 20, rate: 250 }] },
      { monthsAgo: 2, day: 20, status: 'PAID', items: [{ description: 'Retail consignment — batch 2', quantity: 25, rate: 260 }] },
      { monthsAgo: 1, day: 25, status: 'SENT', items: [{ description: 'Seasonal display setup', quantity: 1, rate: 4500 }] },
      { monthsAgo: 0, day: 1, status: 'OVERDUE', items: [{ description: 'Retail consignment — batch 3', quantity: 15, rate: 270 }] },
      { monthsAgo: 0, day: 9, status: 'DRAFT', items: [{ description: 'Retail consignment — batch 4', quantity: 30, rate: 255 }] },
    ],
  });

  await seedBusiness(accessToken, {
    name: 'RR Aesthetic',
    currency: 'BDT',
    monthly: [
      { monthsAgo: 5, day: 8, lines: [{ type: 'INCOME', amount: 8000, category: 'Sales', counterparty: 'Glow Studio' }, { type: 'EXPENSE', amount: 5000, category: 'Materials', counterparty: 'Beauty Supplies Co' }] },
      { monthsAgo: 4, day: 10, lines: [{ type: 'INCOME', amount: 10000, category: 'Sales', counterparty: 'Glow Studio' }, { type: 'EXPENSE', amount: 2500, category: 'Rent', counterparty: 'Landlord' }] },
      { monthsAgo: 3, day: 6, lines: [{ type: 'INCOME', amount: 7000, category: 'Sales', counterparty: 'Walk-in clients' }, { type: 'EXPENSE', amount: 3000, category: 'Materials', counterparty: 'Beauty Supplies Co' }] },
      { monthsAgo: 2, day: 14, lines: [{ type: 'INCOME', amount: 13000, category: 'Sales', counterparty: 'Glow Studio' }, { type: 'EXPENSE', amount: 800, category: 'Software', counterparty: 'Booking app' }] },
      { monthsAgo: 1, day: 9, lines: [{ type: 'INCOME', amount: 9500, category: 'Sales', counterparty: 'Walk-in clients' }, { type: 'EXPENSE', amount: 2500, category: 'Rent', counterparty: 'Landlord' }] },
      { monthsAgo: 0, day: 3, lines: [{ type: 'INCOME', amount: 11000, category: 'Sales', counterparty: 'Glow Studio' }, { type: 'EXPENSE', amount: 4000, category: 'Materials', counterparty: 'Beauty Supplies Co' }] },
    ],
    client: { name: 'Glow Studio', address: 'House 22, Road 9, Banani, Dhaka', email: 'accounts@glowstudio.example' },
    invoices: [
      { monthsAgo: 4, day: 12, status: 'PAID', items: [{ description: 'Facial treatment package', quantity: 4, rate: 1500 }] },
      { monthsAgo: 2, day: 18, status: 'PAID', items: [{ description: 'Skincare consultation', quantity: 2, rate: 2000 }] },
      { monthsAgo: 1, day: 20, status: 'SENT', items: [{ description: 'Salon supplies resale', quantity: 10, rate: 350 }] },
      { monthsAgo: 0, day: 2, status: 'OVERDUE', items: [{ description: 'Monthly maintenance contract', quantity: 1, rate: 6000 }] },
      { monthsAgo: 0, day: 8, status: 'DRAFT', items: [{ description: 'Event styling package', quantity: 1, rate: 8500 }] },
    ],
  });

  await seedBusiness(accessToken, {
    name: 'Samtrek',
    currency: 'EUR',
    monthly: [
      { monthsAgo: 5, day: 5, lines: [{ type: 'INCOME', amount: 2200, category: 'Sales', counterparty: 'Nordic Retail GmbH' }, { type: 'EXPENSE', amount: 300, category: 'Software', counterparty: 'Hosting provider' }] },
      { monthsAgo: 4, day: 7, lines: [{ type: 'INCOME', amount: 3100, category: 'Sales', counterparty: 'Nordic Retail GmbH' }, { type: 'EXPENSE', amount: 600, category: 'Rent', counterparty: 'Coworking space' }] },
      { monthsAgo: 3, day: 9, lines: [{ type: 'INCOME', amount: 1800, category: 'Sales', counterparty: 'Baltic Traders' }, { type: 'EXPENSE', amount: 200, category: 'Software', counterparty: 'Hosting provider' }] },
      { monthsAgo: 2, day: 11, lines: [{ type: 'INCOME', amount: 4000, category: 'Sales', counterparty: 'Nordic Retail GmbH' }, { type: 'EXPENSE', amount: 500, category: 'Materials', counterparty: 'Packaging Co' }] },
      { monthsAgo: 1, day: 13, lines: [{ type: 'INCOME', amount: 2600, category: 'Sales', counterparty: 'Baltic Traders' }, { type: 'EXPENSE', amount: 600, category: 'Rent', counterparty: 'Coworking space' }] },
      { monthsAgo: 0, day: 4, lines: [{ type: 'INCOME', amount: 3400, category: 'Sales', counterparty: 'Nordic Retail GmbH' }, { type: 'EXPENSE', amount: 400, category: 'Software', counterparty: 'Analytics tool' }] },
    ],
    client: { name: 'Nordic Retail GmbH', address: 'Sveavägen 12, 111 57 Stockholm, Sweden', email: 'ap@nordicretail.example' },
    invoices: [
      { monthsAgo: 4, day: 15, status: 'PAID', items: [{ description: 'Wholesale order — batch 1', quantity: 50, rate: 40 }] },
      { monthsAgo: 2, day: 22, status: 'PAID', items: [{ description: 'Wholesale order — batch 2', quantity: 60, rate: 42 }] },
      { monthsAgo: 1, day: 25, status: 'SENT', items: [{ description: 'Custom packaging run', quantity: 1, rate: 950 }] },
      { monthsAgo: 0, day: 6, status: 'DRAFT', items: [{ description: 'Wholesale order — batch 3', quantity: 55, rate: 45 }] },
    ],
  });

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
