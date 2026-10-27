# Executive Sales Dashboard 2.0 (Tổng quan Phòng Tuyển sinh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Dashboard Quản lý Tuyển sinh toàn diện, trực quan với câu chữ thuần Việt gọn gàng: bao gồm thanh chỉ tiêu tháng, cảnh báo việc nóng, biểu đồ xu hướng 30 ngày, xếp hạng sale, top khóa học hot và luồng học viên chốt đơn mới.

**Architecture:** Mở rộng các truy vấn SQLC trong PostgreSQL, cập nhật DTOs trong Go API (`leads` & `orders`), đồng bộ domain types TypeScript, và nâng cấp component `ExecutiveSalesDashboard.tsx` với bố cục 6 khối tối ưu.

**Tech Stack:** Go (pgx/v5, sqlc), PostgreSQL, React 19, TypeScript, TanStack React Query, Tailwind CSS, Vitest.

## Global Constraints
- Làm việc trực tiếp tại repository: `d:\Work\Self-project\nsa-app`.
- Từ ngữ giao diện thuần Việt tự nhiên, ngắn gọn, dứt khoát; không dùng từ ngữ "AI / văn mẫu", không thêm các dấu ngoặc giải thích rườm rà.
- KHÔNG tự ý `git commit` hay `git push` nếu chưa có sự đồng ý của người dùng.
- Bảo đảm 100% test pass (`npm test`, `go test ./...`) và không có lỗi kiểu TypeScript (`npm run typecheck`).

---

## Tasks

- [ ] **Task 1: Bổ sung SQL Queries cho Cảnh báo, Xu hướng 30 ngày & Top Khóa học**
  - **Files:** `database/queries/leads.sql`, `database/queries/orders.sql`
  - Thêm `CountUnassignedLeads`: đếm lead chưa gán người phụ trách và chưa bị xóa.
  - Thêm `CountTeamOverdueTasks`: đếm việc tư vấn chưa hoàn tất có `due_at < NOW()`.
  - Thêm `GetDailyLeadTrend`: đếm lead tạo và lead chốt theo từng ngày trong 30 ngày gần nhất.
  - Thêm `GetDailyRevenueTrend`: tính tổng tiền các đơn đã thanh toán theo ngày trong 30 ngày gần nhất.
  - Thêm `GetTopCoursesRevenue`: xếp hạng các khóa học theo số lượng học viên chốt và doanh thu.
  - Chạy `sqlc generate`.
  - **Verification:** Kiểm tra file Go sinh ra trong `database/generated/` có các struct và phương thức tương ứng.

- [ ] **Task 2: Cập nhật Backend Go Models & Services**
  - **Files:** `apps/api/internal/leads/models.go`, `apps/api/internal/leads/service.go`, `apps/api/internal/orders/models.go`, `apps/api/internal/orders/service.go`
  - Bổ sung `ActionAlerts` (khách chưa chia, việc quá hạn, đơn nợ) và `DailyLeadTrend` vào `DashboardOverviewView`.
  - Bổ sung `DailyRevenueTrend` và `TopCourses` vào `RevenueReportView`.
  - Cập nhật service logic gọi SQLC queries và map dữ liệu trả về client.
  - **Verification:** Chạy `go test ./internal/leads/... ./internal/orders/...` và `go build ./cmd/api`.

- [ ] **Task 3: Đồng bộ Frontend Domain Types & API Client**
  - **Files:** `apps/web/src/lib/domainTypes.ts`, `apps/web/src/features/sale/saleApi.ts`
  - Khai báo các interface: `DailyLeadTrendPoint`, `DailyRevenueTrendPoint`, `ActionAlerts`, `TopCourseStat`.
  - Cập nhật `DashboardOverview` và `RevenueReport` để nhận các trường mới.
  - **Verification:** Chạy `npm run typecheck` trong `apps/web` đảm bảo 0 lỗi.

- [ ] **Task 4: Nâng cấp Giao diện `ExecutiveSalesDashboard.tsx` & `SaleDashboardPage.tsx`**
  - **Files:** `apps/web/src/features/sale/ExecutiveSalesDashboard.tsx`, `apps/web/src/features/sale/SaleDashboardPage.tsx`
  - Triển khai 6 khối giao diện theo thiết kế:
    1. Header & Switcher ("Toàn phòng" / "Cá nhân").
    2. 4 StatCards & Thanh đo "Chỉ tiêu tháng này".
    3. Cảnh báo "Việc cần xử lý ngay" (3 thẻ: "Khách mới chưa chia", "Lịch gọi / Hẹn tư vấn trễ hạn", "Học viên còn nợ học phí").
    4. "Xu hướng Doanh thu & Tuyển sinh" (Biểu đồ SVG trực quan 30 ngày).
    5. Xếp hạng Doanh số Nhân viên + Phễu chuyển đổi & Nguồn khách + Khóa học đăng ký nhiều nhất.
    6. "Học viên vừa chốt & Phiếu thu gần đây".
  - Sử dụng toàn bộ từ ngữ chuẩn, loại bỏ các ngoặc chú thích dư thừa theo yêu cầu người dùng.
  - **Verification:** Chạy `npm run typecheck`.

- [ ] **Task 5: Kiểm thử Toàn diện & Xác thực Hệ thống**
  - **Files:** `apps/web/src/features/sale/SalePages.test.tsx`
  - Cập nhật mock dữ liệu cho overview và revenue trong test suite.
  - Chạy `npm test` trong `apps/web` (21 test files, 86+ tests).
  - Chạy `npm run build` kiểm tra đóng gói bundle.
  - Khởi động lại API server và Vite server local để sẵn sàng cho người dùng trải nghiệm.
