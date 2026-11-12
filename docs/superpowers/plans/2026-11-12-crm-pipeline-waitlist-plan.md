# NSA CRM Lead Pipeline, Multi-Lead Assign, Auto-Assign Toggle & Course Waitlist Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 core CRM & enrollment enhancements: (1) restrict manual lead pipeline status changes to 5 statuses, (2) multi-select bulk lead assignment to sale reps, (3) master toggle for automated round-robin lead distribution, and (4) "Phòng chờ" (Course Waitlist) for registration orders when classes are not yet opened, with 1-click class assignment once opened.

**Architecture:** 
- PostgreSQL migration adds `system_settings` table to persist global toggles (e.g. `sale_auto_assign_enabled`).
- Backend Go modules (`leads`, `orders`, `users`) implement validation, bulk assignment, setting getters/setters, and `assign-class` logic for orders.
- Frontend React + Vite apps update `LeadPipelinePage`, `LeadDetailDrawer`, `LeadProfilePage`, `UserManagementPage`, `CreateRegistrationOrderModal`, `LeadConvertPage`, and `SaleRegistrationOrdersPage`.

**Tech Stack:** Go 1.24, chi, pgx/v5, sqlc, PostgreSQL, React 19, TypeScript, TanStack Query, Tailwind CSS.

## Global Constraints
- Only use documented, sanctioned patterns; no direct SQL injections or bypassing RBAC.
- Run tests and lint on both `apps/api` and `apps/web`.
- Keep existing 8 pipeline statuses valid in filters/badges/reports; only restrict user-initiated manual status updates.
- Orders in waitlist have `course_id` set and `class_id = NULL`.
- Multi-lead assignment and auto-assign settings must be restricted to `SALE_ADMIN` and `ADMIN`.

---

### Task 1: Database Migration for System Settings & SQL Queries

**Files:**
- Create: `database/migrations/00025_add_system_settings.sql`
- Create / Modify: `database/queries/system_settings.sql`
- Generated: `database/generated/system_settings.sql.go`

**Interfaces:**
- Produces: `GetSystemSetting(ctx, key)`, `SetSystemSetting(ctx, db.SetSystemSettingParams)`

- [ ] **Step 1: Create migration `database/migrations/00025_add_system_settings.sql`**
```sql
-- +goose Up
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO system_settings (key, value)
VALUES ('sale_auto_assign_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS system_settings;
```

- [ ] **Step 2: Create queries file `database/queries/system_settings.sql`**
```sql
-- database/queries/system_settings.sql

-- name: GetSystemSetting :one
SELECT key, value, updated_at, updated_by
FROM system_settings
WHERE key = $1;

-- name: UpsertSystemSetting :one
INSERT INTO system_settings (key, value, updated_at, updated_by)
VALUES ($1, $2, NOW(), $3)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by
RETURNING key, value, updated_at, updated_by;
```

- [ ] **Step 3: Run Goose migration locally and run `sqlc generate`**
Run migration against local database and generate sqlc code. Verify compilation.

---

### Task 2: Backend Manual Status Restriction & Bulk Assign Endpoint

**Files:**
- Modify: `apps/api/internal/leads/service.go`
- Modify: `apps/api/internal/leads/handler.go`
- Modify: `apps/api/internal/leads/routing.go`
- Modify: `apps/api/cmd/api/main.go`
- Test: `apps/api/internal/leads/leads_test.go`

**Interfaces:**
- Consumes: `UpdateLeadPipelineStatus`, `AssignLead`
- Produces: 
  - `UpdateStatus(ctx, actorID, leadIDValue, input)` validates only 5 statuses allowed manually: `data_moi`, `knm_thue_bao`, `goi_lai_sau`, `follow`, `tu_choi`. Returns error if `da_dang_ky`, `dang_hoc`, `ket_thuc` passed.
  - `BulkAssign(ctx context.Context, actorID string, input BulkAssignInput) (BulkAssignResult, error)`
  - Endpoint `POST /sale/leads/bulk-assign` guarded by `saleManagerOnly`

- [ ] **Step 1: Write unit test in `leads_test.go` verifying manual status restriction & bulk assign**
Add tests asserting:
- `UpdateStatus` rejects `da_dang_ky` with validation error.
- `UpdateStatus` accepts `follow` or `tu_choi`.
- `BulkAssign` assigns multiple leads to a valid staff member and skips non-existent ones gracefully.

- [ ] **Step 2: Update `UpdateStatus` in `apps/api/internal/leads/service.go`**
Validate:
```go
func isAllowedManualStatus(s db.LeadPipelineStatus) bool {
    switch s {
    case db.LeadPipelineStatusDataMoi,
        db.LeadPipelineStatusKnmThueBao,
        db.LeadPipelineStatusGoiLaiSau,
        db.LeadPipelineStatusFollow,
        db.LeadPipelineStatusTuChoi:
        return true
    default:
        return false
    }
}
```
If `!isAllowedManualStatus(targetStatus)`, return `errors.New("trạng thái này do hệ thống tự động xử lý")`.

- [ ] **Step 3: Implement `BulkAssign` in `apps/api/internal/leads/routing.go`**
```go
type BulkAssignInput struct {
    LeadIDs    []string `json:"lead_ids"`
    AssigneeID string   `json:"assignee_id"`
}

type BulkAssignResult struct {
    Updated int `json:"updated"`
    Failed  int `json:"failed"`
}

func (s *Service) BulkAssign(ctx context.Context, actorID string, input BulkAssignInput) (BulkAssignResult, error)
```
Loop through each lead in transaction, assign, and record audit log.

- [ ] **Step 4: Mount `r.With(saleManagerOnly).Post("/bulk-assign", leadHandler.BulkAssign)` in `cmd/api/main.go`**

- [ ] **Step 5: Run Go tests to verify Task 2 passes**

---

### Task 3: Backend Master Auto-Assign Settings Endpoint & Round-Robin Check

**Files:**
- Modify: `apps/api/internal/leads/routing.go`
- Modify: `apps/api/internal/leads/handler.go`
- Modify: `apps/api/cmd/api/main.go`
- Test: `apps/api/internal/leads/leads_test.go`

**Interfaces:**
- Produces:
  - `GetLeadRoutingSettings(ctx) (RoutingSettingsView, error)`
  - `UpdateLeadRoutingSettings(ctx, actorID, input) (RoutingSettingsView, error)`
  - `getNextRoundRobinStaff(ctx)` checks `sale_auto_assign_enabled` first. If disabled, returns empty UUID (unassigned) without error.
  - Endpoints: `GET /sale/settings/lead-routing` and `PUT /sale/settings/lead-routing` (guarded by `saleManagerOnly`).

- [ ] **Step 1: Write test for master auto-assign setting and disabled round-robin**
- [ ] **Step 2: Implement settings queries & routing check in `routing.go`**
Check `system_settings` for `sale_auto_assign_enabled`. If `false`, return empty UUID so lead remains unassigned.
- [ ] **Step 3: Implement handler and mount routes in `main.go`**
- [ ] **Step 4: Run Go tests to verify Task 3 passes**

---

### Task 4: Backend Order Class Assignment Endpoint & Waitlist Order in Conversion

**Files:**
- Modify: `apps/api/internal/orders/service.go`
- Modify: `apps/api/internal/orders/handler.go`
- Modify: `apps/api/internal/leads/conversion.go`
- Modify: `apps/api/cmd/api/main.go`
- Test: `apps/api/internal/orders/orders_test.go` (or `service_test.go`)

**Interfaces:**
- Produces:
  - `Convert` in `leads/conversion.go`: When `input.ClassID == ""` but `input.CourseID != ""`, create order with `course_id = courseID, class_id = NULL`.
  - `AssignClass(ctx context.Context, actorID string, orderIDValue, classIDValue string) (View, error)` in `orders/service.go`.
    - Validates order exists, is in waitlist (`class_id IS NULL`), status not cancelled.
    - Validates class exists, matches `order.course_id`, has capacity and is open/planning.
    - Updates order `class_id = classID`.
    - Creates `class_enrollments` record for the student in that class.
    - Records audit and class history.
  - Endpoint: `PATCH /sale/orders/{orderID}/assign-class` in `cmd/api/main.go`.

- [ ] **Step 1: Write unit test for `AssignClass` and waitlist conversion**
- [ ] **Step 2: Update `Convert` in `leads/conversion.go` to support `CourseID` when `ClassID` is empty**
- [ ] **Step 3: Implement `AssignClass` in `orders/service.go` and `handler.go`**
- [ ] **Step 4: Mount `r.Patch("/{orderID}/assign-class", orderHandler.AssignClass)` in `cmd/api/main.go`**
- [ ] **Step 5: Run Go tests to verify Task 4 passes**

---

### Task 5: Frontend Lead Pipeline Status Dropdown Restriction

**Files:**
- Modify: `apps/web/src/features/sale/saleShared.tsx`
- Modify: `apps/web/src/features/sale/LeadDetailDrawer.tsx`
- Modify: `apps/web/src/features/sale/LeadProfilePage.tsx`
- Test: `npm test -- --run`

- [ ] **Step 1: Export `MANUAL_PIPELINE_STATUS_OPTIONS` in `saleShared.tsx`**
```tsx
export const MANUAL_PIPELINE_STATUS_OPTIONS: Array<{ value: LeadPipelineStatus; label: string }> = [
  { value: "data_moi", label: "Data mới" },
  { value: "knm_thue_bao", label: "KNM / Thuê bao" },
  { value: "goi_lai_sau", label: "Gọi lại sau" },
  { value: "follow", label: "Follow / Chăm sóc" },
  { value: "tu_choi", label: "Từ chối" },
];
```
- [ ] **Step 2: Update `LeadDetailDrawer.tsx` and `LeadProfilePage.tsx` to use `MANUAL_PIPELINE_STATUS_OPTIONS`**
Replace the status options in the "Chuyển trạng thái Pipeline" modal. Remove checks for `converted_student_id` because `da_dang_ky` is no longer selectable in manual modal.
- [ ] **Step 3: Verify with unit tests**

---

### Task 6: Frontend Bulk Lead Select & Bulk Assign on `LeadPipelinePage`

**Files:**
- Modify: `apps/web/src/features/sale/saleApi.ts`
- Modify: `apps/web/src/features/sale/LeadPipelinePage.tsx`
- Test: `apps/web/src/features/sale/LeadPipelinePage.test.tsx` (or vitest)

- [ ] **Step 1: Add `bulkAssignLeads` to `saleApi.ts`**
```ts
bulkAssignLeads: (data: { lead_ids: string[]; assignee_id: string }) =>
  post<{ updated: number; failed: number }>("/sale/leads/bulk-assign", data),
```
- [ ] **Step 2: Add row selection checkboxes to `LeadPipelinePage.tsx`**
- When `isAdmin` is true:
  - Header checkbox: select all leads on current page.
  - Row checkbox: toggle individual lead selection.
  - Stop propagation on checkbox click so it doesn't trigger row detail drawer.
- [ ] **Step 3: Add Floating Batch Action Bar**
Display sticky or floating pill/bar when `selectedLeadIds.size > 0`:
  - `Đã chọn {selectedLeadIds.size} lead`
  - Select staff dropdown
  - Button "Gán Sale" (calls mutation and clears selection on success)
  - Button "Bỏ chọn"
- [ ] **Step 4: Verify UI and run frontend tests**

---

### Task 7: Frontend Master Auto-Assign Toggle in `/sale/users`

**Files:**
- Modify: `apps/web/src/features/users/usersApi.ts`
- Modify: `apps/web/src/features/users/UserManagementPage.tsx`

- [ ] **Step 1: Add routing settings API calls in `usersApi.ts` or `saleApi.ts`**
`getLeadRoutingSettings()` and `updateLeadRoutingSettings(auto_assign_enabled: boolean)`.
- [ ] **Step 2: Add Master Switch UI in `UserManagementPage.tsx` when `isSaleMode` is true**
In the filter bar / top banner:
Display an iOS-style toggle switch:
`Tự động phân bổ Lead: [BẬT / TẮT]`
With status label and tooltip explaining the round-robin behavior.
- [ ] **Step 3: Connect mutation with query invalidation**

---

### Task 8: Frontend Course Waitlist ("Phòng chờ") & Class Assignment

**Files:**
- Modify: `apps/web/src/features/sale/saleApi.ts`
- Modify: `apps/web/src/features/sale/CreateRegistrationOrderModal.tsx`
- Modify: `apps/web/src/features/sale/LeadConvertPage.tsx`
- Modify: `apps/web/src/features/sale/SaleRegistrationOrdersPage.tsx`

- [ ] **Step 1: Add `assignOrderClass` to `saleApi.ts`**
```ts
assignOrderClass: (orderId: string, classId: string) =>
  patch<Order>(`/sale/orders/${orderId}/assign-class`, { class_id: classId }),
```
- [ ] **Step 2: Update `CreateRegistrationOrderModal.tsx`**
Add enrollment mode switch:
- `Lớp học đang tuyển sinh` (requires choosing from `availableClasses`)
- `Phòng chờ (Chưa mở lớp)` (requires choosing from `coursesQuery.data`)
When "Phòng chờ" is chosen, validate course selection, pass `course_id`, and omit `class_id`.
- [ ] **Step 3: Update `LeadConvertPage.tsx`**
Under "Chọn lớp học mở ghi danh":
Add option for `[Phòng chờ] Chưa mở lớp - Chọn khóa học`.
When chosen, show course selector dropdown and convert with `course_id`.
- [ ] **Step 4: Update `SaleRegistrationOrdersPage.tsx`**
- If `!order.class_id`:
  - Show Badge `Phòng chờ` (amber tone) with `order.course_name || order.course_code`.
  - Add button `Xếp lớp` in actions.
  - Implement lightweight Modal `Xếp lớp cho Học viên`: displays open/planning classes of that course, with button to confirm class assignment.
- [ ] **Step 5: Run tests and lint**

---

### Task 9: Verification & Local Testing

**Files:** All modified files across `apps/api` and `apps/web`.

- [ ] **Step 1: Run Go backend tests**
`cd apps/api; go test -v -count=1 ./...`
- [ ] **Step 2: Run Frontend lint and tests**
`cd apps/web; npm run lint; npm test -- --run; npm run build`
- [ ] **Step 3: Manual validation via browser or curls against local daemons**
- [ ] **Step 4: Summarize all deliverables for user review**
