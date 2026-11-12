# Design Document: Trang Quản lý Tài khoản Cá nhân (/tai-khoan)

- **Ngày tạo:** 11/11/2026
- **Trạng thái:** Chờ phê duyệt (Pending Approval)
- **Tác giả:** Antigravity Pairing Assistant

---

## 1. Mục tiêu & Bối cảnh
Người dùng cần một trang **Quản lý Tài khoản Cá nhân** (`/tai-khoan`) để mọi tài khoản đăng nhập (Admin, Sale Manager, Nhân viên Sale, Giảng viên, Học viên) có thể:
1. Xem thông tin tài khoản hiện tại (Email định danh, Vai trò hệ thống, Trạng thái).
2. Tự cập nhật **Họ và tên**, **Số điện thoại** cá nhân (tự động đồng bộ sang hồ sơ Giảng viên / Học viên nếu có).
3. Tải lên hoặc gỡ **Ảnh đại diện Avatar** (tự động nén WebP $\le 256\text{ KiB}$).
4. Thực hiện **Đổi mật khẩu** an toàn ngay tại trang hồ sơ.
5. Truy cập thuận tiện bằng cách bấm trực tiếp vào avatar/tên người dùng ở góc dưới Sidebar.

---

## 2. Kiến trúc & Thiết kế Kỹ thuật

### A. Backend (Go API)
1. **Cập nhật Query SQL (`database/queries/auth.sql`)**:
   - Bổ sung cột `COALESCE(phone, '')::varchar(50) AS phone` vào `GetUserByID` và `GetUserByEmail`.
   - Thêm query `UpdateUserProfile(id, full_name, phone)` trong `auth.sql`.
   - Chạy `sqlc generate`.
2. **Endpoint mới `PATCH /api/v1/auth/me/profile` (`apps/api/internal/auth`)**:
   - Nhận payload:
     ```json
     {
       "full_name": "Nguyễn Minh Trung",
       "phone": "0901234567"
     }
     ```
   - Validate:
     - `full_name`: Bắt buộc, không để trống, tối đa 200 ký tự.
     - `phone`: Bắt đầu bằng `0`, gồm 10–11 chữ số.
   - Đồng bộ:
     - Cập nhật `users.full_name`, `users.phone`.
     - Nếu có `student_profiles` liên kết $\rightarrow$ cập nhật `student_profiles.full_name` & `phone`.
     - Nếu có `teacher_profiles` liên kết $\rightarrow$ cập nhật `teacher_profiles.full_name` & `phone`.
   - Trả về đối tượng `UserInfo` mới nhất.
3. **Endpoint hiện có**:
   - `GET /api/v1/auth/me`: Trả về `UserInfo` kèm `phone`.
   - `PATCH /api/v1/auth/me/avatar`: Cập nhật ảnh đại diện WebP.
   - `POST /api/v1/auth/change-password`: Đổi mật khẩu tài khoản.

### B. Frontend (React / Vite)
1. **API Client (`apps/web/src/features/auth/authApi.ts`)**:
   - Thêm hàm `updateMyProfile({ full_name, phone })`.
   - Cập nhật kiểu `UserInfo` và `User` có thêm `phone?: string`.
2. **Auth Context (`apps/web/src/features/auth/AuthContext.tsx`)**:
   - Thêm helper `updateMyProfile(...)` cập nhật state `user` ngay trong ứng dụng mà không cần reload trang.
3. **Trang `PersonalAccountPage.tsx` (`apps/web/src/features/account/PersonalAccountPage.tsx`)**:
   - Thiết kế giao diện Liquid Glass đồng bộ phong cách toàn app:
     - **Thẻ định danh (Identity Card)**: Avatar to $\Phi 88\text{px}$, nút chọn ảnh / xóa ảnh, huy hiệu vai trò (Admin, Sale, Giảng viên...), huy hiệu trạng thái tài khoản.
     - **Phần 1 - Thông tin cơ bản**:
       - Email: Hiển thị cố định (read-only) có nhãn "Tài khoản định danh".
       - Họ và tên: Input chỉnh sửa có validation.
       - Số điện thoại: Input định dạng SĐT Việt Nam (bắt đầu bằng 0).
       - Nút "Lưu thông tin cá nhân" có spinner loading và thông báo toast xanh khi thành công.
     - **Phần 2 - Đổi mật khẩu**:
       - Mật khẩu hiện tại, Mật khẩu mới ($\ge 8$ ký tự), Xác nhận mật khẩu mới.
       - Nút "Cập nhật mật khẩu" kèm thông báo lỗi cụ thể nếu mật khẩu cũ không đúng.
4. **Điều hướng (`AppLayout.tsx` & `router.tsx`)**:
   - Thêm route `/tai-khoan` trong danh sách children của `AppLayout`.
   - Bấm vào hàng thông tin User ở góc dưới Sidebar sẽ dẫn tới `/tai-khoan`.

---

## 3. Kế hoạch Kiểm thử & Xác minh
1. **Kiểm thử Unit & API**:
   - Go backend: `go test ./internal/auth/...`
   - Frontend: `npm test` & `npm run typecheck`
2. **Kiểm thử Nghiệp vụ Thực tế trên Local**:
   - Mở [http://localhost:5173/tai-khoan](http://localhost:5173/tai-khoan).
   - Thử sửa Họ tên và SĐT $\rightarrow$ Lưu thành công $\rightarrow$ Tên trên Sidebar cập nhật tức thì.
   - Thử tải Avatar mới $\rightarrow$ Avatar nén WebP hiển thị ngay.
   - Thử đổi mật khẩu $\rightarrow$ Đổi thành công $\rightarrow$ Đăng nhập lại với mật khẩu mới.
