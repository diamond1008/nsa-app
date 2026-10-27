# Executive Sales Dashboard Design Specification

- **Author**: Principal Software Architect & Senior Full-stack Engineer
- **Date**: 2026-10-22
- **Status**: Approved by User
- **Target Systems**: `apps/api`, `apps/web`, `database/`

---

## 1. Executive Summary & Goals

Trang chủ hiện tại của phân hệ Tuyển sinh (`/sale` - `SaleDashboardPage.tsx`) chủ yếu tập trung vào luồng tác nghiệp cá nhân của một chuyên viên tư vấn (KPI cá nhân, nhắc việc cá nhân, 5 lead mới). Đối với cấp Quản lý Tuyển sinh (`SALE_ADMIN`) và Ban Giám đốc (`ADMIN`), giao diện này quá sơ sài, thiếu tính bao quát và không phản ánh được bức tranh kinh doanh tổng thể.

Mục tiêu của đợt nâng cấp này là xây dựng **Executive Sales Dashboard** (Trung tâm Chỉ huy Tuyển sinh & Doanh thu Toàn diện) dành riêng cho vai trò quản lý (`SALE_ADMIN`, `ADMIN`), trong khi vẫn bảo toàn Bàn làm việc cá nhân cho chuyên viên tư vấn (`SALE`):
1. **Bao quát toàn bộ đội ngũ Sale**: Bảng vinh danh và xếp hạng hiệu suất từng chuyên viên (Số Lead, Số Học viên chốt, Doanh thu đóng góp, Tỷ lệ chuyển đổi).
2. **Theo dõi học viên của Sale trong thời gian thực**: Bảng dòng thời gian (Live Stream) các học viên vừa được chốt thành công trên toàn viện (Mã HV, Khóa/Lớp học, Học phí, Tiến độ đóng tiền, Sale phụ trách).
3. **Doanh thu & Phễu chuyển đổi trực quan**: Doanh số thực thu tháng, Giá trị đơn hàng trung bình (AOV), Biểu đồ phễu tuyển sinh (Funnel drop-off) và Cơ cấu doanh thu theo nguồn khách (Facebook, TikTok, Website, Referral...).
4. **Tương tác trực quan & Điều hướng thông minh**: Cho phép lọc nhanh danh sách học viên theo từng Sale ngay tại Dashboard, mở nhanh Hồ sơ Học viên 360° (`/sale/hoc-vien/:id`) hoặc Phiếu thu.

---

## 2. Phân Quyền & Hành Vi Theo Vai Trò (Role-based Behavior)

| Vai trò người dùng | Giao diện hiển thị tại `/sale` | Mục tiêu chính |
| :--- | :--- | :--- |
| **`SALE`** (Chuyên viên tư vấn) | **Bàn làm việc Tư vấn cá nhân** | Quản lý danh sách Lead được gán, theo dõi lịch hẹn / nhắc việc hôm nay, tự hoàn thành task và theo dõi KPI doanh số cá nhân. |
| **`SALE_ADMIN`**, **`ADMIN`** (Quản lý / Ban Giám đốc) | **Executive Sales Dashboard** | Theo dõi sức khỏe toàn phòng, doanh thu tháng, xếp hạng hiệu suất chuyên viên, dòng tiền học phí và các học viên vừa chốt toàn viện. |

---

## 3. Kiến Trúc Dữ Liệu & Backend API (`apps/api`, `database/`)

### 3.1. Nâng cấp truy vấn thống kê đội ngũ (`database/queries/leads.sql`)
Cập nhật câu truy vấn `CountLeadsByAssignee` để tính thêm doanh thu thực thu trong tháng (`month_revenue`) của từng nhân viên:

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

### 3.2. Cập nhật Model & Service Backend
- Trong `apps/api/internal/leads/models.go`:
  ```go
  type AssigneeStat struct {
      UserID         string  `json:"user_id"`
      Email          string  `json:"email"`
      TotalLeads     int64   `json:"total_leads"`
      ConvertedLeads int64   `json:"converted_leads"`
      MonthRevenue   float64 `json:"month_revenue"`
  }
  ```
- Trong `apps/api/internal/leads/service.go`: ánh xạ trường `MonthRevenue: data.NumericFloat(r.MonthRevenue)` vào kết quả trả về của `DashboardOverview`.

### 3.3. Các API phụ trợ sẵn sàng
- `GET /sale/dashboard/revenue`: Trả về `summary` (Doanh thu tháng, Doanh thu tích lũy, Số đơn hàng, Đơn đã thanh toán), `by_month` và `by_source`.
- `GET /sale/orders?per_page=8`: Trả về danh sách 8 đơn hàng / học viên mới chốt gần nhất kèm chi tiết lớp học, học phí, tiền tố phiếu thu và chuyên viên lập.

---

## 4. Thiết Kế Giao Diện Frontend (`apps/web/`)

Tách component rõ ràng theo nguyên tắc Single Responsibility:
1. `SaleDashboardPage.tsx`: Đóng vai trò Router phân nhánh dựa trên `isSaleAdmin`:
   - Nếu `isSaleAdmin === true`: Render `<ExecutiveSalesDashboard />`.
   - Nếu `isSaleAdmin === false`: Render `<PersonalSaleDashboard />`.
2. Tạo component chuyên biệt `ExecutiveSalesDashboard.tsx` với 4 khối phân cấp thị giác:

### 4.1. Khối 1: Header & 4 Thẻ KPI Đỉnh Cao
- **Header**: Tiêu đề "Trung tâm Điều hành Tuyển sinh & Doanh thu", kèm các nút hành động nhanh: *Quản lý Lead*, *Phân bổ tự động*, *Xem báo cáo chi tiết*.
- **4 StatCards**:
  1. **Doanh số phòng Sale tháng**: Format VND (`#0532e6` / xanh ngọc), số đơn hàng đã hoàn tất trong tháng.
  2. **Học viên chốt mới**: Số học viên đã chuyển đổi trong tháng kèm Tỷ lệ chốt toàn viện (`converted / total %`).
  3. **Quy mô Lead & Tồn đọng**: Tổng Lead đang chăm sóc, số Lead mới tiếp nhận hôm nay.
  4. **Giá trị đơn trung bình (AOV)**: `month_revenue / month_paid_orders` (hoặc `total_orders`).

### 4.2. Khối 2: Bảng Vinh Danh & Hiệu Suất Đội Ngũ Sale (Leaderboard - 60% Width)
- Hiển thị danh sách nhân viên Sale sắp xếp theo Doanh số tháng giảm dần:
  - Cột 1: Xếp hạng (#1, #2, #3 có huy hiệu Vàng, Bạc, Đồng), Email / Tên.
  - Cột 2: Số Lead phụ trách.
  - Cột 3: Số Học viên đã chốt.
  - Cột 4: Doanh số mang về tháng này (VND đậm).
  - Cột 5: Tỷ lệ chuyển đổi (`%`).
  - Thao tác: Bấm nút "Lọc đơn" để filter bảng học viên bên dưới theo nhân viên đó.

### 4.3. Khối 3: Trực Quan Hóa Phễu Chuyển Đổi & Nguồn Khách (40% Width)
- **Thanh Phễu Tuyển sinh (Visual Conversion Funnel)**:
  - 4 tầng phễu: Data mới $\rightarrow$ KNM/Thuê bao $\rightarrow$ Follow/Chăm sóc $\rightarrow$ Đã chốt thành học viên.
  - Mỗi tầng hiển thị thanh tiến độ ngang (Progress bar), số lượng Lead và tỷ lệ phần trăm tương đối.
- **Cơ cấu Doanh thu & Lead theo Nguồn (Source Breakdown)**:
  - Tỷ lệ phần trăm và huy hiệu trực quan cho từng kênh: Facebook, TikTok, Website, Zalo, Giới thiệu (Referral)...

### 4.4. Khối 4: Bảng Học Viên Vừa Chốt & Đơn Hàng Mới Nhất Toàn Phòng (Live Stream)
- Bảng danh sách học viên mới chốt gần nhất:
  - **Mã & Họ tên Học viên**: Mã `HV...` màu xanh kèm họ tên, bấm để mở Drawer hoặc trang Hồ sơ 360°.
  - **Lớp & Khóa học**: Tên lớp, mã lớp đang tuyển sinh.
  - **Học phí & Ưu đãi**: Số tiền thực tế sau ưu đãi.
  - **Tiến độ thanh toán**: Huy hiệu Đã đóng 100% hoặc Trả góp đợt $x/y$.
  - **Chuyên viên Sale phụ trách**: Email chuyên viên chốt.
  - **Thời gian**: Ngày chốt giao dịch.
  - **Thao tác nhanh**: Nút "Hồ sơ 360°" và "Biên lai / Phiếu thu".

---

## 5. Tiêu Chuẩn Kiểm Thử & Nghiệm Thu (Acceptance Criteria)

1. **Backend Verification**:
   - Chạy `sqlc generate` thành công.
   - `cd apps/api && go vet ./...` không có lỗi.
   - `cd apps/api && go test -v ./...` vượt qua 100% test cases.
   - `cd apps/api && go build ./...` biên dịch sạch.
2. **Frontend Verification**:
   - `cd apps/web && npm run typecheck` vượt qua 100% không có lỗi kiểu.
   - `cd apps/web && npm run build` tạo bundle production thành công.
3. **UX / Business Verification**:
   - Đăng nhập tài khoản `sale_admin@nsa.local`: Trang chủ hiển thị ngay Executive Sales Dashboard với đầy đủ Doanh thu toàn phòng, Xếp hạng Sale kèm doanh số cá nhân, Phễu tuyển sinh, Nguồn data và Bảng học viên vừa chốt.
   - Đăng nhập tài khoản chuyên viên Sale thường: Trang chủ hiển thị Bàn làm việc cá nhân phù hợp với vai trò tư vấn.
