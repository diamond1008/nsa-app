import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";

import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import {
  Badge,
  Button,
  Card,
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

type TabKey = "info" | "activities" | "academic";

export function LeadProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Modals
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<LeadPipelineStatus>("follow");
  const [statusReason, setStatusReason] = useState("");

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignedSaleId, setAssignedSaleId] = useState("");

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

  // Queries
  const leadQuery = useQuery({
    queryKey: ["sale", "lead", id],
    queryFn: async () => {
      const data = await saleApi.getLead(id!);
      setInfoForm({
        full_name: data.full_name,
        phone: data.phone ?? "",
        email: data.email ?? "",
        date_of_birth: data.date_of_birth ? data.date_of_birth.substring(0, 10) : "",
        gender: data.gender ?? "",
        address: data.address ?? "",
        source: data.source,
        source_detail: data.source_detail ?? "",
        interested_course_id: data.interested_course_id ?? "",
        notes: data.notes ?? "",
      });
      return data;
    },
    enabled: Boolean(id),
  });

  const interactionsQuery = useQuery({
    queryKey: ["sale", "lead", id, "interactions"],
    queryFn: () => saleApi.listInteractions(id!),
    enabled: Boolean(id),
  });

  const tasksQuery = useQuery({
    queryKey: ["sale", "lead", id, "tasks"],
    queryFn: () => saleApi.listTasksByLead(id!),
    enabled: Boolean(id),
  });

  const historyQuery = useQuery({
    queryKey: ["sale", "lead", id, "pipeline-history"],
    queryFn: () => saleApi.listPipelineHistory(id!),
    enabled: Boolean(id),
  });

  const staffQuery = useQuery({
    queryKey: ["sale", "staff"],
    queryFn: () => saleApi.listStaff(),
    enabled: isAdmin,
  });

  const coursesQuery = useQuery({
    queryKey: ["sale", "courses"],
    queryFn: () => saleApi.listCourses(),
  });

  // Mutations
  const updateInfoMutation = useMutation({
    mutationFn: (data: CreateLeadInput) => saleApi.updateLead(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", id] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      setSuccessMsg("Cập nhật thông tin Lead thành công!");
      setErrorMsg("");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: () => saleApi.updateLeadStatus(id!, newStatus, statusReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", id] });
      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "pipeline-history"],
      });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setIsStatusModalOpen(false);
      setStatusReason("");
      setSuccessMsg("Chuyển trạng thái Lead thành công!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const quickChotMutation = useMutation({
    mutationFn: () => saleApi.updateLeadStatus(id!, "da_dang_ky", "Chốt học viên thành công"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", id] });
      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "pipeline-history"],
      });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setSuccessMsg("Đã chốt học viên thành công! Bạn có thể tạo phiếu đăng ký cho học viên này.");
      setTimeout(() => setSuccessMsg(""), 5000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => saleApi.assignLead(id!, assignedSaleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", id] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
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
      await saleApi.createInteraction(id!, {
        channel: interactionForm.channel,
        summary: interactionForm.summary.trim(),
        outcome: interactionForm.outcome.trim() || undefined,
      });

      if (createReminder) {
        await saleApi.createTask(id!, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          due_at: new Date(taskForm.due_at).toISOString(),
        });
      }

      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "interactions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "tasks"],
      });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });

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
      saleApi.createTask(id!, {
        title: standaloneTaskForm.title,
        description: standaloneTaskForm.description || undefined,
        due_at: standaloneTaskForm.due_at
          ? new Date(standaloneTaskForm.due_at).toISOString()
          : new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "tasks"],
      });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setStandaloneTaskForm({ title: "", description: "", due_at: "" });
      setIsTaskModalOpen(false);
      setSuccessMsg("Đã tạo lịch nhắc việc mới!");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: unknown) => {
      setErrorMsg(mutationMessage(err));
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => saleApi.completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sale", "lead", id, "tasks"],
      });
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
    },
  });

  const lead = leadQuery.data;

  if (leadQuery.isLoading) {
    return (
      <div className="py-12 text-center">
        <QueryState loading={true} error={null}>
          <div />
        </QueryState>
      </div>
    );
  }

  if (leadQuery.error || !lead) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Không tìm thấy Lead hoặc bạn không có quyền truy cập." />
        <Button variant="ghost" onClick={() => navigate("/sale/leads")}>
          ← Quay lại danh sách Lead
        </Button>
      </div>
    );
  }

  const isConverted = Boolean(lead.converted_student_id);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Feedback */}
      <div className="flex items-center gap-2 text-sm text-gtext">
        <Link to="/sale/leads" className="hover:text-navy hover:underline">
          Lead Tuyển sinh
        </Link>
        <span>/</span>
        <span className="font-semibold text-navy">{lead.full_name}</span>
      </div>

      {successMsg && <SuccessBanner message={successMsg} />}
      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Profile Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-navy-heading">{lead.full_name}</h1>
              <LeadPipelineBadge status={lead.pipeline_status} />
              {isConverted && (
                <Badge tone="green">Học viên: {lead.converted_student_code ?? "Đã convert"}</Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gtext">
              {lead.phone && (
                <span className="inline-flex items-center gap-1.5 font-mono text-navy font-medium">
                  <Icon name="phone" className="h-4 w-4 text-gtext" />
                  {lead.phone}
                </span>
              )}
              {lead.email && (
                <span className="inline-flex items-center gap-1.5 text-navy">
                  <Icon name="mail" className="h-4 w-4 text-gtext" />
                  {lead.email}
                </span>
              )}
              <span>•</span>
              <span>
                Nguồn: <strong>{getSourceLabel(lead.source)}</strong>
              </span>
              <span>•</span>
              <span>
                Phụ trách: <strong>{lead.assigned_to_email || "Chưa phân bổ"}</strong>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
            <Button
              variant="ghost"
              onClick={() => {
                setNewStatus(lead.pipeline_status);
                setStatusReason("");
                setIsStatusModalOpen(true);
              }}
            >
              <Icon name="edit" className="h-4 w-4" />
              Chuyển trạng thái
            </Button>

            {isAdmin && (
              <Button
                variant="ghost"
                onClick={() => {
                  setAssignedSaleId(lead.assigned_to || "");
                  setIsAssignModalOpen(true);
                }}
              >
                <Icon name="users" className="h-4 w-4" />
                Gán cho Sale
              </Button>
            )}

            {/* Chốt học viên / Tạo phiếu đăng ký */}
            {lead.pipeline_status !== "da_dang_ky" &&
            lead.pipeline_status !== "dang_hoc" &&
            !isConverted ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                  onClick={() => quickChotMutation.mutate()}
                  loading={quickChotMutation.isPending}
                >
                  <Icon name="check" className="h-4 w-4 mr-1" />
                  Chốt học viên
                </Button>
                <Link to={`/sale/phieu-dang-ky?lead_id=${lead.id}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-slate-700 bg-white border border-slate-200/90 hover:border-emerald-600 hover:bg-emerald-50/50 shadow-2xs"
                  >
                    <Icon name="shopping-bag" className="h-4 w-4 mr-1 text-emerald-600" />
                    Tạo phiếu đăng ký
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to={`/sale/phieu-dang-ky?lead_id=${lead.id}`}>
                  <Button
                    type="button"
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                  >
                    <Icon name="shopping-bag" className="h-4 w-4 mr-1" />
                    Tạo phiếu đăng ký
                  </Button>
                </Link>
                {lead.converted_student_id && (
                  <Link to={`/admin/hoc-vien/${lead.converted_student_id}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="bg-white text-slate-700 border border-slate-200 hover:border-[#0532e6] shadow-2xs"
                    >
                      <Icon name="academic" className="h-4 w-4 mr-1 text-[#0532e6]" />
                      Hồ sơ Học viên →
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-gborder pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={clsx(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px",
              activeTab === "info"
                ? "border-[#0532e6] text-[#0532e6] font-bold"
                : "border-transparent text-gtext hover:text-[#0532e6]",
            )}
          >
            Thông tin cá nhân
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("activities")}
            className={clsx(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2",
              activeTab === "activities"
                ? "border-[#0532e6] text-[#0532e6] font-bold"
                : "border-transparent text-gtext hover:text-[#0532e6]",
            )}
          >
            <span>Tương tác & Nhắc việc</span>
            <span className="rounded-full bg-gbg2 px-2 py-0.5 text-xs text-gtext font-normal">
              {interactionsQuery.data?.length ?? 0}
            </span>
            {(tasksQuery.data?.filter((t: LeadTask) => !t.completed_at).length ?? 0) > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold">
                {tasksQuery.data?.filter((t: LeadTask) => !t.completed_at).length} việc
              </span>
            )}
          </button>
          {isConverted && (
            <button
              type="button"
              onClick={() => setActiveTab("academic")}
              className={clsx(
                "px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px text-emerald-700",
                activeTab === "academic"
                  ? "border-emerald-600 text-emerald-800 font-bold"
                  : "border-transparent hover:text-emerald-900",
              )}
            >
              Quá trình học tập
            </button>
          )}
        </div>
      </Card>

      {/* Tab 1: Thông tin cá nhân & Lịch sử trạng thái */}
      {activeTab === "info" && infoForm && (
        <div className="space-y-6">
          <Card className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
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
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Họ và tên *"
                  required
                  value={infoForm.full_name}
                  onChange={(e) => setInfoForm((prev) => ({ ...prev!, full_name: e.target.value }))}
                />
                <Input
                  label="Số điện thoại"
                  value={infoForm.phone ?? ""}
                  onChange={(e) => setInfoForm((prev) => ({ ...prev!, phone: e.target.value }))}
                />
                <Input
                  label="Email"
                  type="email"
                  value={infoForm.email ?? ""}
                  onChange={(e) => setInfoForm((prev) => ({ ...prev!, email: e.target.value }))}
                />
                <Input
                  label="Ngày sinh"
                  type="date"
                  value={infoForm.date_of_birth ?? ""}
                  onChange={(e) =>
                    setInfoForm((prev) => ({ ...prev!, date_of_birth: e.target.value }))
                  }
                />
                <Select
                  label="Giới tính"
                  value={infoForm.gender ?? ""}
                  onChange={(e) => setInfoForm((prev) => ({ ...prev!, gender: e.target.value }))}
                >
                  <option value="">-- Chọn giới tính --</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                  <option value="other">Khác</option>
                </Select>
                <Select
                  label="Khóa học quan tâm"
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Nguồn Lead"
                  value={infoForm.source ?? "facebook"}
                  onChange={(e) => setInfoForm((prev) => ({ ...prev!, source: e.target.value }))}
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Chi tiết nguồn"
                  placeholder="VD: FB Ads T7, mã chiến dịch..."
                  value={infoForm.source_detail ?? ""}
                  onChange={(e) =>
                    setInfoForm((prev) => ({ ...prev!, source_detail: e.target.value }))
                  }
                />
              </div>

              <Input
                label="Địa chỉ"
                placeholder="Địa chỉ liên hệ..."
                value={infoForm.address ?? ""}
                onChange={(e) => setInfoForm((prev) => ({ ...prev!, address: e.target.value }))}
              />

              <Textarea
                label="Ghi chú tổng quan"
                placeholder="Nhu cầu, nguyện vọng, lưu ý đặc biệt..."
                value={infoForm.notes ?? ""}
                onChange={(e) => setInfoForm((prev) => ({ ...prev!, notes: e.target.value }))}
              />

              <div className="flex justify-end pt-4 border-t border-gborder">
                <Button type="submit" variant="primary" loading={updateInfoMutation.isPending}>
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </Card>

          {/* Lịch sử trạng thái nằm dưới thông tin cá nhân */}
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-navy-heading">
              Lịch sử thay đổi trạng thái Pipeline
            </h3>
            <QueryState
              loading={historyQuery.isLoading}
              error={historyQuery.error}
              empty={historyQuery.data?.length === 0}
              emptyTitle="Chưa có lịch sử chuyển trạng thái"
            >
              <div className="relative border-l-2 border-gborder ml-4 space-y-6 py-2">
                {historyQuery.data?.map((history: LeadPipelineHistory) => (
                  <div key={history.id} className="relative pl-6">
                    <div className="absolute -left-2 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#0532e6]" />
                    <div className="rounded-xl border border-gborder/80 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gborder/60 pb-2">
                        <div className="flex items-center gap-2">
                          {history.old_status ? (
                            <>
                              <LeadPipelineBadge status={history.old_status} />
                              <span className="text-gtext text-xs">→</span>
                            </>
                          ) : null}
                          <LeadPipelineBadge status={history.new_status} />
                        </div>
                        <span className="text-xs text-gtext">
                          {formatDateTime(history.changed_at)}
                        </span>
                      </div>

                      {history.reason && (
                        <p className="mt-2 text-xs italic text-navy/80">Lý do: {history.reason}</p>
                      )}

                      <div className="mt-2 text-right text-[11px] text-gtext">
                        Thực hiện: {history.changed_by_email || "Hệ thống"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </QueryState>
          </Card>
        </div>
      )}

      {/* Tab 2: Tương tác & Nhắc việc (Gộp chung) */}
      {activeTab === "activities" && (
        <div className="space-y-6">
          {/* Form Ghi nhận tương tác & Nhắc việc kết hợp */}
          <Card className="p-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-navy-heading">
                Ghi nhận tương tác & Lên lịch nhắc việc
              </h3>
              <p className="text-xs text-gtext">
                Ghi nhận nội dung trao đổi và tùy chọn tạo nhắc việc tiếp theo chỉ với một lần lưu.
              </p>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-4">
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
                    placeholder="VD: Hẹn gọi lại tối nay, Đã gửi học phí, Khách quan tâm..."
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
                placeholder="Tóm tắt cuộc gọi, tin nhắn hoặc buổi gặp gỡ với khách hàng..."
                value={interactionForm.summary}
                onChange={(e) =>
                  setInteractionForm((prev) => ({ ...prev, summary: e.target.value }))
                }
              />

              {/* Option Checkbox: Tạo nhắc việc */}
              <div className="rounded-xl border border-gborder/80 bg-gbg/40 p-4 transition">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createReminder}
                    onChange={(e) => setCreateReminder(e.target.checked)}
                    className="h-4 w-4 rounded border-gborder text-navy focus:ring-navy cursor-pointer accent-navy"
                  />
                  <div>
                    <span className="text-sm font-bold text-navy">
                      Tạo nhắc việc / hẹn lịch tiếp theo cho Lead này
                    </span>
                    <p className="text-xs text-gtext">
                      Tự động thêm vào danh sách nhắc việc và thông báo khi đến hạn
                    </p>
                  </div>
                </label>

                {createReminder && (
                  <div className="mt-4 space-y-3 border-t border-gborder/70 pt-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Tiêu đề việc cần làm *"
                        required
                        placeholder="VD: Gọi lại xác nhận học phí, Gửi đề cương qua Zalo..."
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
                      placeholder="Ghi chú thêm về nội dung cần làm..."
                      value={taskForm.description}
                      onChange={(e) =>
                        setTaskForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" variant="primary" loading={isSubmittingActivity}>
                  <Icon name="check" className="h-4 w-4" />
                  {createReminder ? "Lưu tương tác & Tạo nhắc việc" : "Lưu tương tác"}
                </Button>
              </div>
            </form>
          </Card>

          {/* Danh sách việc cần làm cho Lead này */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy-heading">
                  Danh sách việc cần làm ({tasksQuery.data?.length ?? 0})
                </h3>
                <p className="text-xs text-gtext">
                  Các lịch hẹn, cuộc gọi và công việc phụ trách với Lead này
                </p>
              </div>
              <Button
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setStandaloneTaskForm({ title: "", description: "", due_at: "" });
                  setIsTaskModalOpen(true);
                }}
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Thêm việc mới
              </Button>
            </div>

            <QueryState
              loading={tasksQuery.isLoading}
              error={tasksQuery.error}
              empty={tasksQuery.data?.length === 0}
              emptyTitle="Chưa có việc cần làm nào cho Lead này"
            >
              <div className="divide-y divide-gborder/70 rounded-xl border border-gborder/70 bg-white">
                {tasksQuery.data?.map((task: LeadTask) => {
                  const isDone = Boolean(task.completed_at);
                  const isOverdue = !isDone && new Date(task.due_at) < new Date();

                  return (
                    <div
                      key={task.id}
                      className={clsx(
                        "flex items-center justify-between p-4 transition",
                        isDone && "bg-gbg/30 opacity-70",
                        isOverdue && "bg-rose-50/50",
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "font-semibold text-sm",
                              isDone ? "line-through text-gtext" : "text-navy",
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
                          <p className="mt-1 text-xs text-gtext">{task.description}</p>
                        )}

                        <div className="mt-1.5 flex items-center gap-3 text-xs text-gtext">
                          <span>Hạn: {formatDateTime(task.due_at)}</span>
                          {task.completed_at && (
                            <span>• Hoàn thành: {formatDateTime(task.completed_at)}</span>
                          )}
                        </div>
                      </div>

                      {!isDone && (
                        <Button
                          variant="ghost"
                          className="h-8 px-3 text-xs text-emerald-700 hover:bg-emerald-50"
                          loading={
                            completeTaskMutation.isPending &&
                            completeTaskMutation.variables === task.id
                          }
                          onClick={() => completeTaskMutation.mutate(task.id)}
                        >
                          <Icon name="check" className="h-3.5 w-3.5" />
                          Hoàn tất
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </QueryState>
          </Card>

          {/* Lịch sử trao đổi & chăm sóc */}
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-navy-heading">
              Lịch sử trao đổi & chăm sóc ({interactionsQuery.data?.length ?? 0})
            </h3>
            <QueryState
              loading={interactionsQuery.isLoading}
              error={interactionsQuery.error}
              empty={interactionsQuery.data?.length === 0}
              emptyTitle="Chưa có tương tác nào được ghi nhận"
            >
              <div className="relative border-l-2 border-gborder ml-4 space-y-6 py-2">
                {interactionsQuery.data?.map((interaction: LeadInteraction) => (
                  <div key={interaction.id} className="relative pl-6">
                    <div className="absolute -left-2 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-navy" />

                    <div className="rounded-xl border border-gborder/80 bg-gbg/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gborder/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="navy">{getChannelLabel(interaction.channel)}</Badge>
                          {interaction.outcome && (
                            <span className="text-xs font-semibold text-[#0532e6]">
                              ★ {interaction.outcome}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gtext">
                          {formatDateTime(interaction.created_at)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-navy whitespace-pre-line">
                        {interaction.summary}
                      </p>

                      <div className="mt-2 text-right text-[11px] text-gtext">
                        Ghi bởi: {interaction.created_by_email || "Nhân viên"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </QueryState>
          </Card>
        </div>
      )}

      {/* Tab 5: Quá trình học tập (nếu đã convert) */}
      {activeTab === "academic" && isConverted && (
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-gborder pb-4">
            <div>
              <h3 className="text-base font-bold text-navy-heading">Hồ sơ Đào tạo Chính thức</h3>
              <p className="text-xs text-gtext">
                Lead đã chuyển đổi thành Học viên và có hồ sơ học tập trong hệ thống đào tạo.
              </p>
            </div>
            {lead.converted_student_id && (
              <Link to={`/admin/hoc-vien/${lead.converted_student_id}`}>
                <Button variant="primary">Xem hồ sơ chi tiết (360°) →</Button>
              </Link>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-xl bg-gbg/60 p-4 border border-gborder">
              <span className="text-xs font-medium text-gtext uppercase">Mã Học Viên</span>
              <p className="mt-1 text-lg font-bold text-navy tabular-nums">
                {lead.converted_student_code ?? "—"}
              </p>
            </div>
            <div className="rounded-xl bg-gbg/60 p-4 border border-gborder">
              <span className="text-xs font-medium text-gtext uppercase">Ngày Chuyển Đổi</span>
              <p className="mt-1 text-sm font-semibold text-navy">
                {formatDateTime(lead.converted_at)}
              </p>
            </div>
            <div className="rounded-xl bg-gbg/60 p-4 border border-gborder">
              <span className="text-xs font-medium text-gtext uppercase">Trạng Thái Đào Tạo</span>
              <p className="mt-1 text-sm font-semibold text-emerald-700">Đang học / Đã đăng ký</p>
            </div>
          </div>
        </Card>
      )}

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
          />

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gborder">
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

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gborder">
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
            placeholder="VD: Gọi lại tư vấn học phí, Gửi báo giá..."
            value={standaloneTaskForm.title}
            onChange={(e) => setStandaloneTaskForm((prev) => ({ ...prev, title: e.target.value }))}
          />

          <Input
            label="Thời hạn hoàn thành *"
            type="datetime-local"
            required
            value={standaloneTaskForm.due_at}
            onChange={(e) => setStandaloneTaskForm((prev) => ({ ...prev, due_at: e.target.value }))}
          />

          <Textarea
            label="Ghi chú chi tiết"
            placeholder="Ghi chú thêm về nội dung cần làm..."
            value={standaloneTaskForm.description}
            onChange={(e) =>
              setStandaloneTaskForm((prev) => ({ ...prev, description: e.target.value }))
            }
          />

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gborder">
            <Button type="button" variant="ghost" onClick={() => setIsTaskModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" loading={createTaskMutation.isPending}>
              Tạo việc
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
