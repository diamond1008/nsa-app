# Design Document: Admissions CRM Enhancements (Tuyển sinh NSA App)

- **Date**: 2026-10-16
- **Module**: Sales / Admissions (Phân hệ Tuyển sinh & CRM)
- **Status**: Approved

---

## 1. Overview & Goals
Nâng cấp toàn diện trải nghiệm và tính năng vận hành cho đội ngũ Tuyển sinh / Sales của NSA App qua 4 tính năng cốt lõi:
1. **Chế độ xem Kanban Pipeline (Drag-and-Drop)**: Bổ sung giao diện thẻ kéo - thả trực quan song song với bảng dữ liệu hiện tại trên trang `LeadPipelinePage`.
2. **Xuất danh sách Lead & Đơn hàng ra Excel (.xlsx)**: Xuất file bảng tính Microsoft Excel chuẩn hóa, có định dạng đẹp mắt theo bộ lọc tìm kiếm.
3. **Cảnh báo trùng lặp Lead (Duplicate Detection)**: Kiểm tra và cảnh báo theo thời gian thực khi SĐT hoặc Email đã tồn tại trong hệ thống (cảnh báo linh hoạt, không chặn).
4. **Tự động chia Lead (Round-Robin Auto-Assignment)**: Thuật toán phân bổ xoay vòng đều cho các nhân viên có vai trò `SALE` đang hoạt động khi tạo mới hoặc import lead mà không gán người phụ trách.

---

## 2. Architecture & Backend Design

### 2.1. Duplicate Detection (Kiểm tra trùng lặp)
- **Endpoint**: `GET /api/v1/sale/leads/check-duplicate`
  - Query params: `phone` (string), `email` (string), `exclude_id` (optional uuid).
  - Response:
    ```json
    {
      "is_duplicate": true,
      "duplicate_field": "phone",
      "existing_lead": {
        "id": "uuid",
        "full_name": "Nguyễn Văn A",
        "phone": "0912345678",
        "pipeline_status": "follow",
        "assigned_to_email": "sale1@example.com",
        "created_at": "2026-10-15T08:00:00Z"
      }
    }
    ```
- **DB Query**:
  `SELECT id, full_name, phone, email, pipeline_status, assigned_to FROM leads WHERE (phone = $1 AND $1 <> '') OR (email = $2 AND $2 <> '') LIMIT 1`.

### 2.2. Round-Robin Auto-Assignment (Chia Lead xoay vòng)
- **Cơ chế**:
  - Truy vấn danh sách người dùng có role `SALE` và status = `active`.
  - Bộ đếm xoay vòng lưu trữ atomic (`roundRobinIndex uint64` với sync/atomic hoặc mutex an toàn đa luồng).
  - Khi tạo lead mới: nếu `assigned_to` rỗng hoặc mang giá trị `"round_robin"`, backend tự động lấy nhân viên sale tiếp theo trong danh sách:
    `assignedStaff = staffList[atomic.AddUint64(&rrCounter, 1) % len(staffList)]`.
  - Áp dụng tương tự khi Import Excel nếu cột nhân viên phụ trách để trống.
  - Tự động ghi nhận `assigned_at = now`, `assigned_by = current_user_id` và thêm bản ghi lịch sử `lead_pipeline_history`.

### 2.3. Native Excel Export (.xlsx)
- **Thư viện**: `github.com/xuri/excelize/v2`
- **Endpoints**:
  - `GET /api/v1/sale/leads/export`: Nhận các bộ lọc `search`, `pipeline_status`, `source`, `assigned_to`, `created_from`, `created_to`. Xuất toàn bộ lead khớp với bộ lọc (không phân trang).
  - `GET /api/v1/sale/orders/export`: Nhận các bộ lọc `search`, `status`, `created_from`, `created_to`. Xuất toàn bộ đơn hàng khớp với bộ lọc.
- **Định dạng file**:
  - Header xanh Navy (#0A2540), chữ trắng, in đậm.
  - Cột tiền tệ định dạng `#,##0 ₫`.
  - Cột ngày tháng định dạng `DD/MM/YYYY HH:mm`.
  - Tự động điều chỉnh độ rộng cột phù hợp nội dung.

---

## 3. Frontend UI/UX Design

### 3.1. Chế độ xem Kanban Pipeline
- Thêm nút chuyển đổi chế độ xem trên đầu bảng: `[📋 Danh sách | 📊 Kanban Pipeline]`.
- Cột Kanban tương ứng với các giai đoạn pipeline chính:
  1. **Data mới** (`data_moi`)
  2. **KNM / Thuê bao** (`knm_thue_bao`)
  3. **Gọi lại sau** (`goi_lai_sau`)
  4. **Follow / Chăm sóc** (`follow`)
  5. **Từ chối** (`tu_choi`)
  6. **Đã đăng ký** (`da_dang_ky`)
- Mỗi thẻ Lead hiển thị: Họ tên, SĐT, Khóa học quan tâm, Nguồn, Sale phụ trách, Thời gian tạo, nút thao tác nhanh.
- Kéo thả thẻ từ cột này sang cột khác để đổi trạng thái tức thì thông qua `saleApi.updateLeadStatus` với optimistic update trên TanStack Query cache.

### 3.2. Cảnh báo trùng lặp trên Modal Thêm Lead
- Khi người dùng gõ xong SĐT hoặc Email (debounced 400ms), gọi API `check-duplicate`.
- Nếu phát hiện trùng, hiển thị hộp cảnh báo màu vàng nhẹ (Warning Banner):
  > ⚠️ **Số điện thoại này đã tồn tại!**
  > Lead: **Nguyễn Văn A** (Trạng thái: *Đang chăm sóc* - Sale phụ trách: *sale1@nsa.edu.vn*).
  > Bạn vẫn có thể tiếp tục tạo nếu đây là nhu cầu học thêm hoặc quay lại sau thời gian dài.

### 3.3. Nút Xuất Excel
- Thêm nút **Xuất Excel** (kèm icon tải xuống) tại `LeadPipelinePage` và `OrdersPage`.
- Khi bấm, gọi hàm tải file `saleApi.exportLeads(...)` hoặc `saleApi.exportOrders(...)` và tự động kích hoạt tải file `.xlsx` về máy tính người dùng.

---

## 4. Testing & Verification
- Unit test Backend: API check duplicate, logic round-robin assignment, export Excel format.
- Frontend test: Component tests cho Kanban view toggle, drag & drop status handler, duplicate warning feedback.
- Manual verification: Kiểm tra trực tiếp trên trình duyệt local `http://localhost:5173`.
