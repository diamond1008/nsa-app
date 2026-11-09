import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";

import { Icon } from "../../components/icons";
import { Button, Card, PageHeader, Spinner, Textarea } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import type {
  AIProposalPriority,
  AIProposalStatus,
  AIWorkflowProposal,
} from "../../lib/domainTypes";
import { aiWorkflowApi } from "./aiWorkflowApi";

export function AIWorkflowHubPage() {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<AIProposalStatus>("pending");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editedScripts, setEditedScripts] = useState<Record<string, string>>({});
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["ai-workflows", "summary"],
    queryFn: aiWorkflowApi.getSummary,
  });

  const proposalsQuery = useQuery({
    queryKey: ["ai-workflows", "proposals", selectedStatus, selectedDomain],
    queryFn: () =>
      aiWorkflowApi.listProposals({
        status: selectedStatus,
        domain: selectedDomain === "all" ? undefined : selectedDomain,
        per_page: 50,
      }),
  });

  const scanMutation = useMutation({
    mutationFn: aiWorkflowApi.scanWorkflows,
    onSuccess: (result) => {
      setSuccessBanner(result.summary);
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
      setTimeout(() => setSuccessBanner(null), 6000);
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, script }: { id: string; script?: string }) =>
      aiWorkflowApi.approveProposal(id, { suggested_script: script }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => aiWorkflowApi.rejectProposal(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-workflows"] });
    },
  });

  const handleCopyScript = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const summary = summaryQuery.data;
  const proposals = proposalsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Điều phối Quy trình Thông minh"
        eyebrow="Trợ lý Quy trình AI"
        subtitle="Tự động phát hiện điểm nghẽn, đề xuất giải pháp chuẩn SOP và phê duyệt thực thi 1-chạm"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => scanMutation.mutate()}
              loading={scanMutation.isPending}
              className="shadow-md hover:shadow-lg transition-all"
            >
              <Icon name="sparkles" className="h-4 w-4" />
              Quét điểm nghẽn ngay
            </Button>
          </div>
        }
      />

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <Icon name="check" className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successBanner}</span>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 bg-white/80 border-white/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gtext">Chờ phê duyệt</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Icon name="clock" className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-navy-heading tracking-tight">
            {summaryQuery.isLoading ? "--" : (summary?.pending_total ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-gtext">Đề xuất cần người duyệt</p>
        </Card>

        <Card className="p-4 bg-white/80 border-white/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gtext">Khẩn cấp (SLA)</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Icon name="alert" className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-red-600 tracking-tight">
            {summaryQuery.isLoading ? "--" : (summary?.critical_pending ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-red-500 font-medium">Cần xử lý trong 30p</p>
        </Card>

        <Card className="p-4 bg-white/80 border-white/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gtext">Đã duyệt hôm nay</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600 tracking-tight">
            {summaryQuery.isLoading ? "--" : (summary?.executed_today ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-gtext">Hành động tự động thực thi</p>
        </Card>

        <Card className="p-4 bg-white/80 border-white/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gtext">Tuyển sinh & Doanh thu</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0532e6]/10 text-[#0532e6]">
              <Icon name="shopping-bag" className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-[#0532e6] tracking-tight">
            {summaryQuery.isLoading
              ? "--"
              : (summary?.sales_pending ?? 0) + (summary?.revenue_pending ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-gtext">Quy trình trong phễu</p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/60 backdrop-blur-md p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedStatus("pending")}
            className={clsx(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              selectedStatus === "pending"
                ? "bg-[#0532e6] text-white shadow-xs"
                : "text-slate-600 hover:bg-white/80",
            )}
          >
            <span>Chờ phê duyệt</span>
            <span
              className={clsx(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                selectedStatus === "pending"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-700",
              )}
            >
              {summary?.pending_total ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus("executed")}
            className={clsx(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              selectedStatus === "executed"
                ? "bg-[#0532e6] text-white shadow-xs"
                : "text-slate-600 hover:bg-white/80",
            )}
          >
            <span>Đã thực thi</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus("rejected")}
            className={clsx(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              selectedStatus === "rejected"
                ? "bg-[#0532e6] text-white shadow-xs"
                : "text-slate-600 hover:bg-white/80",
            )}
          >
            <span>Đã bỏ qua</span>
          </button>
        </div>

        {/* Domain Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gtext shrink-0">Lĩnh vực:</span>
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="rounded-xl border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-[#0532e6]/20"
          >
            <option value="all">Tất cả nghiệp vụ</option>
            <option value="sales_crm">Tuyển sinh & Quản lý Lead</option>
            <option value="revenue_ops">Theo dõi Học phí & Đơn hàng</option>
            <option value="training_ops">Đào tạo & Học viên</option>
          </select>
        </div>
      </div>

      {/* Proposals List */}
      {proposalsQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-white/80 bg-white/40">
          <Spinner size="lg" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/40 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0532e6]/10 text-[#0532e6]">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-navy-heading">Không có đề xuất nào</h3>
          <p className="mt-1 text-xs text-gtext max-w-sm">
            {selectedStatus === "pending"
              ? "Quy trình vận hành đang thông suốt! Bấm 'Quét điểm nghẽn ngay' để hệ thống rà soát lại dữ liệu mới nhất."
              : "Chưa có đề xuất nào ở trạng thái này."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const currentScript =
              editedScripts[proposal.id] !== undefined
                ? editedScripts[proposal.id]
                : proposal.suggested_script;

            return (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                currentScript={currentScript}
                onScriptChange={(val) =>
                  setEditedScripts((prev) => ({ ...prev, [proposal.id]: val }))
                }
                onApprove={() => approveMutation.mutate({ id: proposal.id, script: currentScript })}
                onReject={() => rejectMutation.mutate(proposal.id)}
                onCopyScript={() => handleCopyScript(proposal.id, currentScript)}
                isCopied={copiedId === proposal.id}
                isApproving={
                  approveMutation.isPending && approveMutation.variables?.id === proposal.id
                }
                isRejecting={rejectMutation.isPending && rejectMutation.variables === proposal.id}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ProposalCardProps {
  proposal: AIWorkflowProposal;
  currentScript: string;
  onScriptChange: (val: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onCopyScript: () => void;
  isCopied: boolean;
  isApproving: boolean;
  isRejecting: boolean;
}

function ProposalCard({
  proposal,
  currentScript,
  onScriptChange,
  onApprove,
  onReject,
  onCopyScript,
  isCopied,
  isApproving,
  isRejecting,
}: ProposalCardProps) {
  return (
    <Card className="overflow-hidden border border-white/90 bg-white/85 shadow-card hover:shadow-elevated transition-all">
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {renderPriorityBadge(proposal.priority)}
          {renderDomainBadge(proposal.domain)}
          <span className="font-mono text-[11px] font-semibold text-slate-500">
            {proposal.workflow_code}
          </span>
        </div>
        <span className="text-[11px] text-gtext">{formatDateTime(proposal.created_at)}</span>
      </div>

      {/* Main Grid: AS-IS vs TO-BE */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Column: AS-IS Bottleneck */}
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Icon name="alert" className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Điểm nghẽn vận hành (AS-IS)
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">{proposal.title}</p>
          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
            {proposal.bottleneck_summary}
          </p>

          {/* Context Details */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {proposal.target_lead_name && (
              <span className="rounded-md bg-white/80 px-2 py-0.5 border border-amber-200/60">
                👤 Khách hàng: <b>{proposal.target_lead_name}</b>
              </span>
            )}
            {proposal.target_lead_phone && (
              <span className="rounded-md bg-white/80 px-2 py-0.5 border border-amber-200/60">
                📞 {proposal.target_lead_phone}
              </span>
            )}
            {proposal.target_order_code && (
              <span className="rounded-md bg-white/80 px-2 py-0.5 border border-amber-200/60">
                📑 Đơn: <b>{proposal.target_order_code}</b>
                {proposal.target_order_final_amount && (
                  <> ({proposal.target_order_final_amount} đ)</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Right Column: TO-BE AI Proposal */}
        <div className="rounded-xl border border-[#0532e6]/15 bg-[#0532e6]/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#0532e6]">
              <Icon name="sparkles" className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Đề xuất của AI (TO-BE)
              </span>
            </div>
            {renderActionBadge(proposal.action_type)}
          </div>
          <p className="mt-2 text-xs text-slate-800 leading-relaxed font-medium">
            {proposal.ai_rationale}
          </p>
          {proposal.assigned_user_name && (
            <p className="mt-2 text-xs text-slate-600">
              Nhân viên phụ trách đề xuất:{" "}
              <b className="text-navy">{proposal.assigned_user_name}</b> (
              {proposal.assigned_user_email})
            </p>
          )}
        </div>
      </div>

      {/* Suggested Script Section (Human-in-the-Loop) */}
      {proposal.suggested_script && (
        <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <div className="flex items-center justify-between pb-2">
            <label className="text-xs font-bold text-navy-heading flex items-center gap-1.5">
              <span>Kịch bản tư vấn đề xuất (Có thể chỉnh sửa trước khi duyệt):</span>
            </label>
            <button
              type="button"
              onClick={onCopyScript}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#0532e6] hover:underline cursor-pointer"
            >
              <Icon name={isCopied ? "check" : "edit"} className="h-3.5 w-3.5" />
              <span>{isCopied ? "Đã chép!" : "Sao chép"}</span>
            </button>
          </div>
          <Textarea
            value={currentScript}
            disabled={proposal.status !== "pending"}
            onChange={(e) => onScriptChange(e.target.value)}
            className="min-h-20 text-xs font-normal bg-white"
          />
        </div>
      )}

      {/* Execution / Decision Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
        {proposal.status === "pending" ? (
          <div className="flex w-full items-center justify-end gap-2.5">
            <Button
              variant="ghost"
              onClick={onReject}
              disabled={isRejecting || isApproving}
              className="text-xs px-3.5 h-9"
            >
              Bỏ qua
            </Button>
            <Button
              variant="primary"
              onClick={onApprove}
              loading={isApproving}
              disabled={isRejecting}
              className="text-xs px-5 h-9 shadow-sm"
            >
              <Icon name="check" className="h-4 w-4" />
              Phê duyệt & Thực thi
            </Button>
          </div>
        ) : proposal.status === "executed" ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
            <Icon name="check" className="h-4 w-4" />
            <span>
              Đã thực thi thành công bởi {proposal.decided_by_name || "Nhân viên"} lúc{" "}
              {proposal.decided_at ? formatDateTime(proposal.decided_at) : ""}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            <span>Đã bỏ qua đề xuất</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function renderPriorityBadge(priority: AIProposalPriority) {
  switch (priority) {
    case "critical":
      return (
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-extrabold text-red-700">
          Khẩn cấp
        </span>
      );
    case "high":
      return (
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
          Ưu tiên cao
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
          Tiêu chuẩn
        </span>
      );
  }
}

function renderDomainBadge(domain: string) {
  switch (domain) {
    case "sales_crm":
      return (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200/50">
          Tuyển sinh
        </span>
      );
    case "revenue_ops":
      return (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/50">
          Doanh thu
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          Đào tạo
        </span>
      );
  }
}

function renderActionBadge(action: string) {
  switch (action) {
    case "assign_lead":
      return (
        <span className="rounded-md bg-[#0532e6]/10 px-2 py-0.5 text-[10px] font-bold text-[#0532e6]">
          Phân bổ Lead
        </span>
      );
    case "create_followup_task":
      return (
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          Tạo việc gọi lại
        </span>
      );
    case "followup_pending_order":
      return (
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          Nhắc học phí
        </span>
      );
    default:
      return (
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
          Hành động
        </span>
      );
  }
}
