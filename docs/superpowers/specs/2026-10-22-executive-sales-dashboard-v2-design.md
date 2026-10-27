# Design Spec: Executive Sales Dashboard 2.0 (Tổng quan Phòng Tuyển sinh)

- **Date**: 2026-10-22
- **Topic**: Mở rộng Bảng điều khiển Quản lý Tuyển sinh toàn diện, trực quan và thực tế
- **Status**: Approved by User

---

## 1. Mục tiêu & Định hướng
Nâng cấp giao diện trang chủ dành cho Quản lý Tuyển sinh (`SALE_ADMIN` / `ADMIN`), biến trang tổng quan thành một trung tâm chỉ huy số liệu toàn diện nhưng gọn gàng, trực quan và dùng câu chữ thuần Việt thực tế:
1. Theo dõi doanh thu, số học viên chốt và tiến độ chỉ tiêu tháng.
2. Nắm bắt ngay các việc nóng cần xử lý (khách chưa chia, việc quá hạn, nợ đọng).
3. Biểu đồ xu hướng tăng trưởng doanh thu & số lượng lead theo ngày trong 30 ngày gần nhất.
4. Xếp hạng hiệu suất từng nhân viên tư vấn tuyển sinh.
5. Thống kê khóa học có nhiều học viên đăng ký nhất.
6. Luồng học viên vừa chốt và phiếu thu mới nhất toàn phòng.

---

## 2. Quy chuẩn Từ ngữ Giao diện (Gọn gàng, thực tế)

| Khối chức năng | Tên hiển thị UI | Ghi chú |
|---|---|---|
| Tiêu đề trang | **Tổng quan Phòng Tuyển sinh** | Tiêu đề chính, gọn gàng, không dùng từ "Executive" |
| Chuyển chế độ | **Toàn phòng** / **Cá nhân** | Switcher chuyển đổi xem số liệu toàn phòng hoặc bàn làm việc cá nhân |
| Khối cảnh báo | **Việc cần xử lý ngay** | Khối cảnh báo 3 chỉ số cần hành động |
| Mục 1 cảnh báo | **Khách mới chưa chia** | Lead mới vào chưa được gán nhân viên phụ trách |
| Mục 2 cảnh báo | **Lịch gọi / Hẹn tư vấn trễ hạn** | Cuộc gọi, lịch hẹn tư vấn quá hạn chưa hoàn thành |
| Mục 3 cảnh báo | **Học viên còn nợ học phí** | Đơn hàng trả góp hoặc chưa thanh toán đủ 100% |
| Khối tiến độ | **Chỉ tiêu tháng này** | Thanh đo tiến độ doanh thu thực tế so với chỉ tiêu tháng |
| Biểu đồ xu hướng | **Xu hướng Doanh thu & Tuyển sinh** | Biểu đồ 30 ngày gần nhất |
| Bảng nhân viên | **Xếp hạng Doanh số Nhân viên** | Top #1, #2, #3, số lead, chốt, doanh số, tỷ lệ chốt |
| Cơ cấu khóa học | **Khóa học đăng ký nhiều nhất** | Thống kê số học viên & doanh thu từng khóa |
| Phễu tuyển sinh | **Phễu chuyển đổi & Nguồn khách** | Tỷ lệ chuyển đổi qua các giai đoạn và nguồn (FB, TikTok...) |
| Đơn mới chốt | **Học viên vừa chốt & Phiếu thu gần đây** | Danh sách phiếu thu, tiến độ đóng tiền (Đã thu 100% / Còn nợ x đợt) |

---

## 3. Kiến trúc Giao diện & Các Khối Component

### 3.1. Hàng 1: Tiêu đề & Bộ điều khiển
- **Tiêu đề**: "Tổng quan Phòng Tuyển sinh", mô tả: "Theo dõi doanh thu phòng, tiến độ chỉ tiêu, hiệu suất đội ngũ tư vấn và học viên mới."
- **Chuyển chế độ**: Nút bấm nhanh [Toàn phòng] và [Cá nhân].
- **Thao tác nhanh**: Nút "Thêm khách mới", "Chia việc cho Sale", "Báo cáo chi tiết".

### 3.2. Hàng 2: Bộ 4 Thẻ Chỉ Số & Thanh Chỉ Tiêu Tháng
- **Thẻ 1**: Doanh số tháng (VND).
- **Thẻ 2**: Học viên chốt mới (số lượng & tỷ lệ chốt toàn phòng).
- **Thẻ 3**: Quy mô khách (tổng số lead đang phụ trách & khách mới hôm nay).
- **Thẻ 4**: Giá trị đơn trung bình (AOV) & Lũy kế doanh thu toàn viện.
- **Thanh chỉ tiêu tháng**: Thanh tiến độ trực quan % đạt mục tiêu doanh thu tháng (ví dụ: mục tiêu mặc định 200.000.000đ hoặc cấu hình động, hiển thị số tiền đã đạt và tỷ lệ %).

### 3.3. Hàng 3: Việc Cần Xử Lý Ngay (3 Thẻ Cảnh Báo)
- **Thẻ 1: Khách mới chưa chia**: Số lượng lead `assigned_to IS NULL`. Bấm vào sẽ mở danh sách lead lọc chưa gán.
- **Thẻ 2: Lịch gọi / Hẹn tư vấn trễ hạn**: Số lượng task `due_at < NOW() AND completed_at IS NULL`. Bấm vào mở danh sách việc quá hạn.
- **Thẻ 3: Học viên còn nợ học phí**: Số lượng đơn hàng chưa thanh toán đủ hoặc có kỳ trả góp tới hạn.

### 3.4. Hàng 4: Biểu Đồ Xu Hướng Doanh Thu & Tuyển Sinh (30 ngày)
- Biểu đồ trực quan kết hợp (hoặc tab chuyển đổi):
  - Doanh thu thực thu theo từng ngày trong 30 ngày gần nhất.
  - Số lượng khách mới vào vs Số lượng chốt học viên theo từng ngày.
- Giúp quản lý phát hiện ngay ngày cao điểm, hiệu quả của các đợt chạy quảng cáo.

### 3.5. Hàng 5: Bảng Xếp Hạng Nhân Viên & Cơ Cấu Tuyển Sinh (Grid)
- **Cột Trái (Xếp hạng Doanh số Nhân viên)**: Bảng nhân viên tư vấn với thứ hạng #1 (Vàng), #2 (Bạc), #3 (Đồng), email/tên, số khách phụ trách, số học viên chốt, tổng doanh số mang về tháng, tỷ lệ chốt và nút lọc đơn theo nhân viên.
- **Cột Giữa (Phễu chuyển đổi & Nguồn khách)**: Thanh đo 4 tầng (Khách mới -> Hẹn lịch -> Đang tư vấn -> Đã chốt) và tỷ lệ % đóng góp của từng nguồn (Facebook, TikTok, Hotline, Giới thiệu...).
- **Cột Phải (Khóa học đăng ký nhiều nhất)**: Danh sách top các khóa học có nhiều học viên đăng ký nhất trong viện kèm doanh thu mang về.

### 3.6. Hàng 6: Học Viên Vừa Chốt & Phiếu Thu Gần Đây
- Bảng danh sách đơn hàng chốt gần nhất:
  - Mã & Tên Học viên (kèm liên kết mở Hồ sơ 360°).
  - Khóa học / Lớp đăng ký.
  - Số tiền học phí & Ưu đãi.
  - Tiến độ đóng tiền: "Đã thu đủ 100%" (xanh lá) hoặc "Còn nợ x đợt" (xanh dương).
  - Chuyên viên tư vấn phụ trách.
  - Thời gian chốt.

---

## 4. Kiến trúc Dữ liệu & Backend API

1. **SQL Queries mới (database/queries/leads.sql & orders.sql)**:
   - `CountUnassignedLeads`: Đếm số lead chưa có `assigned_to`.
   - `CountTeamOverdueTasks`: Đếm số task chưa hoàn thành có `due_at < NOW()`.
   - `GetDailyRevenueTrend`: Gom nhóm doanh thu đơn hàng theo ngày trong 30 ngày gần nhất.
   - `GetDailyLeadTrend`: Gom nhóm số lead tạo và số lead chốt theo ngày trong 30 ngày gần nhất.
   - `GetTopCoursesStats`: Thống kê số lượng đơn và doanh thu theo khóa học.
2. **Backend Services (apps/api/internal/leads & orders)**:
   - Bổ sung các trường trên vào `DashboardOverview` hoặc endpoint mở rộng `/sale/dashboard/executive`.
3. **Frontend Domain Types & API Client (`apps/web/src/features/sale`)**:
   - Khai báo kiểu dữ liệu cho `DailyTrend`, `TopCourseStat`, `ActionAlerts`.
   - Cập nhật `ExecutiveSalesDashboard.tsx` hiển thị đầy đủ các khối mới.

---

## 5. Kế hoạch Kiểm thử & Bảo đảm Chất lượng
- Kiểm tra toàn bộ Go backend: `go test ./...` và `go build ./...`.
- Kiểm tra toàn bộ Frontend: `npm run typecheck`, `npm test` (21 test files), `npm run build`.
- Kiểm tra hiển thị thực tế trên trình duyệt local.
