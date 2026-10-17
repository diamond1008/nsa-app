# Admissions CRM Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai trọn gói 4 tính năng nâng cấp cho phân hệ Tuyển sinh NSA App: Chế độ xem Kanban Pipeline (kéo-thả), Xuất Excel (.xlsx) chuẩn cho Lead & Đơn hàng, Cảnh báo trùng lặp Lead (SĐT/Email) và Tự động chia Lead xoay vòng (Round-Robin).

**Architecture:** 
- Backend Go xử lý nghiệp vụ kiểm tra trùng lặp thời gian thực, lưu trữ bộ đếm nguyên tử atomic cho Round-Robin, sinh file `.xlsx` định dạng chuyên nghiệp bằng thư viện `excelize/v2` trực tiếp từ database.
- Frontend React (Vite + Tailwind + TanStack Query) bổ sung component Kanban Board kéo thả linh hoạt, cảnh báo trùng lặp ngay khi nhập liệu và các nút xuất báo cáo Excel tiện lợi.

**Tech Stack:** Go 1.26, chi router, pgx/v5, sqlc, excelize/v2, React 19, TypeScript, TanStack Query v5, Tailwind CSS, Lucide icons.

## Global Constraints
- Tuân thủ kiến trúc modular monolith của dự án (`apps/api/internal/leads`, `apps/api/internal/orders`, `apps/web/src/features/sale`).
- Không tạo breaking change trên các API hiện có.
- File Excel xuất ra phải có định dạng đẹp, mã hóa font tiếng Việt chuẩn UTF-8, cột tiền tệ VND và ngày giờ rõ ràng.
- Giữ nguyên toàn bộ comment và docstring hiện tại.

---

### Task 1: Backend Duplicate Check & Round-Robin Assignment Logic

**Files:**
- Modify: `database/queries/leads.sql`
- Generate: `database/generated/leads.sql.go`
- Modify: `apps/api/internal/leads/models.go`
- Modify: `apps/api/internal/leads/service.go`
- Modify: `apps/api/internal/leads/handler.go`
- Test: `apps/api/internal/leads/leads_test.go`

**Interfaces:**
- Consumes: `leads` table, `users` table, `user_roles` table
- Produces:
  - `GET /api/v1/sale/leads/check-duplicate?phone={phone}&email={email}&exclude_id={id}`
  - Round-robin auto assignment when `assigned_to` is omitted or empty

- [ ] **Step 1: Write SQL query for checking duplicate lead**

Add `FindDuplicateLead` query to `database/queries/leads.sql`:
```sql
-- name: FindDuplicateLead :one
SELECT
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.pipeline_status,
  l.assigned_to,
  l.created_at,
  u.email AS assigned_to_email
FROM leads l
LEFT JOIN users u ON u.id = l.assigned_to
WHERE (
  (sqlc.narg(phone)::text IS NOT NULL AND sqlc.narg(phone)::text <> '' AND l.phone = sqlc.narg(phone)::text)
  OR
  (sqlc.narg(email)::citext IS NOT NULL AND sqlc.narg(email)::citext <> '' AND l.email = sqlc.narg(email)::citext)
)
AND (
  sqlc.narg(exclude_id)::uuid IS NULL
  OR l.id <> sqlc.narg(exclude_id)::uuid
)
ORDER BY l.created_at DESC
LIMIT 1;
```

- [ ] **Step 2: Run sqlc generate**

Run: `sqlc generate` in `d:\Work\Self-project\nsa-app`
Verify: `database/generated/leads.sql.go` contains `FindDuplicateLead`.

- [ ] **Step 3: Define models and write duplicate check & round robin service methods**

In `apps/api/internal/leads/models.go`:
```go
type DuplicateCheckResponse struct {
	IsDuplicate    bool                `json:"is_duplicate"`
	DuplicateField string              `json:"duplicate_field,omitempty"`
	ExistingLead   *ExistingLeadSummary `json:"existing_lead,omitempty"`
}

type ExistingLeadSummary struct {
	ID              string `json:"id"`
	FullName        string `json:"full_name"`
	Phone           string `json:"phone,omitempty"`
	Email           string `json:"email,omitempty"`
	PipelineStatus  string `json:"pipeline_status"`
	AssignedToEmail string `json:"assigned_to_email,omitempty"`
	CreatedAt       string `json:"created_at"`
}
```

In `apps/api/internal/leads/service.go`:
Add atomic round-robin counter and round-robin assigner:
```go
var roundRobinCounter uint64

func (s *Service) getNextRoundRobinStaff(ctx context.Context) (uuid.UUID, error) {
	staffList, err := s.queries.ListSaleStaff(ctx)
	if err != nil || len(staffList) == 0 {
		return uuid.Nil, err
	}
	idx := atomic.AddUint64(&roundRobinCounter, 1) % uint64(len(staffList))
	return staffList[idx].ID, nil
}
```
If `input.AssignedTo == nil || *input.AssignedTo == uuid.Nil`, assign via `getNextRoundRobinStaff`.
Add `CheckDuplicate(ctx context.Context, phone, email string, excludeID *uuid.UUID) (*DuplicateCheckResponse, error)`.

- [ ] **Step 4: Add HTTP route & handler**

In `apps/api/internal/leads/handler.go`:
Mount `r.Get("/check-duplicate", h.checkDuplicate)`
Parse `phone`, `email`, `exclude_id`, call service, return JSON.

- [ ] **Step 5: Run tests**

Run: `go test ./internal/leads/... -v`
Expected: PASS.

---

### Task 2: Backend Native Excel Export (.xlsx) for Leads & Orders

**Files:**
- Modify: `database/queries/leads.sql` (Add `ListAllLeadsForExport`)
- Modify: `database/queries/orders.sql` (Add `ListAllOrdersForExport`)
- Generate: `sqlc generate`
- Modify: `apps/api/internal/leads/service.go` & `handler.go`
- Modify: `apps/api/internal/orders/service.go` & `handler.go`
- Test: `apps/api/internal/leads/leads_test.go` & `apps/api/internal/orders/orders_test.go`

**Interfaces:**
- Produces:
  - `GET /api/v1/sale/leads/export` -> `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `GET /api/v1/sale/orders/export` -> `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

- [ ] **Step 1: Write queries without limit/offset for export**

Add `ListAllLeadsForExport` in `database/queries/leads.sql` and `ListAllOrdersForExport` in `database/queries/orders.sql`.
Run `sqlc generate`.

- [ ] **Step 2: Implement Excel generation for Leads**

In `apps/api/internal/leads/service.go`:
Use `github.com/xuri/excelize/v2` to create `.xlsx`:
- Sheet "Danh sách Lead"
- Columns: STT, Họ và tên, Số điện thoại, Email, Giới tính, Ngày sinh, Nguồn tiếp cận, Khóa học quan tâm, Trạng thái Pipeline, Nhân viên phụ trách, Ghi chú, Ngày tạo.
- Style: Header background `#0A2540`, text white bold, borders, auto width.
- Return `*excelize.File`.

- [ ] **Step 3: Implement Excel generation for Orders**

In `apps/api/internal/orders/service.go`:
- Sheet "Danh sách Đơn hàng"
- Columns: STT, Mã đơn hàng, Tên học viên / Lead, Mã học viên, Khóa học, Lớp học, Học phí gốc, Giảm giá, Thành tiền (VND), Trạng thái, Phương thức TT, Ngày thanh toán, Ngày tạo.
- Return `*excelize.File`.

- [ ] **Step 4: Implement HTTP handlers for export**

Set headers:
```go
w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
```
Write buffer to `w`.

- [ ] **Step 5: Run tests**

Run: `go test ./...` in `apps/api`
Expected: PASS.

---

### Task 3: Frontend API & Excel Export & Duplicate Warning in Create Modal

**Files:**
- Modify: `apps/web/src/features/sale/saleApi.ts`
- Modify: `apps/web/src/features/sale/LeadPipelinePage.tsx`
- Modify: `apps/web/src/features/sale/OrdersPage.tsx`
- Test: `apps/web/src/features/sale/SalePages.test.tsx`

- [ ] **Step 1: Update saleApi.ts**

Add:
- `checkDuplicate: (params: { phone?: string; email?: string; exclude_id?: string }) => get<DuplicateCheckResponse>(...)`
- `exportLeads: (params: LeadListParams) => apiDownload(...)`
- `exportOrders: (params: OrderListParams) => apiDownload(...)`

- [ ] **Step 2: Add Real-time Duplicate Warning in Lead Create Modal**

In `LeadPipelinePage.tsx`:
- When typing phone or email, debounce 400ms and call `saleApi.checkDuplicate`.
- If `is_duplicate == true`, show inline warning box with existing lead's name, status, and assigned staff, with clear message that user may still proceed.

- [ ] **Step 3: Add "Xuất Excel" buttons**

- In `LeadPipelinePage.tsx`: Add button "Xuất Excel" next to "Nhập từ Excel/CSV", calls `handleExportLeads`.
- In `OrdersPage.tsx`: Add button "Xuất Excel", calls `handleExportOrders`.

- [ ] **Step 4: Run frontend tests**

Run: `npm test` in `apps/web`
Expected: PASS.

---

### Task 4: Frontend Interactive Kanban Board with Drag & Drop

**Files:**
- Create: `apps/web/src/features/sale/LeadKanbanBoard.tsx`
- Modify: `apps/web/src/features/sale/LeadPipelinePage.tsx`
- Test: `apps/web/src/features/sale/SalePages.test.tsx`

- [ ] **Step 1: Create LeadKanbanBoard.tsx**

- Columns representing pipeline stages: `data_moi`, `knm_thue_bao`, `goi_lai_sau`, `follow`, `tu_choi`, `da_dang_ky`.
- Support native HTML5 Drag and Drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`).
- Each card shows: Full name, phone, course name, assigned staff email, created date, quick link to Lead Profile and Quick Convert.
- On drop: Triggers `onStatusChange(leadId, newStatus)` with optimistic update and feedback toast.

- [ ] **Step 2: Integrate View Toggle into LeadPipelinePage.tsx**

- Add state `viewMode: "table" | "kanban"`.
- Add toggle pill buttons: `[📋 Bảng | 📊 Kanban Pipeline]`.
- Persist selection in localStorage or URL query parameter.
- Seamlessly share existing filters (Search, Staff, Source, Date range) across both Table and Kanban modes.

- [ ] **Step 3: Run full verification tests**

Run:
1. `npm test` in `apps/web`
2. `npm run build` in `apps/web`
3. Verify local UI in browser at `http://localhost:5173`.
