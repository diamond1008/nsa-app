# Executive Sales Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Executive Sales Dashboard trực quan, toàn diện cho Quản lý Sale (`SALE_ADMIN`) và Admin (`ADMIN`) trên NSA Training Platform, bao quát doanh thu phòng, bảng xếp hạng đội ngũ Sale (kèm doanh số cá nhân), phễu chuyển đổi tuyển sinh và dòng học viên vừa chốt thời gian thực.

**Architecture:** Nâng cấp truy vấn SQLC `CountLeadsByAssignee` để tính tổng doanh thu thực thu trong tháng cho từng nhân viên Sale; tạo mới component `ExecutiveSalesDashboard.tsx` tích hợp 4 thẻ KPI đỉnh cao, Bảng vinh danh Sale (Leaderboard), Thanh phễu chuyển đổi, Cơ cấu nguồn doanh thu và Bảng học viên vừa chốt; phân nhánh giao diện tự động tại `SaleDashboardPage.tsx` theo quyền người dùng.

**Tech Stack:** Go 1.24, PostgreSQL, SQLC, React 19, TypeScript, Tailwind CSS, TanStack React Query v5.

## Global Constraints

- Preserve all Clean Architecture boundaries: database queries in `database/queries/`, handlers in `apps/api/internal/`, UI in `apps/web/src/features/sale/`.
- Ensure zero regression on existing regular Sale specialist personal workflow.
- Do NOT run `git commit` or `git push` without explicit user permission.
- All Go tests (`go test ./...`) and TypeScript checks (`npm run typecheck`, `npm run build`) must pass 100% cleanly.

---

### Task 1: Nâng cấp SQLC Query cho Doanh số Nhân viên Sale (`database/queries/leads.sql`)

**Files:**
- Modify: `database/queries/leads.sql:220-233`
- Generated: `database/generated/leads.sql.go`

**Interfaces:**
- Consumes: PostgreSQL `users`, `user_roles`, `roles`, `leads`, `orders`.
- Produces: `db.CountLeadsByAssigneeRow` containing `MonthRevenue pgtype.Numeric`.

- [ ] **Step 1: Cập nhật câu truy vấn `CountLeadsByAssignee` trong `database/queries/leads.sql`**

Thêm trường `month_revenue` tính tổng tiền các đơn `paid` trong tháng hiện tại theo múi giờ `Asia/Ho_Chi_Minh` cho từng chuyên viên:

```sql
-- name: CountLeadsByAssignee :many
SELECT
  u.id AS user_id,
  u.email,
  COUNT(l.id)::bigint AS total_leads,
  COUNT(l.id) FILTER (WHERE l.pipeline_status = 'da_dang_ky')::bigint AS converted_leads,
  COALESCE(
    (
      SELECT SUM(o.final_amount)
      FROM orders o
      WHERE (o.created_by = u.id OR o.lead_id IN (SELECT l2.id FROM leads l2 WHERE l2.assigned_to = u.id))
        AND o.status = 'paid'
        AND DATE_TRUNC('month', o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ), 0
  )::numeric AS month_revenue
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
LEFT JOIN leads l ON l.assigned_to = u.id AND l.deleted_at IS NULL
WHERE r.code IN ('SALE', 'SALE_ADMIN', 'ADMIN') AND u.status = 'active'
GROUP BY u.id, u.email
ORDER BY month_revenue DESC, converted_leads DESC, total_leads DESC;
```

- [ ] **Step 2: Chạy lệnh `sqlc generate`**

Run: `cd d:\Work\Self-project\nsa-app && sqlc generate`
Expected: `database/generated/leads.sql.go` được cập nhật với `MonthRevenue pgtype.Numeric` trong `CountLeadsByAssigneeRow`.

---

### Task 2: Cập nhật Backend Model & Service (`apps/api/internal/leads/`)

**Files:**
- Modify: `apps/api/internal/leads/models.go:145-155`
- Modify: `apps/api/internal/leads/service.go:520-540`
- Test: `apps/api/internal/leads/leads_test.go`

**Interfaces:**
- Consumes: `CountLeadsByAssigneeRow` from `db`.
- Produces: `DashboardOverviewView` with `ByAssignee []AssigneeStat` containing `MonthRevenue float64`.

- [ ] **Step 1: Cập nhật struct `AssigneeStat` trong `apps/api/internal/leads/models.go`**

```go
type AssigneeStat struct {
	UserID         string  `json:"user_id"`
	Email          string  `json:"email"`
	TotalLeads     int64   `json:"total_leads"`
	ConvertedLeads int64   `json:"converted_leads"`
	MonthRevenue   float64 `json:"month_revenue"`
}
```

- [ ] **Step 2: Ánh xạ `MonthRevenue` trong `DashboardOverview` (`apps/api/internal/leads/service.go`)**

```go
	byAssignee := make([]AssigneeStat, 0, len(assigneeRows))
	for _, r := range assigneeRows {
		byAssignee = append(byAssignee, AssigneeStat{
			UserID:         data.UUIDString(r.UserID),
			Email:          r.Email,
			TotalLeads:     r.TotalLeads,
			ConvertedLeads: r.ConvertedLeads,
			MonthRevenue:   data.NumericFloat(r.MonthRevenue),
		})
	}
```

- [ ] **Step 3: Chạy unit test backend**

Run: `cd apps/api && go test -v ./internal/leads/...`
Expected: PASS 100%.

---

### Task 3: Đồng bộ Frontend Domain Types & API Client (`apps/web/`)

**Files:**
- Modify: `apps/web/src/lib/domainTypes.ts`

**Interfaces:**
- Consumes: JSON response from `/sale/dashboard/overview`.
- Produces: TypeScript interface `AssigneeStat` with `month_revenue: number`.

- [ ] **Step 1: Cập nhật `AssigneeStat` trong `apps/web/src/lib/domainTypes.ts`**

```ts
export interface AssigneeStat {
  user_id: string;
  email: string;
  total_leads: number;
  converted_leads: number;
  month_revenue?: number;
}
```

- [ ] **Step 2: Chạy kiểm tra kiểu TypeScript**

Run: `cd apps/web && npm run typecheck`
Expected: PASS (0 error).

---

### Task 4: Xây dựng Component `ExecutiveSalesDashboard.tsx`

**Files:**
- Create: `apps/web/src/features/sale/ExecutiveSalesDashboard.tsx`

**Interfaces:**
- Consumes:
  - `saleApi.getOverview()` (`["sale", "dashboard", "overview"]`)
  - `saleApi.getRevenueReport()` (`["sale", "dashboard", "revenue"]`)
  - `saleApi.listOrders({ per_page: 8 })` (`["sale", "orders", "recent"]`)
  - `saleApi.getMyStats()` (`["sale", "dashboard", "my-stats"]`)
- Produces: Rich interactive executive dashboard with Top KPI cards, Sale Leaderboard, Funnel visual bars, Source distribution, and Live converted students stream.

- [x] **Step 1: Tạo file `apps/web/src/features/sale/ExecutiveSalesDashboard.tsx`**

Bao gồm:
1. **Header hành động nhanh**: Nút Quản lý Lead, Phân bổ Lead tự động, Báo cáo chi tiết.
2. **Hàng 4 Thẻ KPI Đỉnh cao**:
   - `Doanh số phòng Sale tháng`: Tổng tiền thực thu (`summary.month_revenue`), số đơn đã hoàn tất.
   - `Học viên chốt mới`: Số lượng học viên chốt trong tháng (`totalConverted`), Tỷ lệ chuyển đổi toàn viện (`%`).
   - `Quy mô Lead & Tồn đọng`: Tổng lead trong hệ thống, số lead mới hôm nay.
   - `Giá trị đơn trung bình (AOV)`: `summary.month_revenue / summary.month_paid_orders`.
3. **Khu vực Trung tâm (2 Cột 7-5)**:
   - Cột Trái (60%): **Bảng Xếp hạng Đội ngũ Sale (Leaderboard)**:
     - Huy hiệu #1 (Vàng), #2 (Bạc), #3 (Đồng).
     - Tên/Email, Lead được giao, Học viên chốt, Doanh số tháng (VND đậm màu xanh), Tỷ lệ chốt %.
     - Nút "Xem học viên" để kích hoạt filter bảng học viên bên dưới.
   - Cột Phải (40%): **Trực quan hóa Phễu & Nguồn Data**:
     - Funnel Bars trực quan: Data mới $\rightarrow$ KNM/Thuê bao $\rightarrow$ Follow/Gọi lại $\rightarrow$ Đã đăng ký (kèm thanh progress bar tỷ lệ).
     - Cơ cấu Nguồn Lead & Doanh thu: Facebook, TikTok, Website, Referral...
4. **Khu vực Dưới: Live Converted Students & Orders Stream**:
   - Bảng danh sách học viên mới chốt gần nhất: Mã HV, Tên, Lớp học, Học phí, Chuyên viên Sale, Trạng thái thanh toán (100% hoặc Trả góp), Ngày chốt.
   - Nút liên kết trực tiếp tới Hồ sơ Học viên 360° (`/sale/hoc-vien/:id`) và In biên lai.

- [x] **Step 2: Xác thực TypeScript không có lỗi**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

---

### Task 5: Tách Nhánh Giao Diện tại `SaleDashboardPage.tsx`

**Files:**
- Modify: `apps/web/src/features/sale/SaleDashboardPage.tsx`

**Interfaces:**
- Consumes: `useAuth().hasRole("ADMIN", "SALE_ADMIN")`.
- Produces: Conditional rendering: `<ExecutiveSalesDashboard />` for managers, `<PersonalSaleDashboard />` for regular sale staff.

- [ ] **Step 1: Refactor `SaleDashboardPage.tsx`**

- Trích xuất phần giao diện cũ dành cho cá nhân chuyên viên thành component nội bộ `PersonalSaleDashboard`.
- Trong `SaleDashboardPage`:
  ```tsx
  export function SaleDashboardPage() {
    const { hasRole } = useAuth();
    const isSaleAdmin = hasRole("ADMIN", "SALE_ADMIN");

    if (isSaleAdmin) {
      return <ExecutiveSalesDashboard />;
    }

    return <PersonalSaleDashboard />;
  }
  ```

- [ ] **Step 2: Chạy kiểm tra typecheck và build**

Run: `cd apps/web && npm run typecheck && npm run build`
Expected: PASS (0 error, build success).

---

### Task 6: Kiểm Thử Toàn Diện & Nghiệm Thu Hệ Thống

**Files:**
- Test all: Backend Go, Frontend React.

- [ ] **Step 1: Backend Go Tests**

Run: `cd apps/api && go vet ./... && go test -v ./... && go build ./...`
Expected: 100% PASS, 0 error.

- [ ] **Step 2: Frontend React Tests & Build**

Run: `cd apps/web && npm run typecheck && npm run build`
Expected: 100% PASS, production bundle created cleanly.

- [ ] **Step 3: Khởi động và kiểm tra thực tế trên trình duyệt**

- Backend: `http://localhost:8080/health` -> `status: ok`
- Frontend: `http://localhost:5173/sale`
- Xác nhận tài khoản `sale_admin@nsa.local` hiển thị Executive Sales Dashboard trực quan, đầy đủ chỉ số, leaderboard, funnel và bảng học viên chốt.
