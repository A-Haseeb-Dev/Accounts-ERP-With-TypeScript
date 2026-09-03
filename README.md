# HAS ERP

A modern, web-based Enterprise Resource Planning (ERP) system covering accounting, inventory, sales, purchasing, and administration. Built as a pnpm monorepo with a **NestJS (TypeScript) REST API** and a **Next.js (React/TypeScript) frontend**, backed by a **PostgreSQL** database via **Prisma ORM**.

## Tech Stack

| Layer      | Technology                                             |
|------------|--------------------------------------------------------|
| Backend    | NestJS 10, TypeScript, Prisma ORM                      |
| Frontend   | Next.js 15 (App Router), React, Tailwind CSS    |
| Database   | PostgreSQL 16 (Neon serverless / Docker)               |
| Auth       | JWT (access + refresh), Argon2 password hashing, RBAC  |
| Testing    | Vitest (backend), 90 unit tests                        |
| Tooling    | pnpm workspaces, Docker Compose, Git                   |

## Architecture

```
has-erp/
├── apps/
│   ├── api/                  # NestJS backend (REST, port 4000)
│   │   └── src/
│   │       ├── auth/         # Login, refresh, cookies, RBAC
│   │       ├── users/        # User management
│   │       ├── roles/        # Roles & permissions
│   │       ├── admin/        # Head/Sub/Main accounts, items, brands, stock locations
│   │       ├── sales/        # Sales invoices & returns
│   │       ├── inventory/    # Purchases, returns, stock transfers
│   │       ├── accounts/     # Vouchers, cash book
│   │       ├── reports/      # Trial balance, general ledger/journal, stock reports
│   │       ├── dashboard/    # Overview metrics
│   │       ├── audit/        # Audit logs
│   │       ├── system/       # Settings, branding, permissions
│   │       └── common/       # Services, filters, interceptors, exceptions
│   └── web/                  # Next.js frontend (port 3000)
├── prisma/
│   ├── schema.prisma         # Database schema (Organization, Users, Accounts, Items,
│   │                         #   Sales, Purchases, Inventory, Reports, Audit)
│   └── seed.ts               # Development seed data
├── docker-compose.yml        # PostgreSQL + Redis
└── package.json              # pnpm workspace scripts
```

### Backend modules & API endpoints

All routes are prefixed with `/api`. The API uses a uniform response envelope:

```json
{ "success": true, "data": { ... }, "message": "..." }
```

Errors are returned as:

```json
{ "success": false, "error": { "code": "...", "message": "...", "details": null } }
```

| Module             | Base path                  | Purpose                                   |
|--------------------|----------------------------|-------------------------------------------|
| Auth               | `/api/auth`                | Login, token refresh, logout              |
| Users              | `/api/users`               | User CRUD                                 |
| Roles              | `/api/roles`               | Roles, permissions, assignment            |
| Head accounts      | `/api/head-accounts`       | Chart-of-accounts head groups             |
| Sub heads          | `/api/sub-heads`           | Chart-of-accounts sub heads               |
| Main accounts      | `/api/main-accounts`       | Ledger accounts                           |
| Item types/brands  | `/api/item-types`, `/api/brands` | Product catalog metadata           |
| Items              | `/api/items`               | Products with purchase/sale pricing       |
| Stock locations    | `/api/stock-locations`     | Warehouse / store locations               |
| Towns              | `/api/towns`               | Cities/towns for parties                  |
| Customers/Suppliers| `/api/customers`, `/api/suppliers` | Parties with linked accounts      |
| Sales              | `/api/sales`, `/api/sales-returns` | Sales invoices & returns          |
| Purchases          | `/api/purchases`, `/api/purchase-returns` | Purchase transactions          |
| Stock transfers    | `/api/stock-transfers`     | Move inventory between locations          |
| Vouchers           | `/api/vouchers`            | Double-entry accounting vouchers          |
| Reports            | `/api/reports`             | Trial balance, GL, journal, stock         |
| Dashboard          | `/api/dashboard`           | Summary metrics                           |
| Audit logs         | `/api/system/audit-logs`   | Action audit trail                        |
| System             | `/api/system`              | Settings & branding                       |
| Permissions        | `/api/permissions`         | Permission catalog                        |
| Health             | `/api/health`              | Liveness check (public, no auth)          |

### Frontend navigation

- **Dashboard**
- **Administration** – Head Accounts, Sub Heads, Main Accounts, Item Types, Brands, Items, Stock Locations
- **Parties** – Towns, Customers, Suppliers
- **Sales** – Sales Invoices, Sales Returns
- **Inventory** – Purchases, Purchase Returns, Stock Transfers
- **Accounts** – Vouchers, Cash Book
- **Reports** – Trial Balance, General Ledger, General Journal, Stock Report, Product Ledger, Sales Book, Purchase Book
- **System** – Users, Roles & Permissions, Audit Logs, Settings, Branding

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (`npm i -g pnpm@10.34.4`)
- A **PostgreSQL** database (Neon serverless or local Docker)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the root `.env` (already present in the repo for preview) and set your own values:

```bash
# Database connection string
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DBNAME?sslmode=require"
```

Typical `.env` variables:

| Variable                     | Description                                  |
|------------------------------|----------------------------------------------|
| `DATABASE_URL`               | Prisma PostgreSQL connection string          |
| `API_PORT` / `API_HOST`      | API listen port/host                         |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets (change in prod) |
| `JWT_ACCESS_EXPIRES_IN`      | e.g. `15m`                                   |
| `JWT_REFRESH_EXPIRES_IN`     | e.g. `7d`                                    |
| `WEB_URL`                    | Frontend origin for CORS                     |
| `BOOTSTRAP_ADMIN_USERNAME` / `PASSWORD` / `EMAIL` | Default admin on first boot |

For the web app, set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` (defaults to `http://localhost:4000`).

### 3. Database

You can run a local database with Docker:

```bash
docker-compose up -d
```

Then generate the client and push the schema:

```bash
pnpm db:generate   # generate Prisma client
pnpm db:push       # apply schema to the database
```

Optional: run Prisma Studio to inspect data.

```bash
pnpm db:studio
```

### 4. Seed development data

```bash
pnpm db:seed
```

This creates roles/permissions, the default organization, chart of accounts, master data, parties, and sample transactions.

### 5. Run in development

```bash
pnpm dev           # runs API + web together
```

Or individually:

```bash
pnpm dev:api       # http://localhost:4000/api
pnpm dev:web       # http://localhost:3000
```

> On first API boot, the bootstrap admin user is created from `BOOTSTRAP_ADMIN_*` (default `developer` / `Developer@123`).

## Default Demo Users

Seeded users (`pnpm db:seed`):

| Username     | Password        | Roles                             |
|--------------|-----------------|-----------------------------------|
| `developer`  | `Developer@123` | Developer, Super Admin            |
| `admin`      | `Admin@123`     | Super Admin, Administrator        |
| `accountant` | `Accountant@123`| Accountant                        |
| `sales`      | `Sales@123`     | Sales User                        |

## Running Tests

Backend unit tests use Vitest (90 tests across 11 spec files).

```bash
pnpm --filter @has-erp/api test
# or from the repo root: pnpm test
```

## Production Build

```bash
pnpm build:api     # nest build
pnpm build:web     # next build
# or both: pnpm build
```

The built API is served from `apps/api/dist` (run with `node dist/src/main.js` / `pnpm start:prod`), and the Next.js app from `apps/web/.next`.

## Linting & Type Checking

```bash
pnpm lint
pnpm typecheck
```

## Scripts (root)

| Script            | Description                             |
|-------------------|-----------------------------------------|
| `pnpm dev`        | Run API + web in parallel (watch mode)  |
| `pnpm build`      | Production build for all workspaces     |
| `pnpm test`       | Run all tests                           |
| `pnpm lint`       | Lint all workspaces                     |
| `pnpm typecheck`  | Type-check all workspaces               |
| `pnpm db:*`       | Prisma generate/push/migrate/seed/studio|

## Deploying to Vercel

This monorepo deploys as **two Vercel projects** (both from this same GitHub repo) that share one umbrella domain. The Next.js web app is served at your main domain, and the NestJS API on an `api.` subdomain. The web app proxies `/api/*` server-side to the API via Next.js rewrites, so the browser stays same-origin (no CORS, first-party session cookie).

### 1. Database

Point the API at a PostgreSQL database. With [Neon](https://neon.tech) (serverless Postgres) or any host, set `DATABASE_URL` and apply the schema once:

```bash
DATABASE_URL="postgresql://..." pnpm prisma db push
# or: pnpm prisma migrate deploy --schema prisma/schema.prisma
```

Then optionally seed demo data:

```bash
pnpm db:seed
```

### 2. API project (NestJS)

| Setting            | Value                        |
|--------------------|------------------------------|
| Imported from      | `A-Haseeb-Dev/Accounts-ERP-With-TypeScript` |
| Framework preset   | NestJS (auto-detected)       |
| Root Directory     | `apps/api`                   |
| Node.js Version    | 20.x                         |

Environment variables (Project → Settings → Environment Variables):

| Variable                     | Purpose                                  |
|------------------------------|------------------------------------------|
| `DATABASE_URL`               | Prisma PostgreSQL connection string      |
| `NODE_ENV`                   | `production`                             |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets (change these) |
| `JWT_ACCESS_EXPIRES_IN`      | e.g. `15m`                               |
| `JWT_REFRESH_EXPIRES_IN`     | e.g. `7d`                                |
| `WEB_URL`                    | The web project URL(s), comma-separated  |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_EMAIL` | Default admin on first boot |

`apps/api/vercel.json` runs `pnpm vercel-build`, which runs `prisma generate` (against the root `prisma/schema.prisma`, via the `prisma` field in `apps/api/package.json`) and then `nest build` to `dist/`.

### 3. Web project (Next.js)

| Setting            | Value                                      |
|--------------------|--------------------------------------------|
| Imported from      | same GitHub repo                           |
| Framework preset   | Next.js (auto-detected)                    |
| Root Directory     | `apps/web`                                 |
| Node.js Version    | 20.x                                       |

Environment variables:

| Variable                             | Purpose                                                        |
|--------------------------------------|----------------------------------------------------------------|
| `API_PROXY_TARGET` (build-time only) | The deployed API origin, e.g. `https://has-erp-api.vercel.app`. Next.js rewrites `/api/*` to this. Do NOT prefix with `/api`. |

`NEXT_PUBLIC_API_URL` is intentionally **not** set in production. When it is empty, the web app uses same-origin relative `/api/...` paths and relies on the Next.js rewrites in `apps/web/next.config.mjs` to reach the API. For local development, keep `NEXT_PUBLIC_API_URL=http://localhost:4000` in `apps/web/.env.local`.

> Add `API_PROXY_TARGET` to the web project **before** the build (Previews/Production/Development as needed), since rewrite targets are resolved at build/serve time.

### 4. Wire up the domain (optional)

- Add your custom domain to the **web** project (e.g. `app.example.com`) and to the **API** project as `api.app.example.com`.
- Set `WEB_URL=https://app.example.com` on the API project.
- Set `API_PROXY_TARGET=https://api.app.example.com` on the web project.

### Why two projects?

A NestJS app is a long-running Express server. On Vercel it runs as its own serverless function; the officially supported model keeps the Next.js frontend and the NestJS API as two Vercel functions/projects. Embedding a NestJS server inside the Next.js bundle is fragile with native `argon2` and Prisma engine bundling, and leads to exactly the kind of `FUNCTION_INVOCATION_FAILED` crash seen on Vercel.

## GitHub

Repository: <https://github.com/A-Haseeb-Dev/Accounts-ERP-With-TypeScript.git>
