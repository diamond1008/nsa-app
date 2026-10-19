import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";

import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import {
  Button,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Course, Lead, SaleStaff } from "../../lib/domainTypes";
import { formatDate, mutationMessage } from "../../lib/format";
import { LeadChartsView } from "./LeadChartsView";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { saleApi } from "./saleApi";
import type { CreateLeadInput, DuplicateCheckResponse, LeadImportResult } from "./saleApi";
import {
  getPipelineStatusLabel,
  getSourceLabel,
  LeadPipelineBadge,
  PIPELINE_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from "./saleShared";

export function LeadPipelinePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const queryClient = useQueryClient();

  // Slide-over Drawer Selected Lead
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Sorting: default to newest leads first
  const [sort, setSort] = useState<{ key: string; order: "asc" | "desc" }>({
    key: "created_at",
    order: "desc",
  });

  // Measure sticky FilterBar height dynamically so table headers dock right below it
  const filterBarRef = useRef<HTMLElement>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(58);

  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) {
        setFilterBarHeight(Math.round(rect.height));
      }
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // View Mode: Table vs Charts
  const [viewMode, setViewMode] = useState<"table" | "charts">(() => {
    const saved = localStorage.getItem("nsa_lead_view_mode");
    if (saved === "table" || saved === "charts") return saved;
    return "table";
  });

  const handleSetViewMode = (mode: "table" | "charts") => {
    setViewMode(mode);
    localStorage.setItem("nsa_lead_view_mode", mode);
  };

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Create Modal & Duplicate Check
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateCheckResponse | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const [formData, setFormData] = useState<CreateLeadInput>({
    full_name: "",
    phone: "",
    email: "",
    source: "facebook",
    source_detail: "",
    interested_course_id: "",
    notes: "",
    assigned_to: "",
  });

  const debouncedPhone = useDebouncedValue(formData.phone, 400);
  const debouncedEmail = useDebouncedValue(formData.email, 400);

  useEffect(() => {
    if (!isCreateOpen) {
      setDuplicateInfo(null);
      return;
    }
    const phone = debouncedPhone?.trim() || "";
    const email = debouncedEmail?.trim() || "";
    if (!phone && !email) {
      setDuplicateInfo(null);
      return;
    }
    let active = true;
    setIsCheckingDuplicate(true);
    saleApi
      .checkDuplicate({ phone: phone || undefined, email: email || undefined })
      .then((res) => {
        if (active) {
          setDuplicateInfo(res);
        }
      })
      .catch(() => {
        if (active) setDuplicateInfo(null);
      })
      .finally(() => {
        if (active) setIsCheckingDuplicate(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedPhone, debouncedEmail, isCreateOpen]);

  // Import Modal & State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<LeadImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async (format: "xlsx" | "csv" = "xlsx") => {
    setIsDownloadingTemplate(true);
    setImportError("");
    try {
      const blob = await saleApi.downloadLeadTemplate(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "csv" ? "mau_nhap_lead_tuyen_sinh.csv" : "mau_nhap_lead_tuyen_sinh.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportError(mutationMessage(err));
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleExportLeads = async () => {
    setIsExporting(true);
    setExportError("");
    try {
      const blob = await saleApi.exportLeads({
        search: debouncedSearch || undefined,
        pipeline_status: statusFilter || undefined,
        source: sourceFilter || undefined,
        assigned_to: assignedFilter || undefined,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `danh_sach_lead_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(mutationMessage(err));
    } finally {
      setIsExporting(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (file: File) => saleApi.importLeads(file),
    onSuccess: (data) => {
      setImportResult(data);
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
        queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      }
    },
    onError: (err) => {
      setImportError(mutationMessage(err));
    },
  });

  // Queries
  const leadsQuery = useQuery({
    queryKey: [
      "sale",
      "leads",
      {
        page,
        per_page: viewMode === "charts" ? 100 : perPage,
        search: debouncedSearch,
        pipeline_status: statusFilter,
        source: sourceFilter,
        assigned_to: assignedFilter,
        created_from: fromDate,
        created_to: toDate,
        sort_by: sort.key,
        sort_order: sort.order,
      },
    ],
    queryFn: () =>
      saleApi.listLeads({
        page,
        per_page: viewMode === "charts" ? 100 : perPage,
        search: debouncedSearch || undefined,
        pipeline_status: statusFilter || undefined,
        source: sourceFilter || undefined,
        assigned_to: assignedFilter || undefined,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
        sort_by: sort.key,
        sort_order: sort.order,
      }),
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

  // Create Lead Mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateLeadInput) => saleApi.createLead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setIsCreateOpen(false);
      setFormData({
        full_name: "",
        phone: "",
        email: "",
        source: "facebook",
        source_detail: "",
        interested_course_id: "",
        notes: "",
        assigned_to: "",
      });
      setFormError("");
    },
    onError: (err: unknown) => {
      setFormError(mutationMessage(err));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      setFormError("Họ và tên không được để trống.");
      return;
    }
    createMutation.mutate({
      ...formData,
      interested_course_id: formData.interested_course_id || undefined,
      assigned_to: formData.assigned_to || undefined,
      phone: formData.phone?.trim() || undefined,
      email: formData.email?.trim() || undefined,
      source_detail: formData.source_detail?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  const columns: Column<Lead>[] = [
    {
      header: "STT",
      className: "w-12 text-center font-medium text-gtext",
      cell: (_, index) => (
        <span className="font-calibri text-[13px] font-medium text-gtext">
          {(page - 1) * perPage + index + 1}
        </span>
      ),
    },
    {
      header: "Ngày tạo",
      className: "min-w-[105px] whitespace-nowrap",
      sortKey: "created_at",
      cell: (lead) => (
        <span className="font-calibri text-[13px] text-gtext">{formatDate(lead.created_at)}</span>
      ),
    },
    {
      header: "Tên",
      className: "min-w-[160px]",
      sortKey: "full_name",
      cell: (lead) => (
        <div>
          <button
            type="button"
            onClick={() => setSelectedLeadId(lead.id)}
            className={clsx(
              "font-semibold text-left cursor-pointer transition-colors hover:underline",
              selectedLeadId === lead.id
                ? "text-[#0532e6] font-bold"
                : "text-navy hover:text-[#0532e6]",
            )}
          >
            {lead.full_name}
          </button>
          {lead.email && (
            <div className="text-xs text-gtext truncate max-w-[180px]">{lead.email}</div>
          )}
        </div>
      ),
    },
    {
      header: "SĐT",
      className: "min-w-[110px]",
      cell: (lead) => (
        <span className="font-calibri text-[13.5px] font-medium text-navy tracking-wide">
          {lead.phone || "—"}
        </span>
      ),
    },
    {
      header: "Nguồn",
      className: "min-w-[105px]",
      cell: (lead) => (
        <span className="text-xs font-medium text-navy/80">{getSourceLabel(lead.source)}</span>
      ),
    },
    {
      header: "Trạng thái",
      className: "min-w-[130px]",
      cell: (lead) => <LeadPipelineBadge status={lead.pipeline_status} />,
    },
    {
      header: "Phụ trách",
      className: "min-w-[130px]",
      cell: (lead) => (
        <span
          className="text-xs text-navy/80 truncate block max-w-[150px]"
          title={lead.assigned_to_email || "Chưa phân bổ"}
        >
          {lead.assigned_to_email || "Chưa phân bổ"}
        </span>
      ),
    },
    {
      header: "Note",
      className: "min-w-[160px] max-w-[260px]",
      cell: (lead) => (
        <span className="text-xs text-gtext line-clamp-2 block" title={lead.notes || "—"}>
          {lead.notes || "—"}
        </span>
      ),
    },
  ];

  const totalPages = leadsQuery.data?.meta.total_pages ?? 1;

  const hasFilterActive =
    Boolean(search) ||
    Boolean(statusFilter) ||
    Boolean(sourceFilter) ||
    Boolean(assignedFilter) ||
    Boolean(fromDate) ||
    Boolean(toDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Lead Tuyển sinh"
        eyebrow="Pipeline Khách hàng"
        subtitle="Danh sách khách hàng tiềm năng, theo dõi tiến độ chuyển đổi và quản lý thông tin tư vấn."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => handleSetViewMode("table")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "table"
                    ? "bg-white text-navy shadow-xs"
                    : "text-slate-600 hover:text-navy",
                )}
              >
                Danh sách
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode("charts")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "charts"
                    ? "bg-white text-navy shadow-xs"
                    : "text-slate-600 hover:text-navy",
                )}
              >
                Biểu đồ lead
              </button>
            </div>
            {isAdmin && (
              <>
                <Button
                  variant="ghost"
                  onClick={handleExportLeads}
                  loading={isExporting}
                  title="Xuất danh sách Lead ra file Excel"
                >
                  <Icon name="download" className="h-4 w-4 mr-1.5" />
                  Xuất Excel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImportError("");
                    setImportResult(null);
                    setImportFile(null);
                    setIsImportOpen(true);
                  }}
                >
                  <Icon name="upload" className="h-4 w-4 mr-1.5" />
                  Nhập từ Excel/CSV
                </Button>
              </>
            )}
            <Button
              variant="primary"
              onClick={() => {
                setFormError("");
                setDuplicateInfo(null);
                setIsCreateOpen(true);
              }}
            >
              <Icon name="plus" className="h-4 w-4 mr-1.5" />
              Thêm Lead mới
            </Button>
          </div>
        }
      />

      {exportError && <ErrorBanner message={exportError} />}

      {/* Filter Bar */}
      <FilterBar
        ref={filterBarRef}
        sticky
        compact
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo họ tên, SĐT, email..."
        advancedFilterCount={
          (statusFilter ? 1 : 0) +
          (sourceFilter ? 1 : 0) +
          (assignedFilter ? 1 : 0) +
          (fromDate ? 1 : 0) +
          (toDate ? 1 : 0)
        }
        resultCount={leadsQuery.data?.meta.total}
        resultCountLabel="lead"
        onClearAll={
          hasFilterActive
            ? () => {
                setSearch("");
                setStatusFilter("");
                setSourceFilter("");
                setAssignedFilter("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }
            : undefined
        }
        advancedFilters={
          <>
            <div className="w-48">
              <Select
                label="Trạng thái pipeline"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {PIPELINE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="w-44">
              <Select
                label="Nguồn Lead"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả nguồn</option>
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            {isAdmin && (
              <div className="w-52">
                <Select
                  label="Sale phụ trách"
                  value={assignedFilter}
                  onChange={(e) => {
                    setAssignedFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả Sale</option>
                  {staffQuery.data?.map((staff: SaleStaff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.email}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="w-36">
              <Input
                label="Từ ngày"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="w-36">
              <Input
                label="Đến ngày"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </>
        }
      />

      {/* Leads Content: Table or Kanban */}
      <QueryState
        loading={leadsQuery.isLoading}
        error={leadsQuery.error}
        empty={leadsQuery.data?.items.length === 0}
        emptyTitle="Không tìm thấy Lead nào phù hợp"
      >
        {viewMode === "table" ? (
          <>
            <DataTable
              items={leadsQuery.data?.items ?? []}
              columns={columns}
              sort={sort}
              onSort={(key, order) => setSort({ key, order })}
              rowClassName={(lead) =>
                selectedLeadId === lead.id
                  ? "bg-blue-50/70 border-l-4 border-l-[#0532e6] font-medium"
                  : ""
              }
              onRowClick={(lead) => setSelectedLeadId(lead.id)}
              stickyHeader
              stickyHeaderOffset={filterBarHeight}
            />
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        ) : (
          <LeadChartsView
            leads={leadsQuery.data?.items ?? []}
            isFiltered={hasFilterActive}
            onSelectStatus={(status) => {
              setStatusFilter(status);
              setPage(1);
              handleSetViewMode("table");
            }}
            onSelectSource={(source) => {
              setSourceFilter(source);
              setPage(1);
              handleSetViewMode("table");
            }}
          />
        )}
      </QueryState>

      {/* Modal: Thêm Lead Mới */}
      <Modal
        open={isCreateOpen}
        title="Thêm Lead tiềm năng mới"
        onClose={() => setIsCreateOpen(false)}
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <ErrorBanner message={formError} />}

          {isCheckingDuplicate && (
            <p className="text-[11px] text-slate-500 italic flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Đang kiểm tra trùng lặp thông tin...
            </p>
          )}

          {/* Real-time Duplicate Lead Warning */}
          {duplicateInfo?.is_duplicate && duplicateInfo.existing_lead && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <Icon name="alert" className="h-4 w-4 text-amber-600 shrink-0" />
                Cảnh báo trùng lặp (
                {duplicateInfo.duplicate_field === "phone" ? "Số điện thoại" : "Email"})
              </div>
              <p className="mt-1 text-amber-800 leading-relaxed">
                Đã có Lead <strong>{duplicateInfo.existing_lead.full_name}</strong> (Trạng thái:{" "}
                <em>{getPipelineStatusLabel(duplicateInfo.existing_lead.pipeline_status)}</em>
                {duplicateInfo.existing_lead.assigned_to_email &&
                  ` — Phụ trách: ${duplicateInfo.existing_lead.assigned_to_email}`}
                ).
              </p>
              <p className="mt-1 text-[11px] text-amber-700">
                💡 Bạn vẫn có thể tiếp tục bấm <strong>"Tạo Lead"</strong> nếu đây là khách hàng hỏi
                lại hoặc đăng ký thêm khóa mới.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Họ và tên *"
              required
              placeholder="Nguyễn Văn A"
              value={formData.full_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
            />
            <Input
              label="Số điện thoại"
              placeholder="0912345678"
              value={formData.phone ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              placeholder="email@example.com"
              value={formData.email ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Select
              label="Nguồn khách hàng"
              value={formData.source ?? "facebook"}
              onChange={(e) => setFormData((prev) => ({ ...prev, source: e.target.value }))}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Chi tiết nguồn / Chiến dịch"
              placeholder="VD: FB Ads T7, Hotline buổi sáng"
              value={formData.source_detail ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, source_detail: e.target.value }))}
            />
            <Select
              label="Khóa học quan tâm"
              value={formData.interested_course_id ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
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

          {isAdmin && (
            <Select
              label="Phân bổ cho Sale"
              value={formData.assigned_to ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, assigned_to: e.target.value }))}
            >
              <option value="">-- Tự động chia Round-Robin cho Sale --</option>
              {staffQuery.data?.map((staff: SaleStaff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.email}
                </option>
              ))}
            </Select>
          )}

          <Textarea
            label="Ghi chú tư vấn"
            placeholder="Nhu cầu khách hàng, thời gian có thể học..."
            value={formData.notes ?? ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          />

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gborder">
            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" loading={createMutation.isPending}>
              Tạo Lead
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setImportFile(null);
          setImportResult(null);
          setImportError("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        title="Nhập danh sách Lead từ Excel / CSV"
      >
        <div className="space-y-5">
          {importError && <ErrorBanner message={importError} />}

          {/* Step 1: Download Template */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-navy">
                  Bước 1: Tải file mẫu chuẩn Excel (.xlsx)
                </h4>
                <p className="mt-1 text-xs text-gtext leading-relaxed">
                  File bảng tính Microsoft Excel (.xlsx) chuẩn với giao diện trực quan, tiêu đề rõ
                  ràng và sẵn 3 dòng dữ liệu ví dụ.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="primary"
                  className="text-xs font-medium"
                  loading={isDownloadingTemplate}
                  onClick={() => void handleDownloadTemplate("xlsx")}
                >
                  <Icon name="download" className="h-4 w-4 mr-1.5" />
                  Tải file Excel (.xlsx)
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs font-medium"
                  loading={isDownloadingTemplate}
                  title="Tải file định dạng CSV"
                  onClick={() => void handleDownloadTemplate("csv")}
                >
                  .CSV
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Upload File */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-navy">
              Bước 2: Chọn file Excel (.xlsx) hoặc CSV đã điền để tải lên
            </h4>
            <p className="mt-1 text-xs text-gtext">
              Hệ thống tự động nhận diện mã khóa học, email nhân viên và chuẩn hóa định dạng. Hỗ trợ
              cả file .xlsx và .csv (tối đa 500 dòng/lần).
            </p>

            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setImportFile(file);
                  setImportResult(null);
                  setImportError("");
                }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 transition hover:border-[#0A2540] hover:bg-slate-50"
              >
                <Icon name="upload" className="h-8 w-8 text-slate-400" />
                {importFile ? (
                  <div className="mt-2 text-center">
                    <p className="text-sm font-semibold text-navy">{importFile.name}</p>
                    <p className="text-xs text-gtext">
                      {(importFile.size / 1024).toFixed(1)} KB — Nhấn để chọn file khác
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium text-navy">
                      Nhấn vào đây để chọn file{" "}
                      <span className="font-semibold text-emerald-700">.xlsx</span> hoặc{" "}
                      <span className="font-semibold text-[#0532e6]">.csv</span>
                    </p>
                    <p className="text-xs text-gtext">hoặc kéo thả file vào khu vực này</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Import Result Feedback */}
          {importResult && (
            <div className="space-y-3">
              {importResult.imported > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon name="check" className="h-5 w-5 text-emerald-600" />
                    Đã nhập thành công {importResult.imported} Lead vào hệ thống!
                  </div>
                  <p className="mt-1 text-xs text-emerald-700">
                    Dữ liệu đã được cập nhật vào danh sách và pipeline tuyển sinh.
                  </p>
                </div>
              )}

              {importResult.failed > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800">
                  <div className="flex items-center gap-2 font-semibold text-rose-900">
                    <Icon name="alert" className="h-5 w-5 text-rose-600" />
                    Có {importResult.failed} dòng gặp lỗi không thể nhập:
                  </div>
                  <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-rose-700 list-disc pl-5">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>
                        <strong>Dòng {err.row}:</strong> {err.message}{" "}
                        {err.name && <span className="text-slate-600">({err.name})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gborder">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsImportOpen(false);
                setImportFile(null);
                setImportResult(null);
                setImportError("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              {importResult ? "Đóng" : "Hủy"}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!importFile || importMutation.isPending}
              loading={importMutation.isPending}
              onClick={() => {
                if (importFile) {
                  importMutation.mutate(importFile);
                }
              }}
            >
              <Icon name="upload" className="h-4 w-4 mr-1.5" />
              Tiến hành nhập dữ liệu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Slide-over Drawer Chi tiết Lead */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
          queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
        }}
      />
    </div>
  );
}
