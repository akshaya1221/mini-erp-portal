# Mini ERP + CRM Operations Portal

This is a full-stack operations portal for a wholesale and distribution business. It incorporates a Node.js + Express backend with Prisma ORM + PostgreSQL, and a React frontend built with Vite.

---

## Technical Stack & Features
- **Backend**: Node.js, Express, TypeScript, Zod validation
- **Auth & Security**: JWT-based Authentication with Role-Based Access Control (RBAC)
- **Database**: PostgreSQL (hosted on Neon), Prisma ORM
- **Frontend**: React, TypeScript, Vite, React Router DOM
- **Safe Numbering**: Safe PostgreSQL sequence-based challan numbering counter to prevent race conditions under concurrent creation.
- **Auditing & Transactions**: Double-gated transaction rollback for challan confirmations. Confirmed challans store snapshots of product metadata (SKU, Name, Price) rather than dynamic joins to preserve transaction history.

---

## Local Setup

### 1. Root Configuration & Dependencies
Install dependencies for both frontend and backend:
```bash
# Install root/monorepo packages
npm install

# Install backend dependencies
npm --prefix backend install

# Install frontend dependencies
npm --prefix frontend install
```

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL="postgresql://neondb_owner:npg_caQhkBJP8x5A@ep-lively-band-av4feer9.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="a-long-random-string-you-make-up-12345"
PORT=4000
```

### 3. Database Migrations & Seeding
Verify and apply migrations and seed the real database (includes test accounts, products, and customers):
```bash
# Run migrations (already applied to Neon Postgres, but useful for fresh database check)
npx --prefix backend prisma migrate dev --name init

# Seed database with sample data and test users
npm --prefix backend run seed
```

### 4. Running the Applications
Start the backend and frontend dev servers:
```bash
# Start backend API server (runs on port 4000)
npm --prefix backend run dev

# Start frontend Vite server (runs on port 5173)
npm --prefix frontend run dev
```

---

## Role-Based Access Control Matrix

The portal supports four explicit user roles with individual route access:
- **ADMIN**: Product Catalog Creation, Product Details Updating, Customer Database Viewing.
- **SALES**: Customer Registration, Add Customer Notes (Follow-ups), Challan Creation (Drafts), Challan Confirmation, Challan Cancellation.
- **WAREHOUSE**: Stock Level Adjustments (creates Stock Movement records and alters inventory), Product Catalog Viewing, Stock Movements log viewing.
- **ACCOUNTS**: Read-only access to Challans, Customers, and Products for auditing and reports.

---

## API Verification Suite

An end-to-end integration verification script is included at `backend/src/test_api.ts`. It programmatically tests the entire backend operations suite against the live database:
- User logins and JWT token retrieval.
- Route authorization checks (validating that restricted paths return `403 Forbidden`).
- Stock transaction checks: validating that confirming a draft challan reduces inventory levels and creates a corresponding stock movement.
- Failure rollbacks: verifying that confirming a challan with insufficient stock fails with a clean `400` status and completely rolls back the database transaction.
- Product snapshot integrity: verifying that modifying product details does not modify historical unit prices or SKU records in previously confirmed challans.
- Stock Restocking on Cancel: verifying that cancelling a confirmed challan restores inventory and logs an `IN` stock movement.
- Concurrent sequence safety: making 5 concurrent requests and asserting that all challans receive unique sequential numbers without database collisions.

To execute the test suite (ensure the backend server is running on port 4000 first):
```bash
npm --prefix backend run seed
npx --prefix backend tsx src/test_api.ts
```

---

## Core Business Logic Implementations

### Concurrency-Safe Challan Numbering
Instead of a race-prone `count() + 1` query in application code (which results in duplicate ID generation under high traffic), the system uses an atomic database-level sequence. On backend startup:
1. An idempotent sequence is initialized via raw SQL: `CREATE SEQUENCE IF NOT EXISTS challan_number_seq;`
2. The sequence starting value is synchronized to `MAX(id) + 1` to prevent collisions with pre-existing records.
3. During draft challan creation, the sequence is incremented atomically inside a transaction: `SELECT nextval('challan_number_seq')::int;`.

### Snapshot pricing
When a challan is created, the system copies the `name`, `sku`, and `unitPrice` of each product into `ChallanItem` snapshot fields. If a product's price is updated, historically confirmed challans retain their snapshot values, ensuring financial accuracy.

### Restocking on Cancel
Cancelling a confirmed challan returns its items to stock. The system executes this inside a single Prisma transaction:
1. Re-updates product `currentStock` with the item quantity.
2. Generates a new `StockMovement` of type `IN` with reason: `Cancel challan CH-XXXX`.
3. Sets the challan status to `CANCELLED`.
