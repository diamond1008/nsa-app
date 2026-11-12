import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalAccountPage } from "./PersonalAccountPage";
import * as authApi from "../auth/authApi";

const mockUser = {
  id: "user-123",
  email: "trungnm@newcitygroupsuleco.com.vn",
  full_name: "Nguyễn Minh Trung",
  phone: "0901234567",
  avatar_url: null,
  employee_code: "NV000006",
  roles: ["ADMIN" as const],
  must_change_password: false,
  created_at: "2026-01-01T08:00:00Z",
  last_login_at: "2026-11-11T12:00:00Z",
};

const mockUpdateMyProfile = vi.fn().mockResolvedValue({
  ...mockUser,
  full_name: "Nguyễn Minh Trung Đã Cập Nhật",
  phone: "0987654321",
});

const mockUpdateMyAvatar = vi.fn().mockResolvedValue({
  ...mockUser,
  avatar_url: "data:image/webp;base64,mock",
});

const mockRevokeOtherSessions = vi.fn().mockResolvedValue({
  message: "Đã đăng xuất khỏi tất cả các thiết bị khác thành công.",
});

const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    status: "authenticated",
    hasRole: (...roles: string[]) => roles.includes("ADMIN"),
    updateMyProfile: mockUpdateMyProfile,
    updateMyAvatar: mockUpdateMyAvatar,
    revokeOtherSessions: mockRevokeOtherSessions,
    logout: mockLogout,
    homePath: () => "/admin",
  }),
}));

vi.mock("../auth/authApi", () => ({
  changePassword: vi.fn().mockResolvedValue({ message: "Password changed." }),
  updateMyProfile: vi.fn(),
  updateMyAvatar: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PersonalAccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PersonalAccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user information, roles, and quick hub shortcuts", () => {
    renderComponent();

    // Title & user info
    expect(screen.getByRole("heading", { name: "Tài khoản" })).toBeInTheDocument();
    expect(screen.getAllByText("Nguyễn Minh Trung").length).toBeGreaterThan(0);
    expect(screen.getAllByText("trungnm@newcitygroupsuleco.com.vn").length).toBeGreaterThan(0);

    // Role badge & Employee code badge
    expect(screen.getByText("Admin tổng")).toBeInTheDocument();
    expect(screen.getByText("Hoạt động")).toBeInTheDocument();
    expect(screen.getByText("Mã NV: NV000006")).toBeInTheDocument();
    expect(screen.getByText("NV000006")).toBeInTheDocument();

    // Admin role quick hub links
    expect(screen.getByText("Quản lý Người dùng")).toBeInTheDocument();
    expect(screen.getByText("AI Operator Hub")).toBeInTheDocument();

    // Read-only email input
    const emailInputs = screen.getAllByDisplayValue("trungnm@newcitygroupsuleco.com.vn");
    expect(emailInputs[0]).toBeDisabled();
  });

  it("submits profile update when form is valid", async () => {
    renderComponent();

    const nameInput = screen.getByLabelText(/Họ và tên/i);
    const phoneInput = screen.getByLabelText(/Số điện thoại/i);
    const submitBtn = screen.getByRole("button", { name: /Lưu thay đổi/i });

    fireEvent.change(nameInput, { target: { value: "Nguyễn Minh Trung Đã Cập Nhật" } });
    fireEvent.change(phoneInput, { target: { value: "0987654321" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledWith({
        full_name: "Nguyễn Minh Trung Đã Cập Nhật",
        phone: "0987654321",
      });
    });

    expect(await screen.findByText("Cập nhật thông tin cá nhân thành công!")).toBeInTheDocument();
  });

  it("rejects invalid phone numbers that do not match Vietnam format", async () => {
    renderComponent();

    const phoneInput = screen.getByLabelText(/Số điện thoại/i);
    const submitBtn = screen.getByRole("button", { name: /Lưu thay đổi/i });

    fireEvent.change(phoneInput, { target: { value: "12345" } });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Số điện thoại không hợp lệ \(gồm 10-11 chữ số, bắt đầu bằng 0\)/i),
    ).toBeInTheDocument();
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
  });

  it("switches to Security tab and allows password change & session revocation", async () => {
    renderComponent();

    // Switch to security tab
    const secTabBtn = screen.getByRole("button", { name: /Mật khẩu & Bảo mật/i });
    fireEvent.click(secTabBtn);

    expect(screen.getByText("Tình trạng bảo mật")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Phiên đăng nhập" })).toBeInTheDocument();

    // Revoke other sessions
    const revokeBtn = screen.getByRole("button", { name: /Đăng xuất khỏi thiết bị khác/i });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(mockRevokeOtherSessions).toHaveBeenCalled();
    });

    // Change password form
    const currentPwInput = screen.getByLabelText(/Mật khẩu hiện tại/i);
    const newPwInput = screen.getByLabelText(/Mật khẩu mới \(tối thiểu 8 ký tự\)/i);
    const confirmPwInput = screen.getByLabelText(/Xác nhận mật khẩu mới/i);
    const submitPwBtn = screen.getByRole("button", { name: "Đổi mật khẩu" });

    fireEvent.change(currentPwInput, { target: { value: "OldPassword123" } });
    fireEvent.change(newPwInput, { target: { value: "NewSecurePassword888" } });
    fireEvent.change(confirmPwInput, { target: { value: "NewSecurePassword888" } });
    fireEvent.click(submitPwBtn);

    await waitFor(() => {
      expect(authApi.changePassword).toHaveBeenCalledWith("OldPassword123", "NewSecurePassword888");
    });

    expect(
      await screen.findByText(/Đổi mật khẩu thành công! Hệ thống đang chuyển về trang đăng nhập/i),
    ).toBeInTheDocument();
  });

  it("switches to SSO Accounts tab and displays Google and Microsoft status", () => {
    renderComponent();

    const ssoTabBtn = screen.getByRole("button", { name: /Liên kết đăng nhập/i });
    fireEvent.click(ssoTabBtn);

    expect(screen.getByText("Google Workspace")).toBeInTheDocument();
    expect(screen.getByText("Microsoft 365 / Azure AD")).toBeInTheDocument();
  });

  it("switches to Preferences tab and toggles user options", () => {
    renderComponent();

    const prefTabBtn = screen.getByRole("button", { name: /Cài đặt/i });
    fireEvent.click(prefTabBtn);

    expect(screen.getByText("Âm thanh thông báo")).toBeInTheDocument();
    expect(screen.getByText("Nhắc việc & Lịch trình")).toBeInTheDocument();
  });
});
