import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AIWorkflowProposal, AIWorkflowSummary } from "../../lib/domainTypes";
import { AIWorkflowHubPage } from "./AIWorkflowHubPage";
import { aiWorkflowApi } from "./aiWorkflowApi";

vi.mock("./aiWorkflowApi", () => ({
  aiWorkflowApi: {
    getSummary: vi.fn(),
    listProposals: vi.fn(),
    scanWorkflows: vi.fn(),
    approveProposal: vi.fn(),
    rejectProposal: vi.fn(),
  },
}));

const mockSummary: AIWorkflowSummary = {
  pending_total: 3,
  critical_pending: 1,
  sales_pending: 2,
  revenue_pending: 1,
  training_pending: 0,
  executed_today: 5,
};

const mockProposal: AIWorkflowProposal = {
  id: "proposal-1",
  dedup_key: "lead_routing:lead-1",
  workflow_code: "LEAD_ROUTING_SLA",
  domain: "sales_crm",
  priority: "critical",
  status: "pending",
  target_lead_id: "lead-1",
  target_lead_name: "Nguyễn Văn Test",
  target_lead_phone: "0901234567",
  target_lead_pipeline_status: "data_moi",
  title: "Tự động phân bổ Lead mới",
  bottleneck_summary: "Lead mới chưa có người phụ trách",
  ai_rationale: "Lead mới quá hạn SLA 15 phút chưa gán nhân viên tư vấn",
  suggested_script: "Chào anh/chị Test, em từ Trung tâm Đào tạo NSA...",
  action_type: "assign_lead",
  action_payload: { assigned_to: "sale-1" },
  context_snapshot: {},
  created_at: "2026-11-02T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
};

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AIWorkflowHubPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AIWorkflowHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiWorkflowApi.getSummary).mockResolvedValue(mockSummary);
    vi.mocked(aiWorkflowApi.listProposals).mockResolvedValue({
      items: [mockProposal],
      meta: { page: 1, per_page: 50, total: 1, total_pages: 1 },
    });
    vi.mocked(aiWorkflowApi.scanWorkflows).mockResolvedValue({
      scanned_at: new Date().toISOString(),
      proposals_created: 1,
      proposals_updated: 0,
      total_pending: 3,
      summary: "Đã quét và phát hiện 1 điểm nghẽn mới",
    });
    vi.mocked(aiWorkflowApi.approveProposal).mockResolvedValue({
      ...mockProposal,
      status: "executed",
    });
    vi.mocked(aiWorkflowApi.rejectProposal).mockResolvedValue({
      ...mockProposal,
      status: "rejected",
    });
  });

  it("renders page header and summary KPI metrics", async () => {
    renderComponent();

    expect(screen.getByText("Điều phối Quy trình Thông minh")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Chờ phê duyệt").length).toBeGreaterThan(0);
      expect(screen.getByText("Khẩn cấp (SLA)")).toBeInTheDocument();
      expect(screen.getByText("Đã duyệt hôm nay")).toBeInTheDocument();
    });
  });

  it("renders proposal card with AS-IS bottleneck and TO-BE action", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Tự động phân bổ Lead mới")).toBeInTheDocument();
      expect(screen.getByText("Nguyễn Văn Test")).toBeInTheDocument();
      expect(screen.getByText("Lead mới chưa có người phụ trách")).toBeInTheDocument();
      expect(screen.getByText("Phê duyệt & Thực thi")).toBeInTheDocument();
    });
  });

  it("triggers scanning when clicking scan button", async () => {
    renderComponent();

    const scanButton = screen.getByText("Quét điểm nghẽn ngay");
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(aiWorkflowApi.scanWorkflows).toHaveBeenCalled();
    });
  });

  it("approves proposal when clicking approve button", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Phê duyệt & Thực thi")).toBeInTheDocument();
    });

    const approveButton = screen.getByText("Phê duyệt & Thực thi");
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(aiWorkflowApi.approveProposal).toHaveBeenCalledWith(
        "proposal-1",
        expect.objectContaining({}),
      );
    });
  });

  it("rejects proposal when clicking reject button", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Bỏ qua")).toBeInTheDocument();
    });

    const rejectButton = screen.getByText("Bỏ qua");
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(aiWorkflowApi.rejectProposal).toHaveBeenCalledWith("proposal-1", {});
    });
  });
});
