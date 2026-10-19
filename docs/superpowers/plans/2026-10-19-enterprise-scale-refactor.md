# Enterprise Scale & Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the NSA CRM & Finance modules into a clean, modular, enterprise-grade architecture with pg_trgm substring search indexing, soft-deletes, modularized Go services, centralized Query Keys, and decomposed React subcomponents.

**Architecture:**
- Database: Add migration 00018 with `pg_trgm` GIN indexes for fast fuzzy searching over 100k+ rows, plus `deleted_at` soft-delete columns on `leads` and `orders`.
- Backend (Go): Split monolithic `leads/service.go` (1,744 lines) into modular domain files (`service.go`, `conversion.go`, `import_export.go`, `routing.go`, `interactions_tasks.go`).
- Frontend (React): Centralize query keys in `queryKeys.ts`, decompose `SaleRegistrationOrdersPage.tsx` and `SaleReceiptsPage.tsx` by extracting modal dialogs into focused components.

**Tech Stack:** Go 1.22+, PostgreSQL 16 (pg_trgm, GIN), Goose, sqlc, React 18, TypeScript, TanStack Query v5, Tailwind CSS.

---

### Task 1: Database Performance & Soft-Delete Migration

**Files:**
- Create: `database/migrations/00018_enterprise_scale_optimizations.sql`
- Modify: `database/queries/leads.sql`
- Modify: `database/queries/orders.sql`
- Generate: `database/generated/*.sql.go` via `sqlc generate`

- [x] **Step 1: Write Migration 00018**
  Add `pg_trgm` extension, GIN indexes on `leads(full_name, phone)` and `student_profiles(full_name, student_code)`. Add `deleted_at` to `leads` and `orders`.
- [x] **Step 2: Apply migration with Goose**
  Run `goose postgres $DATABASE_URL up` and verify migration applies cleanly.
- [x] **Step 3: Update sqlc queries**
  Ensure list/count queries for `leads` and `orders` filter out soft-deleted records (`WHERE deleted_at IS NULL`).
- [x] **Step 4: Run sqlc generate**
  Regenerate Go models and query methods.

---

### Task 2: Backend Architecture Decomposition (`internal/leads`)

**Files:**
- Modify: `apps/api/internal/leads/service.go`
- Create: `apps/api/internal/leads/conversion.go`
- Create: `apps/api/internal/leads/import_export.go`
- Create: `apps/api/internal/leads/routing.go`
- Create: `apps/api/internal/leads/tasks_interactions.go`

- [x] **Step 1: Extract conversion logic**
  Move `Convert` and associated helper functions to `conversion.go`.
- [x] **Step 2: Extract import/export logic**
  Move Excel and CSV streaming/parsing functions to `import_export.go`.
- [x] **Step 3: Extract routing & round-robin logic**
  Move `getNextRoundRobinStaff` and assignment distribution logic to `routing.go`.
- [x] **Step 4: Extract task & interaction helpers**
  Move interaction logs and lead tasks helpers to `tasks_interactions.go`.
- [x] **Step 5: Verify Go build and tests**
  Run `go test ./...` in `apps/api` and ensure clean compilation and 0 failures.

---

### Task 3: Frontend Architecture & Modularity

**Files:**
- Create: `apps/web/src/lib/queryKeys.ts`
- Create: `apps/web/src/features/sale/CreateRegistrationOrderModal.tsx`
- Create: `apps/web/src/features/sale/UpdateOrderStatusModal.tsx`
- Create: `apps/web/src/features/sale/CollectReceiptPaymentModal.tsx`
- Modify: `apps/web/src/features/sale/SaleRegistrationOrdersPage.tsx`
- Modify: `apps/web/src/features/sale/SaleReceiptsPage.tsx`

- [x] **Step 1: Create Centralized Query Keys**
  Export `saleKeys`, `adminKeys` factories in `apps/web/src/lib/queryKeys.ts`.
- [x] **Step 2: Extract Modals from SaleRegistrationOrdersPage**
  Create `CreateRegistrationOrderModal.tsx` and `UpdateOrderStatusModal.tsx`.
  Refactor `SaleRegistrationOrdersPage.tsx` to use them.
- [x] **Step 3: Extract Modal from SaleReceiptsPage**
  Create `CollectReceiptPaymentModal.tsx`.
  Refactor `SaleReceiptsPage.tsx` to use it.

---

### Task 4: End-to-End Verification

- [x] **Step 1: Run frontend tests** (`npm test -- --run`)
- [x] **Step 2: Run frontend build** (`npm run build`)
- [x] **Step 3: Run backend test suite** (`go test ./...`)
- [x] **Step 4: Verify hot reload and server logs**
