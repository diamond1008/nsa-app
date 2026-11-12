# Enhanced Personal Account Page (`/account`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the personal account page into an English-slugged (`/account`), full-featured, modular control center with profile editing, role-tailored quick hubs, security sessions, SSO status cards, and user preferences.

**Architecture:** Update route slugs from `/tai-khoan` to `/account`. Expose user metadata (`last_login_at`, `created_at`) from PostgreSQL via SQLC into Go API `UserInfo`. Build a tabbed liquid-glass interface in React with profile management, role quick-access widgets, security session revocation, and personal preferences.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Hook Form, Zod, Go 1.24, PostgreSQL, pgx/v5, sqlc, Vitest.

---

## Global Constraints
- Target URL route MUST be `/account` (with `/tai-khoan` redirecting to `/account`).
- All code changes must strictly pass `go test ./...`, `npm run lint`, and `npm test -- --run`.
- Avatars must continue using WebP $\le 256\text{ KiB}$.
- Vietnamese phone validation rules: 10–11 digits starting with 0.

---

### Task 1: Route Slug Migration (`/tai-khoan` $\rightarrow$ `/account`)

**Files:**
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx`

- [ ] **Step 1: Update router.tsx**
Change route path `/tai-khoan` to `/account`, and add `{ path: "/tai-khoan", element: <Navigate to="/account" replace /> }`.

- [ ] **Step 2: Update AppLayout.tsx**
Update bottom user profile NavLink `to="/account"`.

- [ ] **Step 3: Verify build**
Run: `cd apps/web && npm run typecheck`

---

### Task 2: Backend Metadata & Session Revocation API

**Files:**
- Modify: `database/queries/auth.sql`
- Generate: `database/generated/auth.sql.go`
- Modify: `apps/api/internal/auth/service.go`
- Modify: `apps/api/internal/auth/handler.go`
- Modify: `apps/api/cmd/api/main.go`

- [ ] **Step 1: Update auth.sql**
Add `last_login_at` and `created_at` to `GetUserByEmail` and `GetUserByID`.
Add query `RevokeOtherRefreshTokens`.

- [ ] **Step 2: Run sqlc generate**
Run: `sqlc generate`

- [ ] **Step 3: Update Go models & service**
Add `LastLoginAt *time.Time` and `CreatedAt time.Time` to `UserInfo`.
Implement `RevokeOtherSessions(ctx context.Context, userID string) error`.

- [ ] **Step 4: Update handler & main.go**
Add `RevokeOtherSessions` handler and register `r.Post("/me/revoke-other-sessions", authHandler.RevokeOtherSessions)`.

- [ ] **Step 5: Test & build Go API**
Run: `cd apps/api && go test ./internal/auth/... && go build -o bin/api.exe ./cmd/api`

---

### Task 3: Frontend API & Auth Context Integration

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/features/auth/authApi.ts`
- Modify: `apps/web/src/features/auth/AuthContext.tsx`

- [ ] **Step 1: Update UserInfo type**
Add `last_login_at?: string | null` and `created_at?: string` in `types.ts`.

- [ ] **Step 2: Add API call in authApi.ts**
Add `revokeOtherSessions(): Promise<{ message: string }>`.

- [ ] **Step 3: Expose in AuthContext.tsx**
Add `revokeOtherSessions` in AuthContext.

---

### Task 4: Enhanced Tabbed PersonalAccountPage with Role Quick Hub

**Files:**
- Modify: `apps/web/src/features/account/PersonalAccountPage.tsx`
- Modify: `apps/web/src/features/account/PersonalAccountPage.test.tsx`

- [ ] **Step 1: Implement Modular Tabbed UI**
  - Tab 1: **Profile & Role Hub**: Avatar card + Quick Role Dashboard (Admin/Sale/Teacher/Student widgets) + Name & Phone form.
  - Tab 2: **Security & Sessions**: Password change + Security Health score + Login session metadata + "Đăng xuất các thiết bị khác" button.
  - Tab 3: **Connected Accounts (SSO)**: Google Workspace & Microsoft 365 linking cards.
  - Tab 4: **Preferences**: Theme/Sidebar preferences, sound alerts, notification switches.

- [ ] **Step 2: Update unit tests in PersonalAccountPage.test.tsx**
Cover tab switching, session revocation, and role widgets.

- [ ] **Step 3: Verify vitest**
Run: `cd apps/web && npx vitest run src/features/account/PersonalAccountPage.test.tsx`

---

### Task 5: Full Suite Verification & Restart Daemon

- [ ] **Step 1: Restart Go API daemon**
Restart `bin/api.exe`.

- [ ] **Step 2: Run full verification suite**
Run `go test ./...` and `npm run lint` and `npm test -- --run` and `npm run build`.
