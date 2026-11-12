# Design Specification: Enhanced Personal Account Page (`/account`)

**Date:** 2026-11-11  
**Status:** Approved by User  
**Target URL:** `/account` (English route slug, redirecting from `/tai-khoan`)  

---

## 1. Objectives

Transform the personal account experience into an enterprise-grade, comprehensive user center that:
1. **Uses English URL slugs**: Main route is `/account` with an automatic 301/replace redirect from `/tai-khoan`.
2. **Eliminates emptiness** with 4 rich, modular sections:
   - **Profile & Identity (Hồ sơ cá nhân)**: Hero card with avatar (WebP crop $\le 256\text{ KiB}$), role badges, student/teacher IDs, editable name & phone, read-only system email.
   - **Role-Specific Quick Hub (Lối tắt theo vai trò)**: Dynamic widgets showing tailored navigation and quick links based on whether the user is an Admin, Sale Manager, Sale Staff, Teacher, or Student.
   - **Security & Active Sessions (Bảo mật & Phiên làm việc)**: Password change form, security health badge, last login timestamp (`last_login_at`), member since date (`created_at`), and an action to revoke sessions across other devices.
   - **SSO Accounts & Integrations (Tài khoản liên kết)**: Status indicators for Google Workspace & Microsoft 365 single sign-on.
   - **Preferences & Display (Tùy chọn trải nghiệm)**: Personal UI preferences such as default sidebar state, notification sound toggles, and task alert preferences stored locally.

---

## 2. Technical Architecture

### 2.1 Backend & Database
1. **Database Queries (`database/queries/auth.sql`)**:
   - Update `GetUserByEmail` and `GetUserByID` to return `last_login_at` and `created_at`.
   - Add query `RevokeOtherRefreshTokens :exec` or use existing `RevokeAllRefreshTokensForUser` when changing password or explicitly revoking other sessions.
2. **Go API (`apps/api/internal/auth`)**:
   - Add `LastLoginAt *time.Time` and `CreatedAt time.Time` to `UserInfo` in `models.go` / `service.go`.
   - Implement `POST /api/v1/auth/revoke-other-sessions` (requires auth, clears old tokens and issues a fresh refresh token cookie for the current session).

### 2.2 Frontend Architecture (`apps/web`)
1. **Routing (`apps/web/src/routes/router.tsx`)**:
   - Register `{ path: "/account", element: <PersonalAccountPage /> }`.
   - Register `{ path: "/tai-khoan", element: <Navigate to="/account" replace /> }`.
   - Update Sidebar link in `AppLayout.tsx` to navigate to `/account`.
2. **Types (`apps/web/src/lib/types.ts`)**:
   - Add `last_login_at?: string | null` and `created_at?: string` to `UserInfo`.
3. **API Client (`apps/web/src/features/auth/authApi.ts`)**:
   - Add `revokeOtherSessions(): Promise<{ message: string }>`.
4. **Components (`apps/web/src/features/account/PersonalAccountPage.tsx`)**:
   - Tabbed / segmented view for seamless navigation between:
     - **Profile Overview**: Hero avatar card, personal details, role-based quick hub.
     - **Security & Password**: Password change form, password strength guide, session info & revoke action.
     - **Connected Accounts (SSO)**: Google Workspace and Microsoft 365 status.
     - **Preferences**: UI preferences, notification sound, reminder toggles.

---

## 3. Verification & Testing

1. Backend tests: `go test ./...` in `apps/api`.
2. Frontend tests: `npm test -- --run` in `apps/web`.
3. ESLint & Build: `npm run lint` and `npm run build` in `apps/web`.
4. Verification on local browser `http://localhost:5173/account`.
