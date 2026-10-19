import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ManagedUser, UserAuditLog } from "./usersApi";
import { usersApi } from "./usersApi";
import { UserManagementPage } from "./UserManagementPage";

vi.mock("./usersApi", () => ({
  usersApi: {
    list: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateProfile: vi.fn(),
    updateLeadRouting: vi.fn(),
    reorderLeadRouting: vi.fn(),
    resetPassword: vi.fn(),
    listAuditLogs: vi.fn(),
  },
}));

const mockAdminUser = {
  id: "admin-uuid",
  email: "admin@nsa.edu.vn",
  roles: ["ADMIN"] as "ADMIN"[],
  person_id: null,
};

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: mockAdminUser,
    status: "authenticated",
    hasRole: (...roles: string[]) => roles.includes("ADMIN"),
    login: vi.fn(),
    logout: vi.fn(),
    homePath: () => "/admin",
  }),
}));

const sampleUsers: ManagedUser[] = [
  {
    id: "user-1",
    email: "student1@nsa.edu.vn",
    status: "active",
    must_change_password: false,
    created_at: "2026-10-09T08:00:00Z",
    updated_at: "2026-10-09T08:00:00Z",
    roles: ["STUDENT"],
    full_name: "Nguyễn Văn Học",
    phone: "0912345678",
    student_code: "HV0001",
    created_by_email: "admin@nsa.edu.vn",
  },
  {
    id: "user-2",
    email: "teacher1@nsa.edu.vn",
    status: "active",
    must_change_password: false,
    created_at: "2026-10-09T08:30:00Z",
    updated_at: "2026-10-09T08:30:00Z",
    roles: ["TEACHER"],
    full_name: "Trần Giảng Viên",
    phone: "0987654321",
    teacher_code: "GV0001",
  },
  {
    id: "user-3",
    email: "sale1@nsa.edu.vn",
    status: "suspended",
    must_change_password: false,
    created_at: "2026-10-09T09:00:00Z",
    updated_at: "2026-10-09T09:00:00Z",
    roles: ["SALE"],
    full_name: "Lê Tư Vấn",
    phone: "0933333333",
  },
];

const sampleAuditLogs: UserAuditLog[] = [
  {
    id: 1,
    actor_user_id: "admin-uuid",
    actor_email: "admin@nsa.edu.vn",
    actor_name: "Tổng Quản Trị",
    action: "user.create",
    created_at: "2026-10-09T08:00:00Z",
    new_values: {
      email: "student1@nsa.edu.vn",
      role: "STUDENT",
    },
    reason: "Tạo tài khoản học viên mới",
  },
];

function renderComponent() {
  vi.mocked(usersApi.list).mockResolvedValue({
    items: sampleUsers,
    meta: { page: 1, per_page: 20, total: 3, total_pages: 1 },
  });
  vi.mocked(usersApi.listAuditLogs).mockResolvedValue({
    items: sampleAuditLogs,
    meta: { page: 1, per_page: 50, total: 1, total_pages: 1 },
  });

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UserManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user list with role badges and information correctly", async () => {
    renderComponent();

    // Verify header and table items after loading completes
    expect(screen.getByText(/Quản lý Tài khoản & Phân quyền/i)).toBeInTheDocument();
    expect(await screen.findByText("Nguyễn Văn Học")).toBeInTheDocument();
    expect(screen.getByText("student1@nsa.edu.vn")).toBeInTheDocument();
    expect(screen.getByText("Trần Giảng Viên")).toBeInTheDocument();
    expect(screen.getByText("Lê Tư Vấn")).toBeInTheDocument();

    // Verify role badges
    expect(screen.getAllByText("Học viên").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Giảng viên").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nhân viên Sale").length).toBeGreaterThanOrEqual(1);

    // Verify status badges
    expect(screen.getAllByText("Hoạt động").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tạm khóa").length).toBeGreaterThanOrEqual(1);
  });

  it("opens slide-over drawer and displays audit history when clicking user row and audit tab", async () => {
    renderComponent();

    const userRow = await screen.findByText("Nguyễn Văn Học");

    // Click the user row to open slide-over drawer
    fireEvent.click(userRow);

    // Drawer should show user details and quick actions
    expect(await screen.findByRole("button", { name: /Đặt lại mật khẩu/i })).toBeInTheDocument();

    // Switch to audit tab
    const auditTab = screen.getByRole("button", { name: /Lịch sử & Kiểm toán/i });
    fireEvent.click(auditTab);

    // Audit logs should be loaded in drawer
    expect(await screen.findByText(/Tạo tài khoản học viên mới/i)).toBeInTheDocument();
    expect(usersApi.listAuditLogs).toHaveBeenCalledWith("user-1", 1, 50);
  });

  it("opens create user modal when clicking 'Thêm tài khoản mới'", async () => {
    renderComponent();

    await screen.findByText("Nguyễn Văn Học");

    const createButton = screen.getByRole("button", { name: /Thêm tài khoản mới/i });
    fireEvent.click(createButton);

    expect(await screen.findByText("Thêm tài khoản người dùng")).toBeInTheDocument();
    expect(screen.getByLabelText(/Email đăng nhập/i)).toBeInTheDocument();
  });

  it("renders lead routing banner and controls when mode is sale", async () => {
    vi.mocked(usersApi.list).mockResolvedValue({
      items: [
        {
          id: "sale-1",
          email: "sale1@nsa.edu.vn",
          status: "active",
          must_change_password: false,
          created_at: "2026-10-09T09:00:00Z",
          updated_at: "2026-10-09T09:00:00Z",
          roles: ["SALE"],
          full_name: "Lê Tư Vấn",
          phone: "0933333333",
          is_accepting_leads: true,
          lead_assignment_order: 1,
        },
      ],
      meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    });

    vi.mocked(usersApi.updateLeadRouting).mockResolvedValue({
      id: "sale-1",
      email: "sale1@nsa.edu.vn",
      status: "active",
      must_change_password: false,
      created_at: "2026-10-09T09:00:00Z",
      updated_at: "2026-10-09T09:00:00Z",
      roles: ["SALE"],
      full_name: "Lê Tư Vấn",
      phone: "0933333333",
      is_accepting_leads: false,
      lead_assignment_order: 1,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UserManagementPage mode="sale" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Thứ tự xoay vòng")).toBeInTheDocument();
    expect(screen.getAllByText("Nhận Lead tự động").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đang nhận/i })).toBeInTheDocument();

    // Toggle lead receiving status
    fireEvent.click(screen.getByRole("button", { name: /Đang nhận/i }));
    await waitFor(() => {
      expect(usersApi.updateLeadRouting).toHaveBeenCalledWith("sale-1", {
        is_accepting_leads: false,
      });
    });
  });
});
