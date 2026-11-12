# NSA CRM Pipeline, Multi-Lead Assign, Auto-Assign Toggle & Course Waitlist Spec

**Date:** 2026-11-12  
**Status:** Approved  
**Author:** Antigravity & User  

---

## 1. Objectives & User Requirements

1. **Lead Pipeline Manual Status Restriction:**
   - In manual status update modals (`LeadDetailDrawer.tsx` and `LeadProfilePage.tsx`), restrict the selectable options to only 5 statuses:
     - `Data mới` (`data_moi`)
     - `KNM / Thuê bao` (`knm_thue_bao`)
     - `Gọi lại sau` (`goi_lai_sau`)
     - `Follow / Chăm sóc` (`follow`)
     - `Từ chối` (`tu_choi`)
   - The other 3 statuses (`da_dang_ky`, `dang_hoc`, `ket_thuc`) are reserved for automated system transitions (conversion, enrollment, class completion) and cannot be chosen manually.
   - All 8 statuses remain visible in filters, badges, and dashboard charts.
   - Backend `PATCH /sale/leads/{leadID}/status` enforces that only the 5 manual statuses can be requested by users.

2. **Bulk Lead Selection & Bulk Assign:**
   - On `LeadPipelinePage.tsx`, when logged in as `SALE_ADMIN` or `ADMIN`, provide a checkbox column in the table with a "Select all on page" header checkbox.
   - When 1 or more leads are selected, display a prominent floating / sticky batch action bar:
     - Count of selected leads (`Đã chọn X lead`)
     - Dropdown to select a Sale staff member (from `/sale/staff`)
     - Button `Gán cho Sale này` to execute bulk assignment
     - Button `Bỏ chọn` to clear selections
   - Backend provides `POST /sale/leads/bulk-assign` (or `PATCH /sale/leads/bulk-assign`) accepting `{ "lead_ids": ["uuid", ...], "assignee_id": "uuid" }` for `SALE_ADMIN` and `ADMIN`, executed atomically in a transaction with audit logs and pipeline interaction history.

3. **Master Auto-Assign Toggle for Sale Manager:**
   - On `/sale/users` (`UserManagementPage.tsx` in `sale` mode), provide a Master Switch for the Sale Manager:
     - "Tự động phân bổ Lead (Round-Robin): [BẬT / TẮT]"
   - Backed by system settings or a dedicated DB flag (e.g. `system_settings` key `sale_auto_assign_enabled` defaulting to `true`).
   - When TẮT (disabled):
     - Incoming leads from web forms or imports with unassigned/round_robin staff will NOT be assigned automatically to any rep (`assigned_to` remains NULL / unassigned).
     - Sale Manager can then manually review unassigned leads and bulk-assign them using Feature #2.
   - Existing individual toggles (`is_accepting_leads`) remain functional for taking individual reps in/out of the rotation when auto-assign is ON.

4. **Course Registration Waitlist ("Phòng chờ"):**
   - In both `CreateRegistrationOrderModal.tsx` and `LeadConvertPage.tsx`:
     - Allow selecting either an available open class OR choosing **"Phòng chờ (Chưa mở lớp)"**.
     - When "Phòng chờ" is chosen:
       - Require selecting the Course (`course_id`) from the 17 courses in the system.
       - Allow setting the tuition amount, discounts, and payment terms as usual.
     - Backend creates the Order with `course_id = <selected>`, `class_id = NULL`.
     - In `LeadConvertPage`, converting a lead into a student with "Phòng chờ" generates the student profile and initial password without requiring an active class.
   - On the Registration Orders page (`SaleRegistrationOrdersPage.tsx`):
     - Orders in "Phòng chờ" display a prominent badge: `[Phòng chờ] <Tên khóa học>`.
     - Provide a quick action button `Xếp lớp`:
       - Opens a modal listing currently open/planning classes of that course.
       - Upon selecting a class, updates `orders.class_id = classID` and automatically enrolls the student into the class (`class_enrollments`).
   - Backend endpoint: `PATCH /sale/orders/{orderID}/assign-class` with `{ "class_id": "uuid" }`.

---

## 2. API & Data Contract Changes

### 2.1 Backend Endpoints
- `PATCH /sale/leads/{leadID}/status`:
  - Validate `targetStatus` is in `[data_moi, knm_thue_bao, goi_lai_sau, follow, tu_choi]`.
  - Return HTTP 400 Bad Request with `"Trạng thái này do hệ thống tự động xử lý"` if `da_dang_ky`, `dang_hoc`, or `ket_thuc` is supplied.
- `POST /sale/leads/bulk-assign`:
  - Route guarded by `saleManagerOnly` (`SALE_ADMIN`, `ADMIN`).
  - Request body: `{ "lead_ids": string[], "assignee_id": string }`.
  - Response: `{ "updated": number, "failed": number }`.
- `GET /sale/settings/lead-routing` & `PUT /sale/settings/lead-routing`:
  - Guarded by `saleManagerOnly`.
  - Body: `{ "auto_assign_enabled": boolean }`.
  - Persisted in `system_settings` table (key: `sale_auto_assign_enabled`).
- `PATCH /sale/orders/{orderID}/assign-class`:
  - Guarded by `saleManagerOnly` + Sale rep assigned to the order.
  - Body: `{ "class_id": string }`.
  - Validates class exists, matches `order.course_id`, has capacity and is open/planning.
  - Updates `orders.class_id`, creates `class_enrollments` record, writes audit & class history.

### 2.2 Database
- Check or create `system_settings` table if not existing:
  ```sql
  CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL
  );
  INSERT INTO system_settings (key, value)
  VALUES ('sale_auto_assign_enabled', 'true'::jsonb)
  ON CONFLICT (key) DO NOTHING;
  ```
- Or reuse existing settings table if present.

---

## 3. Frontend UI/UX Specifications

### 3.1 Lead Pipeline Status Select
- Export `MANUAL_PIPELINE_STATUS_OPTIONS` in `saleShared.tsx`:
  - Only the 5 options: `data_moi`, `knm_thue_bao`, `goi_lai_sau`, `follow`, `tu_choi`.
- In `LeadDetailDrawer.tsx` and `LeadProfilePage.tsx`:
  - Replace `PIPELINE_STATUS_OPTIONS` with `MANUAL_PIPELINE_STATUS_OPTIONS` in the "Chuyển trạng thái Pipeline" modal.
  - Remove converted-only checks from that dropdown since `da_dang_ky` is no longer selectable manually.

### 3.2 Lead Bulk Select & Assign
- `LeadPipelinePage.tsx`:
  - Add `selectedLeadIds: Set<string>` state.
  - Add checkbox in Table header (select/deselect all visible items) and table row.
  - Add floating batch action bar at bottom-center or top:
    - `Đã chọn N lead`
    - Staff selector `<Select>` listing active Sale staff.
    - Button `<Button variant="primary">Gán Sale</Button>`.
    - Button `<Button variant="ghost">Hủy chọn</Button>`.

### 3.3 Master Auto-Assign Toggle
- In `/sale/users` (`UserManagementPage.tsx` when `isSaleMode` is true):
  - In top banner or next to stats indicator:
    - Master Switch: `Tự động phân bổ Lead: [BẬT / TẮT]` with nice iOS-style toggle.
    - Clear tooltip/explainer: "Khi TẮT, lead mới từ mọi nguồn sẽ ở trạng thái Chưa phân công để Quản lý chủ động gom gán."

### 3.4 Waitlist ("Phòng chờ")
- `CreateRegistrationOrderModal.tsx`:
  - Add Radio / Segmented control:
    - `[X] Chọn lớp học đang mở` vs `[ ] Đăng ký Phòng chờ (Chưa xếp lớp)`.
  - When "Đăng ký Phòng chờ":
    - Class selector is replaced with `Khóa học ghi danh *` (dropdown of 17 courses).
    - Submitting sends `course_id` without `class_id`.
- `LeadConvertPage.tsx`:
  - Similarly, under "Chọn lớp học mở ghi danh", add option `Đăng ký Phòng chờ (Chưa mở lớp)`.
  - When selected, shows `Khóa học ghi danh *` dropdown.
- `SaleRegistrationOrdersPage.tsx`:
  - In Table, if `order.class_id` is null:
    - Badge: `Phòng chờ` (amber tone) + Course Code.
    - In "Thao tác" column: Add Button `Xếp lớp` (with calendar/user-plus icon).
    - Clicking `Xếp lớp` opens a lightweight modal to pick an active class for that course, calling `assign-class`.
