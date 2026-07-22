# Mini ERP + CRM Operations Portal

A full-stack operations portal for a wholesale/distribution business, covering customer relationship management, product and inventory tracking, and a sales challan workflow with role-based access control.

## Overview

The system is designed around correctness of the inventory and transaction layer under real-world conditions — concurrent requests, partial failures, and historical record integrity — rather than treating these as edge cases to be handled later. The design decisions below reflect that priority.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Validation | Zod |
| Database | PostgreSQL (hosted on Neon), Prisma ORM |
| Authentication | JWT with role-based middleware |
| Frontend | React, TypeScript, Vite, React Router DOM |

## Roles and Access Control

| Role | Permissions |
|---|---|
| Admin | Create and edit products; view customer records |
| Sales | Manage customers and follow-ups; full challan lifecycle (draft, confirm, cancel) |
| Warehouse | Adjust stock levels; view products and stock movement history |
| Accounts | Read-only access to customers, products, and challans |

Access control is enforced at the API layer via route middleware, in addition to being reflected in the frontend. A request from a role without the required permission returns `403 Forbidden` regardless of frontend state.

## Core Business Logic

### Concurrency-Safe Challan Numbering
Challan numbers are generated using an atomic PostgreSQL sequence rather than an application-level `count() + 1` query, which is subject to race conditions under concurrent writes.

1. A sequence (`challan_number_seq`) is created idempotently on backend startup via `CREATE SEQUENCE IF NOT EXISTS`.
2. Its starting value is synchronized to `MAX(id) + 1` to avoid collisions with existing records.
3. Each challan creation retrieves the next number via `SELECT nextval('challan_number_seq')::int` within a transaction.

### Transactional Stock Confirmation
Confirming a draft challan reduces product stock and creates a corresponding stock movement record. This operation is wrapped in a single database transaction:

- If any line item's requested quantity exceeds available stock, the entire transaction is rolled back and the API returns a `400` with a descriptive error identifying the affected product(s).
- No partial stock deduction can occur.

### Product Snapshotting
Each confirmed challan item stores its own copy of the product's name, SKU, and unit price at the time of confirmation, rather than referencing the live product record. Subsequent edits to a product's price or details do not alter previously confirmed challans.

### Restocking on Cancellation
Cancelling a confirmed challan reverses its effect on inventory: stock is restored and an `IN`-type stock movement is logged, within a single transaction.

## API Reference

All endpoints except login require a Bearer JWT.

| Method | Endpoint | Access |
|---|---|---|
| POST | `/auth/login` | Public |
| GET / POST / PUT | `/customers[/:id]` | Sales (write); Admin, Accounts (read) |
| POST | `/customers/:id/notes` | Sales |
| GET / POST / PUT | `/products[/:id]` | Admin (write); all roles (read) |
| POST | `/stock-movements` | Warehouse |
| GET | `/products/:id/movements` | Warehouse, Admin |
| GET / POST | `/challans` | Sales (write); Accounts (read) |
| PUT | `/challans/:id/confirm` | Sales |
| PUT | `/challans/:id/cancel` | Sales |

List endpoints support pagination and search/filter parameters. Complete request and response examples are provided in `postman_collection.json`.

## Local Setup

### Prerequisites
- Node.js 18+
- A PostgreSQL database (this project uses Neon)

### Installation
```bash
npm --prefix backend install
npm --prefix frontend install
```

### Environment Configuration
```bash
cd backend
cp .env.example .env
```

Populate `.env`:
```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
JWT_SECRET="<a-long-random-secret>"
PORT=4000
```

The real `.env` file is excluded from version control via `.gitignore`; only `.env.example` with placeholder values is tracked.

### Database Setup
```bash
npx prisma migrate dev --name init
npm run seed
```
The seed script creates one test user per role along with sample customers and products.

### Running the Application
```bash
# Backend — http://localhost:4000
npm --prefix backend run dev

# Frontend — http://localhost:5173
npm --prefix frontend run dev
```

## Demo Credentials

All seeded accounts share the password `Password123!`.

| Email | Role |
|---|---|
| admin@example.com | Admin |
| sales@example.com | Sales |
| warehouse@example.com | Warehouse |
| accounts@example.com | Accounts |

## Verification

The following was verified manually against a running instance connected to a live PostgreSQL database, prior to submission:

- Login and JWT issuance for all four roles
- Rejection (`403`) of restricted endpoints when accessed with an incorrect role
- Stock reduction and stock movement logging on challan confirmation
- Clean `400` rejection and full rollback when confirming a challan with insufficient stock
- Preservation of snapshot data in confirmed challans after the underlying product was edited
- Stock restoration and `IN` movement logging on challan cancellation
- Unique, non-colliding challan numbers under concurrent creation

An automated version of these checks is included at `backend/src/test_api.ts`:
```bash
npx tsx backend/src/test_api.ts
```

## Deployment

- **Database**: Neon (PostgreSQL), already provisioned.
- **Backend**: Render or Railway. Root directory: `backend`. Build command: `npm install && npx prisma generate && npm run build`. Start command: `npm start`. Environment variables: `DATABASE_URL`, `JWT_SECRET`, `PORT`.
- **Frontend**: Vercel or Netlify. Root directory: `frontend`. Build command: `npm run build`. Output directory: `dist`. Environment variable: `VITE_API_URL` set to the deployed backend URL.

If this submission is not accompanied by a live deployment, it includes in its place: a working local setup (above), a screen recording of the complete application flow, and the Postman collection, per the assignment's stated alternative for candidates who choose not to deploy.

