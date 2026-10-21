import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";

import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import {
  Badge,
  Button,
  Drawer,
  ErrorBanner,
  Input,
  Modal,
  Select,
  SuccessBanner,
  Textarea,
} from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type {
  Course,
  LeadInteraction,
  LeadPipelineHistory,
  LeadPipelineStatus,
  LeadTask,
  SaleStaff,
} from "../../lib/domainTypes";
import { formatDateTime, mutationMessage } from "../../lib/format";
import { saleApi } from "./saleApi";
import type { CreateLeadInput } from "./saleApi";
import {
  CHANNEL_OPTIONS,
  getChannelLabel,
  getSourceLabel,
  LeadPipelineBadge,
  PIPELINE_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from "./saleShared";
import { adminApi } from "../admin/adminApi";
import { ConfirmChotLeadModal } from "./ConfirmChotLeadModal";
import { CreateRegistrationOrderModal } from "./CreateRegistrationOrderModal";
import { LeadOrdersTab } from "./LeadOrdersTab";
import type { TrainingClass } from "../../lib/domainTypes";

type TabKey = "info" | "activities" | "orders" | "academic";

function getInitials(name?: string): string {
  if (!name) return "HV";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface LeadDetailDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onLeadUpdated }: LeadDetailDrawerProps) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Modals inside drawer
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<LeadPipelineStatus>("follow");
  const [statusReason, setStatusReason] = useState("");

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignedSaleId, setAssignedSaleId] = useState("");
  const [isChotModalOpen, setIsChotModalOpen] = useState(false);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);

  // Standalone Task Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [standaloneTaskForm, setStandaloneTaskForm] = useState({
    title: "",
    description: "",
    due_at: "",
  });

  // Tab 1 Edit Info State
  const [infoForm, setInfoForm] = useState<CreateLeadInput | null>(null);

  // Tab 2 Interaction & Task Form State (Combined)
  const [interactionForm, setInteractionForm] = useState({
    channel: "phone_call",
    summary: "",
    outcome: "",
  });
  const [createReminder, setCreateReminder] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    due_at: "",
  });
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);

  useEffect(() => {
    setSuccessMsg("");
    setErrorMsg("");
    setInteractionForm({
      channel: "phone_call",
      summary: "",
      outcome: "",
    });
    setCreateReminder(false);
    setTaskForm({
      title: "",
      description: "",
      due_at: "",
    });
  }, [leadId]);

  // Queries
  const leadQuery = useQuery({
    queryKey: ["sale", "lead", leadId],
    queryFn: () => saleApi.getLead(leadId!),
    enabled: Boolean(leadId),
  });

  useEffect(() => {
    if (leadQuery.data) {
      setInfoForm({
        full_name: leadQuery.data.full_name,
        phone: leadQuery.data.phone ?? "",
        email: leadQuery.data.email ?? "",
        date_of_birth: leadQuery.data.date_of_birth
          ? leadQuery.data.date_of_birth.substring(0, 10)
          : "",
        gender: leadQuery.data.gender ?? "",
        address: leadQuery.data.address ?? "",
        source: leadQuery.data.source,
        source_detail: leadQuery.data.source_detail ?? "",
        interested_course_id: leadQuery.data.interested_course_id ?? "",
        notes: leadQuery.data.notes ?? "",
      });
    }
  }, [leadQuery.data]);

  const interactionsQuery = useQuery({
    queryKey: ["sale", "lead", leadId, "interactions"],
    queryFn: () => saleApi.listInteractions(leadId!),
    enabled: Boolean(leadId),
  });

  const tasksQuery = useQuery({
    queryKey: ["sale", "lead", leadId, "tasks"],
    queryFn: () => saleApi.listTasksByLead(leadId!),
    enabled: Boolean(leadId),
  });

  const historyQuery = useQuery({
    queryKey: ["sale", "lead", leadId, "pipeline-history"],
    queryFn: () => saleApi.listPipelineHistory(leadId!),
    enabled: Boolean(leadId),
  });

  const staffQuery = useQuery({
    queryKey: ["sale", "staff"],
    queryFn: () => saleApi.listStaff(),
    enabled: isAdmin && Boolean(leadId),
  });

  const coursesQuery = useQuery({
    queryKey: ["sale", "courses"],
    queryFn: () => saleApi.listCourses(),
    enabled: Boolean(leadId),
  });

  const studentClassesQuery = useQuery({
    queryKey: ["sale", "student-class-history", leadQuery.data?.converted_student_id],
    queryFn: () => adminApi.studentClassHistory(leadQuery.data!.converted_student_id!, { page: 1 }),
    enabled: Boolean(leadQuery.data?.converted_student_id),
  });

  const leadOrdersQuery = useQuery({
    queryKey: ["sale", "lead-orders", leadId, leadQuery.data?.converted_student_id],
    queryFn: () =>
      saleApi.listOrders({
        lead_id: leadId!,
        student_id: leadQuery.data?.converted_student_id || undefined,
        per_page: 50,
      }),
    enabled: Boolean(leadId && leadQuery.data?.converted_student_id),
  });
  const leadOrdersCount = leadOrdersQuery.data?.items?.length ?? 0;

  const availableClassesQuery = useQuery({
    queryKey: ["sale", "classes", "available-for-order"],
    queryFn: () => saleApi.listClasses({ capacity: "available" }),
    enabled: isCreateOrderOpen,
  });

  const availableClasses = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return ((availableClassesQuery.data?.items ?? []) as TrainingClass[]).filter((c) => {
      if (c.start_date && c.start_date <= todayStr) {
        return false;
      }
      return c.status === "planning" || c.status === "open";
    });
  }, [availableClassesQuery.data?.items]);

  // Reset tab and messages when leadId changes
  useEffect(() => {
    setActiveTab("info");
    setSuccessMsg("");
    setErrorMsg("");
  }, [leadId]);

  // Mutations
  const updateInfoMutation = useMutation({
    mutationFn: (data: CreateLeadInput) => saleApi.updateLead(leadId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      onLeadUpdated?.();
      setSuccessMsg("Cập nhật thông tin học viên thành công!");
      setErrorMsg("");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: () => saleApi.updateLeadStatus(leadId!, newStatus, statusReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId, "pipeline-history"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      onLeadUpdated?.();
      setIsStatusModalOpen(false);
      setStatusReason("");
      setSuccessMsg("Chuyển trạng thái thành công!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => saleApi.assignLead(leadId!, assignedSaleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      onLeadUpdated?.();
      setIsAssignModalOpen(false);
      setSuccessMsg("Phân bổ Lead thành công!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactionForm.summary.trim()) {
      setErrorMsg("Vui lòng nhập nội dung trao đổi chi tiết");
      return;
    }

    if (createReminder) {
      if (!taskForm.title.trim()) {
        setErrorMsg("Vui lòng nhập tiêu đề việc cần làm");
        return;
      }
      if (!taskForm.due_at) {
        setErrorMsg("Vui lòng chọn thời hạn hoàn thành cho nhắc việc");
        return;
      }
    }

    setIsSubmittingActivity(true);
    setErrorMsg("");

    try {
      await saleApi.createInteraction(leadId!, {
        channel: interactionForm.channel,
        summary: interactionForm.summary.trim(),
        outcome: interactionForm.outcome.trim() || undefined,
      });

      if (createReminder) {
        await saleApi.createTask(leadId!, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          due_at: new Date(taskForm.due_at).toISOString(),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId, "interactions"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      onLeadUpdated?.();

      setInteractionForm({ channel: "phone_call", summary: "", outcome: "" });
      setTaskForm({ title: "", description: "", due_at: "" });
      setCreateReminder(false);
      setSuccessMsg(
        createReminder
          ? "Đã lưu tương tác và tạo nhắc việc thành công!"
          : "Đã ghi nhận tương tác mới thành công!",
      );
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: unknown) {
      setErrorMsg(mutationMessage(err));
    } finally {
      setIsSubmittingActivity(false);
    }
  };

  const createTaskMutation = useMutation({
    mutationFn: () =>
      saleApi.createTask(leadId!, {
        title: standaloneTaskForm.title,
        description: standaloneTaskForm.description || undefined,
        due_at: new Date(standaloneTaskForm.due_at).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      onLeadUpdated?.();
      setIsTaskModalOpen(false);
      setStandaloneTaskForm({ title: "", description: "", due_at: "" });
      setSuccessMsg("Tạo việc cần làm thành công!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => saleApi.completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", leadId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      onLeadUpdated?.();
      setSuccessMsg("Đã đánh dấu hoàn tất công việc!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const lead = leadQuery.data;
  const isConverted = Boolean(lead?.converted_student_id);
  const isStudentLocked = isConverted;

  return (
    <Drawer
      open={Boolean(leadId)}
      onClose={onClose}
      width="max-w-3xl"
      hasBackdrop={false}
      closeOnClickOutside={false}
      disableBodyScroll={false}
      trapFocus={false}
    >
      <div className="flex h-full flex-col bg-slate-50/50">
        {/* Top Navigation Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-gborder/60 bg-white/95 px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-gtext">
            <span className="text-gtext/80">Quản lý Tuyển sinh</span>
            <Icon name="chevron-right" className="h-3 w-3 text-gtext/60" />
            <span className="font-bold text-navy truncate max-w-xs">
              {lead?.full_name || "Chi tiết học viên"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {lead && (
              <Link
                to={`/sale/leads/${lead.id}`}
                target="_blank"
                rel="noreferrer"
                title="Mở toàn màn hình trong tab mới"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs font-medium text-slate-600 hover:border-[#0532e6] hover:bg-blue-50/60 hover:text-[#0532e6] shadow-2xs transition"
              >
                <Icon name="external-link" className="h-3.5 w-3.5" />
                <span>Toàn trang</span>
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gtext transition-all duration-300 hover:scale-110 hover:rotate-90 active:scale-95 hover:bg-slate-100 hover:text-navy cursor-pointer"
              aria-label="Đóng bảng"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <QueryState
          loading={leadQuery.isLoading}
          error={leadQuery.error}
          empty={!lead && !leadQuery.isLoading}
          emptyTitle="Không tìm thấy thông tin Lead"
        >
          {lead && (
            <div className="flex-1 overflow-y-auto">
              {/* Feedback Banners */}
              <div className="px-6 pt-4 space-y-2">
                {successMsg && <SuccessBanner message={successMsg} />}
                {errorMsg && <ErrorBanner message={errorMsg} />}
              </div>

              {/* Profile Header Box (Microsoft 365 + Liquid Glass Style) */}
              <div className="border-b border-gborder/60 bg-white/95 px-6 pt-5 pb-5 backdrop-blur-md">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#001258] via-[#0532e6] to-[#001258] text-xl font-bold text-white shadow-lg ring-4 ring-blue-100/90">
                    {getInitials(lead.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl font-bold tracking-tight text-navy-heading">
                        {lead.full_name}
                      </h2>
                      <LeadPipelineBadge status={lead.pipeline_status} />
                      {isConverted && (
                        <Badge tone="green">
                          Học viên: {lead.converted_student_code ?? "Đã chốt"}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gtext">
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-1.5 font-calibri text-sm font-semibold text-navy hover:text-[#0532e6]"
                        >
                          <Icon name="phone" className="h-3.5 w-3.5 text-gtext" />
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">Chưa có SĐT</span>
                      )}

                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="inline-flex items-center gap-1.5 text-navy hover:text-[#0532e6]"
                        >
                          <Icon name="mail" className="h-3.5 w-3.5 text-gtext" />
                          {lead.email}
                        </a>
                      )}

                      <span>
                        Nguồn: <strong>{getSourceLabel(lead.source)}</strong>
                      </span>

                      <span>
                        Phụ trách: <strong>{lead.assigned_to_email || "Chưa phân bổ"}</strong>
                      </span>
                    </div>

                    {/* Quick Action Buttons Bar */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {!isConverted && (
                        <Button
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200/90 hover:border-[#0532e6] hover:bg-blue-50/50 shadow-2xs"
                          onClick={() => {
                            setNewStatus(lead.pipeline_status);
                            setStatusReason("");
                            setIsStatusModalOpen(true);
                          }}
                        >
                          <Icon name="edit" className="h-3.5 w-3.5 mr-1 text-[#0532e6]" />
                          Chuyển trạng thái
                        </Button>
                      )}

                      {isAdmin && !isConverted && (
                        <Button
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200/90 hover:border-[#0532e6] hover:bg-blue-50/50 shadow-2xs"
                          onClick={() => {
                            setAssignedSaleId(lead.assigned_to || "");
                            setIsAssignModalOpen(true);
                          }}
                        >
                          <Icon name="users" className="h-3.5 w-3.5 mr-1 text-[#0532e6]" />
                          Gán cho Sale
                        </Button>
                      )}

                      {/* Chốt học viên / Tạo & Xem phiếu đăng ký */}
                      {!isConverted ? (
                        <Button
                          type="button"
                          variant="primary"
                          className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                          onClick={() => setIsChotModalOpen(true)}
                        >
                          <Icon name="check" className="h-3.5 w-3.5 mr-1" />
                          Chốt học viên
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200/90 hover:border-emerald-600 hover:bg-emerald-50/50 shadow-2xs cursor-pointer"
                            onClick={() => setIsCreateOrderOpen(true)}
                          >
                            <Icon
                              name="shopping-bag"
                              className="h-3.5 w-3.5 mr-1 text-emerald-600"
                            />
                            Tạo phiếu đăng ký
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer"
                            onClick={() => setActiveTab("orders")}
                          >
                            <Icon name="shopping-bag" className="h-3.5 w-3.5 mr-1" />
                            Xem phiếu đăng ký {leadOrdersCount > 0 && `(${leadOrdersCount})`}
                          </Button>
                          {lead.converted_student_id && (
                            <Link to={`/sale/hoc-vien/${lead.converted_student_id}`}>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 px-2.5 text-xs bg-white text-slate-700 border border-slate-200 hover:border-[#0532e6] hover:bg-blue-50/50 shadow-2xs"
                              >
                                <Icon name="academic" className="h-3.5 w-3.5 mr-1 text-[#0532e6]" />
                                Hồ sơ Học viên 360°
                              </Button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabs Bar inside Drawer */}
                <div className="mt-5 flex gap-4 border-b border-gborder/80 -mb-5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("info")}
                    className={clsx(
                      "pb-3 text-xs font-semibold transition border-b-2",
                      activeTab === "info"
                        ? "border-[#0532e6] text-[#0532e6] font-bold"
                        : "border-transparent text-gtext hover:text-[#0532e6]",
                    )}
                  >
                    Thông tin chi tiết
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("activities")}
                    className={clsx(
                      "pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-1.5",
                      activeTab === "activities"
                        ? "border-[#0532e6] text-[#0532e6] font-bold"
                        : "border-transparent text-gtext hover:text-[#0532e6]",
                    )}
                  >
                    <span>Tương tác & Nhắc việc</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                      {interactionsQuery.data?.length ?? 0}
                    </span>
                    {(tasksQuery.data?.filter((t: LeadTask) => !t.completed_at).length ?? 0) >
                      0 && (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-semibold">
                        {tasksQuery.data?.filter((t: LeadTask) => !t.completed_at).length} việc
                      </span>
                    )}
                  </button>

                  {isConverted && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("orders")}
                      className={clsx(
                        "pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-1.5",
                        activeTab === "orders"
                          ? "border-[#0532e6] text-[#0532e6] font-bold"
                          : "border-transparent text-gtext hover:text-[#0532e6]",
                      )}
                    >
                      <span>Phiếu đăng ký</span>
                      <span
                        className={clsx(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                          leadOrdersCount > 0
                            ? "bg-blue-100 text-[#0532e6]"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {leadOrdersCount}
                      </span>
                    </button>
                  )}

                  {isConverted && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("academic")}
                      className={clsx(
                        "pb-3 text-xs font-semibold transition border-b-2 text-emerald-700",
                        activeTab === "academic"
                          ? "border-emerald-600 text-emerald-800 font-bold"
                          : "border-transparent hover:text-emerald-900",
                      )}
                    >
                      Quá trình học tập
                    </button>
                  )}
                </div>
              </div>

              {/* Tab 1: Thông tin cá nhân & Lịch sử Pipeline */}
              {activeTab === "info" && infoForm && (
                <div className="p-6 space-y-6">
                  {/* Edit Form */}
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        {isStudentLocked ? "Thông tin hồ sơ học viên" : "Chỉnh sửa thông tin liên hệ"}
                      </h3>
                      {isStudentLocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                          <Icon name="lock" className="h-3 w-3" />
                          Định danh đã khóa
                        </span>
                      )}
                    </div>

                    {isStudentLocked && (
                      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                        <Icon name="lock" className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-950">Hồ sơ đã là Học viên chính thức</span>
                          <p className="mt-0.5 text-amber-800 leading-relaxed">
                            Các thông tin định danh (Họ tên, SĐT, Email, Ngày sinh, Khóa học) đã được khóa để bảo vệ tài khoản đăng nhập và tính toàn vẹn dữ liệu đào tạo.
                            Vui lòng liên hệ <strong>Phòng Đào tạo</strong> nếu cần điều chỉnh. Bạn chỉ có thể cập nhật ghi chú chăm sóc bên dưới.
                          </p>
                        </div>
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (isStudentLocked) {
                          updateInfoMutation.mutate({
                            full_name: lead.full_name,
                            phone: lead.phone || undefined,
                            email: lead.email || undefined,
                            date_of_birth: lead.date_of_birth ? lead.date_of_birth.substring(0, 10) : undefined,
                            gender: lead.gender || undefined,
                            address: lead.address || undefined,
                            source: lead.source,
                            source_detail: lead.source_detail || undefined,
                            interested_course_id: lead.interested_course_id || undefined,
                            notes: infoForm.notes?.trim() || undefined,
                          });
                        } else {
                          updateInfoMutation.mutate({
                            ...infoForm,
                            phone: infoForm.phone?.trim() || undefined,
                            email: infoForm.email?.trim() || undefined,
                            date_of_birth: infoForm.date_of_birth || undefined,
                            gender: infoForm.gender || undefined,
                            address: infoForm.address?.trim() || undefined,
                            source_detail: infoForm.source_detail?.trim() || undefined,
                            interested_course_id: infoForm.interested_course_id || undefined,
                            notes: infoForm.notes?.trim() || undefined,
                          });
                        }
                      }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          label="Họ và tên *"
                          required
                          disabled={isStudentLocked}
                          value={infoForm.full_name}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, full_name: e.target.value }))
                          }
                        />
                        <Input
                          label="Số điện thoại"
                          disabled={isStudentLocked}
                          value={infoForm.phone ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, phone: e.target.value }))
                          }
                        />
                        <Input
                          label="Email"
                          type="email"
                          disabled={isStudentLocked}
                          value={infoForm.email ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, email: e.target.value }))
                          }
                        />
                        <Input
                          label="Ngày sinh"
                          type="date"
                          disabled={isStudentLocked}
                          value={infoForm.date_of_birth ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, date_of_birth: e.target.value }))
                          }
                        />
                        <Select
                          label="Giới tính"
                          disabled={isStudentLocked}
                          value={infoForm.gender ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, gender: e.target.value }))
                          }
                        >
                          <option value="">-- Chọn giới tính --</option>
                          <option value="male">Nam</option>
                          <option value="female">Nữ</option>
                          <option value="other">Khác</option>
                        </Select>
                        <Select
                          label="Khóa học quan tâm"
                          disabled={isStudentLocked}
                          value={infoForm.interested_course_id ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({
                              ...prev!,
                              interested_course_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">-- Chưa xác định --</option>
                          {coursesQuery.data?.items.map((c: Course) => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Select
                          label="Nguồn Lead"
                          disabled={isStudentLocked}
                          value={infoForm.source ?? "facebook"}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, source: e.target.value }))
                          }
                        >
                          {SOURCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                        <Input
                          label="Chi tiết nguồn"
                          disabled={isStudentLocked}
                          placeholder="VD: FB Ads T7, mã chiến dịch..."
                          value={infoForm.source_detail ?? ""}
                          onChange={(e) =>
                            setInfoForm((prev) => ({ ...prev!, source_detail: e.target.value }))
                          }
                        />
                      </div>

                      <Input
                        label="Địa chỉ"
                        disabled={isStudentLocked}
                        placeholder="Địa chỉ liên hệ..."
                        value={infoForm.address ?? ""}
                        onChange={(e) =>
                          setInfoForm((prev) => ({ ...prev!, address: e.target.value }))
                        }
                      />

                      <Textarea
                        label="Ghi chú tổng quan"
                        placeholder="Nhu cầu, nguyện vọng, lưu ý đặc biệt..."
                        value={infoForm.notes ?? ""}
                        onChange={(e) =>
                          setInfoForm((prev) => ({ ...prev!, notes: e.target.value }))
                        }
                        rows={2}
                      />

                      <div className="flex justify-end pt-3 border-t border-gborder">
                        <Button
                          type="submit"
                          variant="primary"
                          loading={updateInfoMutation.isPending}
                        >
                          {isStudentLocked ? "Lưu ghi chú chăm sóc" : "Lưu thay đổi"}
                        </Button>
                      </div>
                    </form>
                  </div>

                  {/* Lịch sử trạng thái */}
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-600">
                      Lịch sử thay đổi trạng thái Pipeline
                    </h3>
                    <QueryState
                      loading={historyQuery.isLoading}
                      error={historyQuery.error}
                      empty={historyQuery.data?.length === 0}
                      emptyTitle="Chưa có lịch sử chuyển trạng thái"
                    >
                      <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 py-1">
                        {historyQuery.data?.map((history: LeadPipelineHistory) => (
                          <div key={history.id} className="relative pl-5">
                            <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#0532e6]" />
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                                <div className="flex items-center gap-1.5">
                                  {history.old_status && (
                                    <>
                                      <LeadPipelineBadge status={history.old_status} />
                                      <span className="text-slate-400 text-xs">→</span>
                                    </>
                                  )}
                                  <LeadPipelineBadge status={history.new_status} />
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {formatDateTime(history.changed_at)}
                                </span>
                              </div>

                              {history.reason && (
                                <p className="mt-1.5 text-xs italic text-slate-700">
                                  Lý do: {history.reason}
                                </p>
                              )}

                              <div className="mt-1 text-right text-[10px] text-slate-400">
                                Thực hiện: {history.changed_by_email || "Hệ thống"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </QueryState>
                  </div>
                </div>
              )}

              {/* Tab 2: Tương tác & Nhắc việc */}
              {activeTab === "activities" && (
                <div className="p-6 space-y-6">
                  {/* Form Ghi nhận tương tác & Nhắc việc */}
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Ghi nhận tương tác & Lên lịch nhắc việc
                    </h3>
                    <p className="text-xs text-gtext mb-4">
                      Lưu nội dung trao đổi và tùy chọn tạo việc cần làm tiếp theo.
                    </p>

                    <form onSubmit={handleSaveActivity} className="space-y-3.5">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Select
                          label="Kênh tương tác"
                          value={interactionForm.channel}
                          onChange={(e) =>
                            setInteractionForm((prev) => ({ ...prev, channel: e.target.value }))
                          }
                        >
                          {CHANNEL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                        <div className="sm:col-span-2">
                          <Input
                            label="Kết quả ngắn gọn (Outcome)"
                            placeholder="VD: Hẹn gọi lại tối nay, Đã gửi thông tin..."
                            value={interactionForm.outcome}
                            onChange={(e) =>
                              setInteractionForm((prev) => ({ ...prev, outcome: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <Textarea
                        label="Nội dung trao đổi chi tiết *"
                        required
                        placeholder="Tóm tắt cuộc gọi, tin nhắn hoặc trao đổi với khách hàng..."
                        value={interactionForm.summary}
                        onChange={(e) =>
                          setInteractionForm((prev) => ({ ...prev, summary: e.target.value }))
                        }
                        rows={3}
                      />

                      {/* Option Checkbox: Tạo nhắc việc */}
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={createReminder}
                            onChange={(e) => setCreateReminder(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[#0532e6] focus:ring-[#0532e6] cursor-pointer accent-[#0532e6]"
                          />
                          <div>
                            <span className="text-xs font-bold text-navy">
                              Tạo nhắc việc / hẹn lịch tiếp theo cho Lead này
                            </span>
                            <p className="text-[11px] text-gtext">
                              Tự động đưa vào danh sách việc cần làm để không bị quên
                            </p>
                          </div>
                        </label>

                        {createReminder && (
                          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <Input
                                label="Tiêu đề việc cần làm *"
                                required
                                placeholder="VD: Gọi lại xác nhận học phí..."
                                value={taskForm.title}
                                onChange={(e) =>
                                  setTaskForm((prev) => ({ ...prev, title: e.target.value }))
                                }
                              />
                              <Input
                                label="Thời hạn hoàn thành *"
                                type="datetime-local"
                                required
                                value={taskForm.due_at}
                                onChange={(e) =>
                                  setTaskForm((prev) => ({ ...prev, due_at: e.target.value }))
                                }
                              />
                            </div>
                            <Textarea
                              label="Ghi chú chi tiết cho nhắc việc"
                              placeholder="Ghi chú thêm nội dung cần chuẩn bị..."
                              value={taskForm.description}
                              onChange={(e) =>
                                setTaskForm((prev) => ({ ...prev, description: e.target.value }))
                              }
                              rows={2}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button type="submit" variant="primary" loading={isSubmittingActivity}>
                          <Icon name="check" className="h-4 w-4 mr-1.5" />
                          {createReminder ? "Lưu tương tác & Tạo nhắc việc" : "Lưu tương tác"}
                        </Button>
                      </div>
                    </form>
                  </div>

                  {/* Danh sách việc cần làm */}
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Danh sách việc cần làm ({tasksQuery.data?.length ?? 0})
                        </h3>
                        <p className="text-xs text-gtext">
                          Lịch hẹn, cuộc gọi và nhắc việc cần xử lý
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200 shadow-2xs"
                        onClick={() => {
                          setStandaloneTaskForm({ title: "", description: "", due_at: "" });
                          setIsTaskModalOpen(true);
                        }}
                      >
                        <Icon name="plus" className="h-3.5 w-3.5 mr-1" />
                        Thêm việc mới
                      </Button>
                    </div>

                    <QueryState
                      loading={tasksQuery.isLoading}
                      error={tasksQuery.error}
                      empty={tasksQuery.data?.length === 0}
                      emptyTitle="Chưa có việc cần làm nào cho Lead này"
                    >
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                        {tasksQuery.data?.map((task: LeadTask) => {
                          const isDone = Boolean(task.completed_at);
                          const isOverdue = !isDone && new Date(task.due_at) < new Date();

                          return (
                            <div
                              key={task.id}
                              className={clsx(
                                "flex items-center justify-between p-3.5 transition",
                                isDone && "bg-slate-50/60 opacity-70",
                                isOverdue && "bg-rose-50/50",
                              )}
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={clsx(
                                      "font-semibold text-xs",
                                      isDone ? "line-through text-slate-400" : "text-navy",
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                  {isDone ? (
                                    <Badge tone="green">Đã xong</Badge>
                                  ) : isOverdue ? (
                                    <Badge tone="red">Quá hạn</Badge>
                                  ) : (
                                    <Badge tone="gold">Chờ xử lý</Badge>
                                  )}
                                </div>

                                {task.description && (
                                  <p className="mt-1 text-xs text-slate-500">{task.description}</p>
                                )}

                                <div className="mt-1 flex items-center gap-2.5 text-[11px] text-slate-400">
                                  <span>Hạn: {formatDateTime(task.due_at)}</span>
                                  {task.completed_at && (
                                    <span>• Xong: {formatDateTime(task.completed_at)}</span>
                                  )}
                                </div>
                              </div>

                              {!isDone && (
                                <Button
                                  variant="ghost"
                                  className="h-7 px-2.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                                  loading={
                                    completeTaskMutation.isPending &&
                                    completeTaskMutation.variables === task.id
                                  }
                                  onClick={() => completeTaskMutation.mutate(task.id)}
                                >
                                  <Icon name="check" className="h-3 w-3 mr-1" />
                                  Xong
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </QueryState>
                  </div>

                  {/* Lịch sử trao đổi */}
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
                      Lịch sử trao đổi & chăm sóc ({interactionsQuery.data?.length ?? 0})
                    </h3>
                    <QueryState
                      loading={interactionsQuery.isLoading}
                      error={interactionsQuery.error}
                      empty={interactionsQuery.data?.length === 0}
                      emptyTitle="Chưa có tương tác nào được ghi nhận"
                    >
                      <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 py-1">
                        {interactionsQuery.data?.map((interaction: LeadInteraction) => (
                          <div key={interaction.id} className="relative pl-5">
                            <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-navy" />
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                                <div className="flex items-center gap-2">
                                  <Badge tone="navy">{getChannelLabel(interaction.channel)}</Badge>
                                  {interaction.outcome && (
                                    <span className="text-xs font-semibold text-[#0532e6]">
                                      ★ {interaction.outcome}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {formatDateTime(interaction.created_at)}
                                </span>
                              </div>

                              <p className="mt-2 text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                                {interaction.summary}
                              </p>

                              <div className="mt-2 text-right text-[10px] text-slate-400">
                                Ghi bởi: {interaction.created_by_email || "Nhân viên"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </QueryState>
                  </div>
                </div>
              )}

              {/* Tab: Phiếu đăng ký học viên (nếu đã convert) */}
              {activeTab === "orders" && isConverted && lead && (
                <div className="p-6">
                  <LeadOrdersTab
                    leadId={lead.id}
                    studentId={lead.converted_student_id || undefined}
                    onCreateOrder={() => setIsCreateOrderOpen(true)}
                  />
                </div>
              )}

              {/* Tab 3: Quá trình học tập (nếu đã convert) */}
              {activeTab === "academic" && isConverted && (
                <div className="p-6 space-y-4">
                  <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-card backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-gborder pb-3 mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-navy-heading">
                          Hồ sơ Đào tạo Chính thức
                        </h3>
                        <p className="text-xs text-gtext">
                          Học viên đã được chốt và kích hoạt hồ sơ trong hệ thống đào tạo.
                        </p>
                      </div>
                      {lead.converted_student_id && (
                        <Link to={`/sale/hoc-vien/${lead.converted_student_id}`}>
                          <Button variant="primary" className="text-xs">
                            Hồ sơ 360° →
                          </Button>
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                        <span className="text-[11px] font-medium text-slate-400 block uppercase">
                          Mã Học Viên
                        </span>
                        <p className="mt-1 text-base font-bold text-blue-700 font-mono">
                          {lead.converted_student_code ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                        <span className="text-[11px] font-medium text-slate-400 block uppercase">
                          Ngày Chuyển Đổi
                        </span>
                        <p className="mt-1 text-xs font-semibold text-slate-800">
                          {formatDateTime(lead.converted_at)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                        <span className="text-[11px] font-medium text-slate-400 block uppercase">
                          Trạng Thái Đào Tạo
                        </span>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Đang học / Đã đăng ký
                        </p>
                      </div>
                    </div>

                    {/* Danh sách lớp học đã ghi danh */}
                    <div className="mt-5 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Lớp học đang tham gia ({studentClassesQuery.data?.items.length ?? 0})
                      </h4>
                      {studentClassesQuery.isLoading ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          Đang tải thông tin lớp học...
                        </div>
                      ) : (studentClassesQuery.data?.items ?? []).length > 0 ? (
                        <div className="space-y-2">
                          {studentClassesQuery.data?.items.map((c) => (
                            <div
                              key={c.enrollment_id}
                              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs hover:border-blue-300 transition-colors"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-700 text-xs">
                                    {c.class_code}
                                  </span>
                                  <span className="text-xs text-slate-800 font-medium">
                                    {c.class_name}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Khóa học: {c.course_name}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Đang học
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                          Chưa có lịch sử lớp học đào tạo trực tiếp.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </QueryState>

        {/* Modal: Chuyển Trạng Thái */}
        <Modal
          open={isStatusModalOpen}
          title="Chuyển trạng thái Pipeline"
          onClose={() => setIsStatusModalOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateStatusMutation.mutate();
            }}
            className="space-y-4"
          >
            <Select
              label="Trạng thái mới *"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as LeadPipelineStatus)}
            >
              {PIPELINE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>

            <Textarea
              label="Lý do chuyển trạng thái (nếu có)"
              placeholder="VD: Khách hàng đồng ý đăng ký, hẹn sang tuần tư vấn tiếp..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              rows={2}
            />

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gborder">
              <Button type="button" variant="ghost" onClick={() => setIsStatusModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" loading={updateStatusMutation.isPending}>
                Cập nhật trạng thái
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Gán cho Sale (ADMIN only) */}
        {isAdmin && (
          <Modal
            open={isAssignModalOpen}
            title="Phân bổ Lead cho nhân viên Sale"
            onClose={() => setIsAssignModalOpen(false)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!assignedSaleId) return;
                assignMutation.mutate();
              }}
              className="space-y-4"
            >
              <Select
                label="Chọn Sale phụ trách *"
                required
                value={assignedSaleId}
                onChange={(e) => setAssignedSaleId(e.target.value)}
              >
                <option value="">-- Chọn nhân viên --</option>
                {staffQuery.data?.map((staff: SaleStaff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.email}
                  </option>
                ))}
              </Select>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gborder">
                <Button type="button" variant="ghost" onClick={() => setIsAssignModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={assignMutation.isPending}>
                  Xác nhận phân bổ
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Thêm việc cần làm / Lịch hẹn mới */}
        <Modal
          open={isTaskModalOpen}
          title="Tạo việc cần làm / Hẹn lịch"
          onClose={() => setIsTaskModalOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!standaloneTaskForm.title.trim() || !standaloneTaskForm.due_at) return;
              createTaskMutation.mutate();
            }}
            className="space-y-4"
          >
            <Input
              label="Tiêu đề việc cần làm *"
              required
              placeholder="VD: Gọi lại tư vấn học phí, Gửi đề cương..."
              value={standaloneTaskForm.title}
              onChange={(e) =>
                setStandaloneTaskForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />

            <Input
              label="Thời hạn hoàn thành *"
              type="datetime-local"
              required
              value={standaloneTaskForm.due_at}
              onChange={(e) =>
                setStandaloneTaskForm((prev) => ({ ...prev, due_at: e.target.value }))
              }
            />

            <Textarea
              label="Ghi chú chi tiết"
              placeholder="Ghi chú thêm về nội dung cần làm..."
              value={standaloneTaskForm.description}
              onChange={(e) =>
                setStandaloneTaskForm((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={2}
            />

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gborder">
              <Button type="button" variant="ghost" onClick={() => setIsTaskModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" loading={createTaskMutation.isPending}>
                Tạo việc
              </Button>
            </div>
          </form>
        </Modal>
        {/* Modal: Xác nhận Chốt học viên & Cấp tài khoản */}
        <ConfirmChotLeadModal
          open={isChotModalOpen}
          lead={lead ?? null}
          onClose={() => setIsChotModalOpen(false)}
          onSuccess={(result) => {
            queryClient.invalidateQueries({ queryKey: ["sale"] });
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            onLeadUpdated?.();
            setSuccessMsg(
              `Đã chốt học viên ${lead?.full_name ?? ""} thành công! Mã học viên: ${result.student_code}`,
            );
            setTimeout(() => setSuccessMsg(""), 5000);
          }}
        />

        {/* Modal: Lập Phiếu đăng ký mới */}
        {isCreateOrderOpen && lead && (
          <CreateRegistrationOrderModal
            open={isCreateOrderOpen}
            onClose={() => setIsCreateOrderOpen(false)}
            selectableLeads={[lead]}
            isLoadingLeads={false}
            availableClasses={availableClasses}
            defaultLeadId={lead.id}
            defaultClassId={
              lead.interested_course_id
                ? availableClasses.find((c) => c.course_id === lead.interested_course_id)?.id
                : undefined
            }
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["sale"] });
              setActiveTab("orders");
              setSuccessMsg("Lập phiếu đăng ký cho học viên thành công!");
              setTimeout(() => setSuccessMsg(""), 5000);
            }}
          />
        )}
      </div>
    </Drawer>
  );
}
