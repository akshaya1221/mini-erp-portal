# Mini ERP + CRM Operations Portal

A full-stack ERP/CRM operations portal for a wholesale/distribution company: customer CRM, product & inventory management, and a sales challan workflow with role-based access control.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Auth | JWT (jsonwebtoken), Role-Based Access Control |
| Database | PostgreSQL (hosted on Neon), Prisma ORM |
| Validation | Zod |
| Frontend | React, TypeScript, Vite, React Router DOM |

## Features

- **Authentication & RBAC** — JWT login with four roles (ADMIN, SALES, WAREHOUSE, ACCOUNTS). Access is enforced on the API (route guards) and reflected in the UI (role-gating sidebar and actions).
- **Customers** — add, edit, search customers; customer detail page with a follow-up notes timeline.
- **Products & Inventory** — add/edit products, stock movement log (IN/OUT with reason and timestamp), low-stock alert badges based on a configurable minimum threshold.
- **Sales Challans** — multi-product draft/confirm/cancel workflow:
  - Confirming a challan reduces stock and logs a stock movement, inside a single database transaction.
  - Insufficient stock is rejected cleanly (400 error) with no partial updates.
  - Challan numbers are generated from a Postgres sequence, so concurrent creation can't produce duplicates.
  - Confirmed challans store a **snapshot** of product name/SKU/price, so later product edits don't alter historical challan data.
  - Cancelling a confirmed challan restocks the items and logs an IN movement.

## Roles

| Role | Can do |
|---|---|
| ADMIN | Create/edit products, view customer database |
| SALES | Register customers, add follow-up notes, create/confirm/cancel challans |
| WAREHOUSE | Adjust stock levels, view products and stock movement log |
| ACCOUNTS | Read-only access to challans, customers, and products |

## Project Structure
```
mini-erp-portal/
├── backend/          Express + TypeScript API
│   ├── prisma/        schema.prisma, seed.ts, migrations
│   └── src/
│       ├── routes/     auth, customers, products, stockMovements, challans
│       └── lib/        auth middleware, Prisma client
├── frontend/         React + Vite SPA
│   └── src/            App.tsx, pages, components
├── vercel.json       Vercel deployment configuration
└── postman_collection.json
```

## Getting Started

### Prerequisites
- Node.js 18+
- A PostgreSQL database (this project uses [Neon](https://neon.tech), free tier)

### 1. Install dependencies
```bash
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure environment variables
Copy the example file and fill in your own values:
```bash
cd backend
cp .env.example .env
```
`.env` keys:
```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=4000
```
> Never commit your real `.env` — it's excluded via `.gitignore`. Only `.env.example` (with placeholder values) should be tracked in git.

### 3. Run migrations and seed the database
```bash
npx prisma migrate dev --name init
npm run seed
```
This creates one test user per role plus sample customers and products.

### 4. Start the apps
```bash
# Terminal 1 — backend, http://localhost:4000
npm --prefix backend run dev

# Terminal 2 — frontend, http://localhost:5173
npm --prefix frontend run dev
```

## Demo Login

The seed script creates one user per role. Password for all: `Password123!`

| Email | Role |
|---|---|
| admin@example.com | ADMIN |
| sales@example.com | SALES |
| warehouse@example.com | WAREHOUSE |
| accounts@example.com | ACCOUNTS |

## API Overview

All routes require a Bearer JWT except login.

| Method | Endpoint | Roles |
|---|---|---|
| POST | `/auth/login` | public |
| GET/POST/PUT | `/customers[/:id]` | ADMIN, SALES, ACCOUNTS (read) |
| POST | `/customers/:id/notes` | SALES |
| GET/POST/PUT | `/products[/:id]` | ADMIN (write), all (read) |
| POST | `/stock-movements` | WAREHOUSE |
| GET | `/products/:id/movements` | WAREHOUSE, ADMIN |
| GET/POST | `/challans` | SALES (write), ACCOUNTS (read) |
| PUT | `/challans/:id/confirm` | SALES |
| PUT | `/challans/:id/cancel` | SALES |

Full request/response examples are in `postman_collection.json`.

## Core Business Logic

### Concurrency-safe challan numbering
Rather than a race-prone `count() + 1` query, challan numbers come from an atomic Postgres sequence:
1. `CREATE SEQUENCE IF NOT EXISTS challan_number_seq;` — idempotent, run on backend startup.
2. Starting value synced to `MAX(id) + 1` to avoid colliding with existing records.
3. Each challan creation calls `SELECT nextval('challan_number_seq')::int` inside a transaction.

### Snapshot pricing
Each `ChallanItem` stores its own copy of the product's name, SKU, and unit price at the time the challan was created. Editing a product afterward doesn't change historical challan records — verified by editing a product's price after confirming a challan and confirming the stored challan item is unchanged.

### Stock transaction safety
Confirming a challan runs in a single Prisma transaction: it checks stock for every line item, and if any item is short, the entire confirmation is rejected with a 400 and nothing is written — no partial stock deduction.

### Restocking on cancel
Cancelling a confirmed challan restores each item's quantity to `currentStock` and logs a corresponding `IN` stock movement, in a single transaction.

## Testing

An integration test script is included at `backend/src/test_api.ts`, covering:
- Login for all 4 roles
- Role-based route restrictions (expect 403 for unauthorized roles)
- Challan confirm → stock reduction → stock movement log
- Insufficient-stock rejection and rollback
- Snapshot integrity after a product edit
- Restocking on cancel
- Concurrent challan creation → unique sequential numbers

Run it (with the backend running):
```bash
npx tsx backend/src/test_api.ts
```
*(Note: You can run this command directly from the root workspace directory. The backend automatically resolves the `.env` configuration file path dynamically relative to its source code.)*

## Deployment

- **Database**: Neon (Postgres) — already provisioned.
- **Backend**: deploy to Render, Railway, or Fly.io. Root directory `backend/`; build command `npm install && npx prisma generate && npm run build`; start command `npm start`. Set `DATABASE_URL`, `JWT_SECRET`, `PORT` as environment variables.
- **Frontend**: deploy to Vercel or Netlify. Root directory `frontend/`; build command `npm run build`; output directory `dist`. Set `VITE_API_URL` to the deployed backend URL.

If not deployed, this submission includes a local setup (above), a screen recording of the full flow, and the Postman collection as required alternatives.

## Known Limitations

- No pricing tiers by customer type — challan items always use the product's live unit price at creation time.
- Free-tier deployment hosts (if used) spin down after inactivity; the first request after idle may take 30–50 seconds due to cold-starts.
- No automated frontend browser tests are executed locally in Windows environments as the browser testing engine requires a Linux container. All backend and database workflows are verified programmatically.

## Assumptions Made

- Cancelling a CONFIRMED challan restocks the involved products and logs an `IN` stock movement — this wasn't explicitly specified in the brief, so we treated it as the expected behavior for a functioning inventory system.
- Stock adjustments (manual IN/OUT) are performed by the WAREHOUSE role via a modal on the Products page rather than a separate page.
