import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeadPipelinePage } from "./LeadPipelinePage";
import { OrdersPage } from "./OrdersPage";
import { saleApi } from "./saleApi";
import { SaleDashboardPage } from "./SaleDashboardPage";
import { SaleStudentsPage } from "./SaleStudentsPage";
import { SaleRegistrationOrdersPage } from "./SaleRegistrationOrdersPage";
import { SaleReceiptsPage } from "./SaleReceiptsPage";
import { formatVND } from "./saleShared";

const mockAuth = {
  user: { id: "user-1", email: "admin@nsa.local", roles: ["ADMIN"] },
  token: "mock-token",
  isAuthenticated: true,
  hasRole: vi.fn((...roles: string[]) => roles.includes("ADMIN")),
};

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("./saleApi", () => ({
  saleApi: {
    getMyStats: vi.fn(),
    listTasks: vi.fn(),
    listLeads: vi.fn(),
    completeTask: vi.fn(),
    listOrders: vi.fn(),
    listStaff: vi.fn(),
    createLead: vi.fn(),
    listClasses: vi.fn(),
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
    createOrder: vi.fn(),
    exportOrders: vi.fn(),
    getLead: vi.fn(),
    getOverview: vi.fn(),
    getRevenueReport: vi.fn(),
    listInteractions: vi.fn().mockResolvedValue([]),
    listTasksByLead: vi.fn().mockResolvedValue([]),
    listPipelineHistory: vi.fn().mockResolvedValue([]),
    listCourses: vi.fn().mockResolvedValue({ items: [], meta: { page: 1, total: 0 } }),
  },
}));

vi.mock("../admin/adminApi", () => ({
  adminApi: {
    studentClassHistory: vi.fn().mockResolvedValue({ items: [], meta: { page: 1, total: 0 } }),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sale feature pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "user-1", email: "admin@nsa.local", roles: ["ADMIN"] };
    mockAuth.hasRole.mockImplementation((...roles: string[]) => roles.includes("ADMIN"));
  });

  it("renders SaleDashboardPage for personal sale staff with KPIs and task lists", async () => {
    mockAuth.user = { id: "user-1", email: "sale@nsa.local", roles: ["SALE"] };
    mockAuth.hasRole.mockReturnValue(false);

    vi.mocked(saleApi.getMyStats).mockResolvedValue({
      assigned_leads: 12,
      new_leads_today: 4,
      overdue_tasks: 1,
      today_tasks: 3,
      converted_this_month: 2,
      total_this_month: 10,
      conversion_rate: 20,
    });
    vi.mocked(saleApi.listTasks).mockResolvedValue([
      {
        id: "task-1",
        lead_id: "lead-1",
        lead_name: "Nguyễn Văn Test",
        lead_phone: "0901234567",
        assigned_to: "user-1",
        title: "Gọi điện tư vấn khóa ô tô",
        due_at: "2026-10-07T12:00:00Z",
        completed_at: null,
        created_by: "user-1",
        created_at: "2026-10-07T08:00:00Z",
        updated_at: "2026-10-07T08:00:00Z",
      },
    ]);
    vi.mocked(saleApi.listLeads).mockResolvedValue({
      items: [
        {
          id: "lead-1",
          full_name: "Nguyễn Văn Test",
          phone: "0901234567",
          email: "test@gmail.com",
          source: "facebook",
          pipeline_status: "data_moi",
          created_by: "user-1",
          created_at: "2026-10-07T08:00:00Z",
          updated_at: "2026-10-07T08:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 5,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<SaleDashboardPage />);

    expect(screen.getByText("Tổng quan Tuyển sinh")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("Gọi điện tư vấn khóa ô tô")).toBeInTheDocument();
      expect(screen.getByText("Nguyễn Văn Test")).toBeInTheDocument();
    });
  });

  it("renders SaleDashboardPage for admin/sale admin with ExecutiveSalesDashboard", async () => {
    mockAuth.hasRole.mockImplementation((...roles: string[]) => roles.includes("ADMIN"));

    vi.mocked(saleApi.getOverview).mockResolvedValue({
      by_status: { data_moi: 20, hen_lich: 10, da_dang_ky: 20 },
      by_source: { facebook: 30, zalo: 20 },
      by_assignee: [
        {
          user_id: "staff-1",
          email: "staff1@nsa.local",
          total_leads: 25,
          converted_leads: 15,
          month_revenue: 50000000,
        },
      ],
    });
    vi.mocked(saleApi.getRevenueReport).mockResolvedValue({
      summary: {
        total_revenue: 250000000,
        month_revenue: 85000000,
        month_orders: 8,
        month_paid_orders: 6,
      },
      by_month: [
        { month: "2026-09", total_orders: 5, paid_orders: 4, total_revenue: 60000000 },
        { month: "2026-10", total_orders: 8, paid_orders: 6, total_revenue: 85000000 },
      ],
      by_source: [
        { source: "facebook", total_orders: 5, revenue: 50000000 },
        { source: "zalo", total_orders: 3, revenue: 35000000 },
      ],
    });
    vi.mocked(saleApi.getMyStats).mockResolvedValue({
      assigned_leads: 10,
      new_leads_today: 2,
      overdue_tasks: 0,
      today_tasks: 1,
      converted_this_month: 5,
      total_this_month: 20,
      conversion_rate: 25,
      team_month_revenue: 85000000,
    });
    vi.mocked(saleApi.listOrders).mockResolvedValue({
      items: [
        {
          id: "order-exec-1",
          order_code: "ORD-EXEC-001",
          amount: 15000000,
          discount_amount: 0,
          final_amount: 15000000,
          status: "paid",
          course_name: "Kỹ thuật Ô tô",
          student_name: "Lê Văn Executive",
          created_by: "staff-1",
          created_at: "2026-10-10T10:00:00Z",
          updated_at: "2026-10-10T10:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 8,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<SaleDashboardPage />);

    expect(screen.getByText("Tổng quan Phòng Tuyển sinh")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(formatVND(85000000))[0]).toBeInTheDocument();
      expect(screen.getByText("ORD-EXEC-001")).toBeInTheDocument();
    });
  });

  it("renders OrdersPage with filters and table data", async () => {
    vi.mocked(saleApi.listOrders).mockResolvedValue({
      items: [
        {
          id: "order-1",
          order_code: "ORD-20261007-0001",
          amount: 15000000,
          discount_amount: 1000000,
          final_amount: 14000000,
          status: "pending",
          course_name: "Kỹ thuật ô tô",
          class_code: "OTO-K01",
          student_name: "Trần Học Viên",
          student_code: "HV001",
          created_by: "user-1",
          created_at: "2026-10-07T09:00:00Z",
          updated_at: "2026-10-07T09:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<OrdersPage />);

    expect(screen.getByText("Quản lý Đơn hàng & Phiếu thu")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("ORD-20261007-0001")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Trần Học Viên")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Kỹ thuật ô tô")[0]).toBeInTheDocument();
    });
  });

  it("renders LeadPipelinePage with search and lead listing", async () => {
    vi.mocked(saleApi.listStaff).mockResolvedValue([{ id: "staff-1", email: "sale1@nsa.local" }]);
    vi.mocked(saleApi.listLeads).mockResolvedValue({
      items: [
        {
          id: "lead-2",
          full_name: "Lê Minh Lead",
          phone: "0988776655",
          email: "leminh@gmail.com",
          source: "zalo",
          pipeline_status: "follow",
          created_by: "user-1",
          created_at: "2026-10-07T08:00:00Z",
          updated_at: "2026-10-07T08:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
        total_pages: 1,
      },
    });

    vi.mocked(saleApi.getLead).mockResolvedValue({
      id: "lead-2",
      full_name: "Lê Minh Lead",
      phone: "0988776655",
      email: "leminh@gmail.com",
      source: "zalo",
      pipeline_status: "follow",
      created_by: "user-1",
      created_at: "2026-10-07T08:00:00Z",
      updated_at: "2026-10-07T08:00:00Z",
    });

    renderWithClient(<LeadPipelinePage />);

    expect(screen.getByText("Quản lý Lead Tuyển sinh")).toBeInTheDocument();
    expect(screen.getByText("Nhập từ Excel/CSV")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Lê Minh Lead")[0]).toBeInTheDocument();
      expect(screen.getAllByText("0988776655")[0]).toBeInTheDocument();
    });

    // Clicking on lead name opens the right-side LeadDetailDrawer instead of a new page
    fireEvent.click(screen.getAllByText("Lê Minh Lead")[0]);

    await waitFor(() => {
      expect(screen.getByText("Chỉnh sửa thông tin liên hệ")).toBeInTheDocument();
      expect(screen.getByText("Tương tác & Nhắc việc")).toBeInTheDocument();
    });
  });

  it("renders SaleStudentsPage with converted students and detail links", async () => {
    vi.mocked(saleApi.listLeads).mockResolvedValue({
      items: [
        {
          id: "lead-chot-1",
          full_name: "Hoàng Minh Học Viên",
          phone: "0912345678",
          email: "hoangminh@test.com",
          source: "walk_in",
          pipeline_status: "da_dang_ky",
          converted_student_id: "stu-1",
          converted_student_code: "HV2026-001",
          interested_course_name: "Khóa Lập Trình Nhúng",
          created_by: "user-1",
          created_at: "2026-10-08T08:00:00Z",
          updated_at: "2026-10-08T08:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 15,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<SaleStudentsPage />);

    expect(screen.getByText("Danh sách Học viên")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Hoàng Minh Học Viên")[0]).toBeInTheDocument();
      expect(screen.getAllByText("HV2026-001")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Khóa Lập Trình Nhúng")[0]).toBeInTheDocument();
      expect(screen.queryByText("Chi tiết")).not.toBeInTheDocument();
      expect(screen.queryByText("Phiếu ĐK")).not.toBeInTheDocument();
    });
  });

  it("renders SaleRegistrationOrdersPage with orders list and create button", async () => {
    vi.mocked(saleApi.listOrders).mockResolvedValue({
      items: [
        {
          id: "order-101",
          order_code: "PDK-20261016-001",
          amount: 15000000,
          discount_amount: 1000000,
          final_amount: 14000000,
          status: "pending",
          course_name: "Lập trình React Native",
          class_code: "RN-K01",
          student_name: "Nguyễn Văn Đậu",
          created_by: "user-1",
          created_at: "2026-10-16T08:00:00Z",
          updated_at: "2026-10-16T08:00:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<SaleRegistrationOrdersPage />);

    expect(screen.getByText("Quản lý Phiếu đăng ký")).toBeInTheDocument();
    expect(screen.getByText("Tạo phiếu đăng ký")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("PDK-20261016-001")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Nguyễn Văn Đậu")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Chưa thanh toán")[0]).toBeInTheDocument();
    });
  });

  it("renders SaleReceiptsPage with revenue metrics and receipts table", async () => {
    vi.mocked(saleApi.listOrders).mockResolvedValue({
      items: [
        {
          id: "order-201",
          order_code: "DH-20261016-002",
          amount: 12000000,
          discount_amount: 0,
          final_amount: 12000000,
          status: "paid",
          course_name: "Kỹ thuật Thiết kế Đồ họa",
          class_code: "DH-K02",
          student_name: "Phạm Thu Ngân",
          payment_method: "transfer",
          paid_at: "2026-10-16T09:30:00Z",
          created_by: "user-1",
          created_at: "2026-10-16T09:00:00Z",
          updated_at: "2026-10-16T09:30:00Z",
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
        total_pages: 1,
      },
    });

    renderWithClient(<SaleReceiptsPage />);

    expect(screen.getByText("Quản lý Phiếu thu")).toBeInTheDocument();
    expect(screen.getByText("Tổng doanh thu thực thu")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("PT-20261016-002")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Phạm Thu Ngân")[0]).toBeInTheDocument();
      expect(screen.getAllByText("In phiếu thu")[0]).toBeInTheDocument();
    });
  });
});
