# accounting-api

Backend API for the Multi-Business Accounting Tool. NestJS + TypeScript service that owns all business logic (bookkeeping, invoicing, auth, access control) and is the only thing that talks to the database. See the project plan in `../Assest and doc/Accounting-Tool-Project-Plan.docx` for full context.

## Stack

- **Framework:** NestJS (TypeScript)
- **ORM / DB:** Prisma + MySQL/MariaDB
- **Auth:** Stage 1 — email/password (bcrypt + JWT). Stage 2 adds Google OAuth.
- **File storage:** Stage 1 — local server disk. Stage 2 — Google Drive API.

## Setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL and JWT_SECRET in .env
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

## Scripts

- `npm run start:dev` — run with hot reload
- `npm run build` — compile to `dist/`
- `npm run lint` — lint source
- `npm run test` — unit tests
- `npm run test:e2e` — end-to-end tests

## Status

Project scaffolding stage — NestJS app + Prisma schema in place. Local MySQL/MariaDB connection and auth module are set up locally by the developer, not yet wired to a hosting environment.
