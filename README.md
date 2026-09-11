# accounting-api

Backend API for the Multi-Business Accounting Tool — a web-based bookkeeping and invoicing system for an owner who runs several small businesses from one account (SAMTrek, Vaaii, Shopnojhuri, and others). This service owns all business logic — auth, bookkeeping, invoicing, access control — and is the only thing that talks to the database. The frontend (`accounting-web`, a separate repo) talks to this API over HTTPS only.

Full project background lives in `../Assest and doc/Accounting-Tool-Project-Plan.docx`.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (ESM) |
| Framework | NestJS 12 |
| ORM / DB | Prisma 7 (pinned — `latest` on npm is currently a pre-release) + MySQL/MariaDB, via `@prisma/adapter-mariadb` |
| Auth | Stage 1: email/password (bcrypt + JWT). Stage 2 (later): adds Google OAuth |
| File storage | Stage 1: local disk. Stage 2 (later): Google Drive API |
| PDF generation | Puppeteer (headless Chromium) — invoices and date-range reports |
| Invoice scanning | `pdfjs-dist` (text extraction) + `@napi-rs/canvas` + `tesseract.js` (OCR fallback for scanned/image invoices) + `chrono-node` (date parsing) |
| Security | `helmet`, AES-256-GCM field encryption (Node `crypto`), a custom in-memory rate limiter, magic-byte file-signature checks |
| Testing | Vitest |

## Project status

All Phase 1 MVP milestones from the plan are implemented and manually + unit tested: auth, business management, categorized bookkeeping with multi-account support, invoicing with PDF generation and editing, invoice upload/scan-to-prefill, date-range reporting, cost-tracking dashboards, and sharing/access control. An API-wide security hardening pass (validation, rate limiting, encryption at rest, file-upload verification) is also in place — see "Security" below. Stage 2 (Google OAuth + Drive) and deployment are intentionally not started — see "What's not built yet" below.

## Setup

Requires a local MySQL/MariaDB server already running.

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (and JWT_SECRET — see below) in .env
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

Server listens on `http://localhost:3000` by default (`PORT` in `.env`).

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/MariaDB connection string, e.g. `mysql://root:password@localhost:3306/accounting_tool` |
| `PORT` | HTTP port (default `3000`) |
| `NODE_ENV` | `development` / `production` |
| `JWT_SECRET` | Signs login session tokens. Must be at least 32 characters — the app refuses to start otherwise. Never commit this. |
| `JWT_EXPIRES_IN` | JWT lifetime, e.g. `1d` |
| `ENCRYPTION_KEY` | Base64-encoded 32-byte key used to encrypt sensitive fields (business bank details) at rest. Must decode to exactly 32 bytes — the app refuses to start otherwise. Never commit this. |
| `INVOICE_STORAGE_DIR` | Where generated invoice PDFs are saved (Stage 1 local disk), e.g. `./storage/invoices` |
| `RECEIPT_STORAGE_DIR` | Where uploaded invoice/receipt files are saved so they can be reopened later, e.g. `./storage/receipts` |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins, e.g. `http://localhost:5173` |
| `PUPPETEER_CACHE_DIR` | Only needed if Puppeteer's Chromium was installed to a non-default cache directory |

Generate a `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate an `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | Lint source (`oxlint`) |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run prisma:generate` | Regenerate the Prisma client after a schema change |
| `npm run prisma:migrate` | Create/apply a migration after a schema change |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |

## Architecture

Each feature is a self-contained Nest module under `src/`:

```
auth/           Stage 1 email/password login, JWT issuing/verification
business/       Business CRUD + assertAccess() — the shared authorization check
                (owner, or an active AccessGrant) used by every module below
category/       Income/expense categories, per business
account/        Accounts within a business — a business can have multiple
transaction/    Bookkeeping entries (money-in/money-out) per account, running
                balance, counterparty (who the money moved with), and the
                original uploaded receipt/invoice file
client/         Bill To records (invoice recipients), per business
invoice/        Invoice creation/editing, PDF rendering (pdf/), local disk
                storage
invoice-scan/   "Upload invoice" — extracts amount/date/counterparty from an
                uploaded PDF or image to prefill a transaction
report/         Date-range reports, per business (+ optional account filter)
                or combined across every owned business; on-screen JSON and
                PDF export
dashboard/      Per-business and combined cost-tracking summaries
access-grant/   Sharing: grant/revoke time-limited business access
encryption/     AES-256-GCM encryption for sensitive fields at rest
common/         Cross-cutting security helpers: rate limiting, file-signature
                verification, safe-id checks for on-disk paths
prisma/         PrismaService — the only thing that talks to the database
generated/      Prisma client output (gitignored, regenerated by `prisma generate`)
```

### Data model

The account is modeled as double-entry-ready from day one (`Transaction` → `Line[]`), even though Phase 1's UI only shows a simple money-in/money-out list — see `prisma/schema.prisma` for the full schema and comments. Core entities:

- **User** — login identity (email/password now, `google_id` reserved for Stage 2)
- **Business** — one of the owner's companies; carries its `currency` (`BDT`/`EUR`/`USD`/`CNY`) and the invoice sender profile (logo, address, contact info, bank details — encrypted at rest, see "Security" — and default terms)
- **Account** — a book of transactions within a business; a business can have several (e.g. separate cash vs. bank accounts), each independently deletable
- **Client** — a saved Bill To record, reusable across a business's invoices
- **Category** — income/expense grouping, per business
- **Transaction** / **Line** — an account entry, scoped to an `Account`; Phase 1 stores one Line per Transaction (a CREDIT for income, a DEBIT for expense). Also carries an optional free-text `counterparty` (who the money moved with) and, when created via "Upload invoice," a reference to the original uploaded file so it can be reopened later
- **Invoice** / **InvoiceItem** — a generated invoice and its line items; the invoice number and content are editable after creation
- **Document** — any stored file reference (storage-provider aware: local now, Drive later)
- **AccessGrant** — a sharing permission: business or table scope, view or edit, with an expiry and optional early revocation

### Authorization model

Every business-scoped endpoint (categories, transactions, clients, invoices, dashboard) goes through `BusinessService.assertAccess(userId, businessId, permission)`:

- The **owner** always has full access.
- A **collaborator** gets access only via an active `AccessGrant` — not expired, not revoked, scoped to the whole business. A `VIEW` grant permits GET requests; an `EDIT` grant is required for POST/PATCH/DELETE.
- Editing the **business's own settings** (name, currency, invoice profile, or deleting the business) always stays owner-only, regardless of any grant — sharing gives access to a business's data, not control over the business itself.
- **Table-scoped grants** (share just "invoices", not the whole business) are validated and stored, but not yet enforced per-resource — see "What's not built yet."

## API reference

All endpoints except `/auth/register` and `/auth/login` require `Authorization: Bearer <token>`. Endpoints nested under `/businesses/:businessId/...` apply the authorization model above.

### Auth (`/auth`)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password (min 8 chars), name }` | Returns `{ accessToken, user }` |
| POST | `/auth/login` | `{ email, password }` | Returns `{ accessToken, user }` |
| GET | `/auth/me` | — | Returns the current user's profile |

### Businesses (`/businesses`) — owner-only

| Method | Path | Body |
|---|---|---|
| POST | `/businesses` | `{ name, currency?, logoUrl?, address?, contactEmail?, website?, bankAccountName?, bankAccountNumber?, bankRoutingNumber?, bankSwiftCode?, bankBranch?, defaultTerms? }` |
| GET | `/businesses` | — (lists businesses you own) |
| GET | `/businesses/:id` | — |
| PATCH | `/businesses/:id` | any subset of the create fields |
| DELETE | `/businesses/:id` | — |

### Accounts (`/businesses/:businessId/accounts`)

| Method | Path | Body |
|---|---|---|
| POST | `.../accounts` | `{ name }` |
| GET | `.../accounts` | — |
| GET | `.../accounts/:id` | — |
| PATCH | `.../accounts/:id` | `{ name }` |
| DELETE | `.../accounts/:id` | Also deletes its transactions |

### Categories (`/businesses/:businessId/categories`)

| Method | Path | Body |
|---|---|---|
| POST | `.../categories` | `{ name, type: "INCOME" \| "EXPENSE" }` |
| GET | `.../categories` | — |
| GET | `.../categories/:id` | — |
| PATCH | `.../categories/:id` | `{ name?, type? }` |
| DELETE | `.../categories/:id` | Deleting a category in use unlinks it from transactions (they become "uncategorized") rather than failing or deleting the transactions |

### Transactions (`/businesses/:businessId/transactions`)

| Method | Path | Body |
|---|---|---|
| POST | `.../transactions` | `{ accountId, date, memo?, counterparty?, categoryId?, amount (positive), type: "INCOME" \| "EXPENSE" }` — `categoryId`, if given, must belong to the business and match `type` |
| GET | `.../transactions?accountId=` | — returns entries in date order, each with a `runningBalance`; `accountId` filters to one account |
| GET | `.../transactions/balance` | — `{ totalIncome, totalExpense, balance }` |
| GET | `.../transactions/:id` | — |
| PATCH | `.../transactions/:id` | any subset of the create fields |
| DELETE | `.../transactions/:id` | — |
| POST | `.../transactions/:id/receipt` | multipart `file` (PDF/JPG/PNG/WEBP, ≤15MB) — attaches/replaces the transaction's source document |
| GET | `.../transactions/:id/receipt` | — streams the originally uploaded file back |

### Upload invoice / scan (`/businesses/:businessId/accounts/:accountId/scan`)

| Method | Path | Body |
|---|---|---|
| POST | `.../scan` | multipart `file` (PDF preferred; JPG/PNG/WEBP also accepted, ≤15MB) — extracts amount, date, and counterparty from the document (PDF text layer first, OCR fallback for scans/images) to prefill a new transaction. Nothing is saved until the user submits the resulting transaction via the endpoint above. |

### Clients (`/businesses/:businessId/clients`)

| Method | Path | Body |
|---|---|---|
| POST | `.../clients` | `{ name, address, email? }` |
| GET | `.../clients` | — |
| GET | `.../clients/:id` | — |
| PATCH | `.../clients/:id` | `{ name?, address?, email? }` |
| DELETE | `.../clients/:id` | `409` if the client has invoices — delete those first |

### Invoices (`/businesses/:businessId/invoices`)

| Method | Path | Body |
|---|---|---|
| POST | `.../invoices` | `{ clientId, issueDate, terms, dueDate, items: [{ description, quantity, rate }] }` (≥1 item). Auto-generates a sequential invoice number, computes amounts/subtotal/total, and renders + saves a PDF. If PDF generation fails, the invoice is rolled back (no orphaned draft is left behind). |
| GET | `.../invoices` | — |
| GET | `.../invoices/:id` | — includes line items and client |
| GET | `.../invoices/:id/pdf` | — streams the generated PDF as an attachment |
| PATCH | `.../invoices/:id/status` | `{ status: "DRAFT" \| "SENT" \| "PAID" \| "OVERDUE" \| "CANCELLED" }` — invoice content (items, client, dates) is immutable after creation by design; only the status transitions |
| DELETE | `.../invoices/:id` | Also deletes the PDF from disk |

### Dashboards

| Method | Path | Notes |
|---|---|---|
| GET | `/businesses/:businessId/dashboard` | `{ totalIncome, totalExpense, balance, byCategory: [...] }` for one business |
| GET | `/dashboard` | Combined totals across every business you own, plus a per-business breakdown. Amounts are summed as-is, **not currency-converted** — multi-currency support is deferred (see below) |

### Reports

| Method | Path | Query | Notes |
|---|---|---|---|
| GET | `/businesses/:businessId/reports` | `from`, `to` (`YYYY-MM-DD`, required), `accountId?` | Totals, category breakdown, and the full transaction list for the date range, optionally narrowed to one account |
| GET | `/businesses/:businessId/reports/pdf` | same | Same report as a downloadable PDF |
| GET | `/reports` | `from`, `to` | Combined report across every business you own, with a per-business breakdown |
| GET | `/reports/pdf` | same | Combined report as a downloadable PDF |

### Sharing (`/businesses/:businessId/access-grants`, `/shared-with-me`) — owner-only to manage

| Method | Path | Body |
|---|---|---|
| POST | `.../access-grants` | `{ granteeEmail, scope: "BUSINESS" \| "TABLE", tableName? (required if scope=TABLE; one of categories/transactions/clients/invoices), permission: "VIEW" \| "EDIT", expiresAt }`. `granteeEmail` must belong to an already-registered user; `expiresAt` must be in the future; you can't grant access to yourself. |
| GET | `.../access-grants` | Lists all grants on the business, each with a computed `status`: `active` / `expired` / `revoked` |
| DELETE | `.../access-grants/:id` | Revokes immediately (idempotent) |
| GET | `/shared-with-me` | Lists active business-scope grants where you're the collaborator |

## Testing

```bash
npm run test
```

Unit tests currently cover the security- and correctness-critical logic: `BusinessService.assertAccess` (owner vs. collaborator vs. stranger, VIEW vs. EDIT, expiry/revocation), `AuthService` (password hashing, login failure modes), `TransactionService` (income/expense → debit/credit mapping, running balance), and `AccessGrantService` (grant validation edge cases). Every endpoint has also been exercised manually end-to-end against a real local database during development (registration through invoice PDF generation, sharing, and dashboards).

There's no seed script yet — create a user via `POST /auth/register` to get started.

## Security

A hardening pass covers the usual checklist for an API handling financial data:

- **Encryption at rest** — `Business.bankAccountNumber`/`bankRoutingNumber`/`bankSwiftCode` are AES-256-GCM ciphertext in the database (`src/encryption/`). Encrypt/decrypt happens transparently inside `BusinessService`; the JSON contract to an authorized caller is unchanged. Requires `ENCRYPTION_KEY` (see above) — the app **refuses to start** without it, or without a sufficiently long `JWT_SECRET`.
- **Rate limiting** — a global 100 requests/minute per client (`src/common/rate-limit.guard.ts`), tightened to 5/minute on `/auth/login` and `/auth/register` to blunt brute-force/credential-stuffing.
- **Input validation** — a global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`: unknown fields are rejected outright, not silently dropped. Every DTO validates types, formats (e.g. `@IsDateString()` on report ranges), and required fields.
- **File upload safety** — every upload endpoint (invoice scan, transaction receipts) checks the file's actual magic bytes against its claimed MIME type, on top of a MIME allowlist and a size limit — a spoofed `Content-Type` header alone can't get a file past the check.
- **Security headers** — `helmet` is applied globally (with `crossOriginResourcePolicy` relaxed to `cross-origin` so the frontend's cross-origin `fetch()` for PDFs/receipts keeps working; CORS still restricts which origins may call the API at all, via `CORS_ORIGIN`).
- **Path safety** — on-disk paths for stored invoices/receipts are built only from IDs that pass a strict safe-id check, in addition to already requiring a DB-backed ownership check to reach that code.
- **Auth** — passwords hashed with bcrypt (12 salt rounds); JWTs signed with a required, minimum-length secret.

## What's not built yet

- **Table-scoped sharing enforcement.** `AccessGrant` supports `scope: "TABLE"` (e.g. share just the Invoices table) and validates/stores it, but only `BUSINESS`-scope grants are actively checked right now. Enforcing table-level scope means adding a per-resource check to every module — deliberately deferred until needed.
- **Stage 2: Google OAuth + Drive.** Per the plan, this happens right before production launch, not during local development. Needs a Google Cloud Console project and OAuth consent screen set up first (external to this repo).
- **Multi-currency conversion.** Each business picks its own currency (BDT/EUR/USD/CNY), but the combined dashboard and combined report sum raw numbers without conversion. Deferred to Phase 3 per the plan.
- **Calculated fields, full double-entry views (trial balance, P&L, balance sheet).** Explicitly Phase 2/3 in the plan — the schema is shaped to support them without a rewrite, but the endpoints don't exist yet.
- **Deployment.** Everything so far is built and tested against a local MySQL/MariaDB instance, per the local-first workflow agreed for this project.
