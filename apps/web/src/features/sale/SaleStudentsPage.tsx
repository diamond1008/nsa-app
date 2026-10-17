import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Button, Modal, PageHeader } from "../../components/ui";
import { formatDate } from "../../lib/format";
import type { Lead } from "../../lib/domainTypes";
import { saleApi } from "./saleApi";
import { adminApi } from "../admin/adminApi";

export function SaleStudentsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Selected student for quick inspection drawer/modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Fetch converted leads (which represent converted students managed by this Sale)
  const studentsQuery = useQuery({
    queryKey: [
      "sale",
      "students",
      {
        page,
        per_page: perPage,
        search: debouncedSearch,
        created_from: fromDate,
        created_to: toDate,
      },
    ],
    queryFn: () =>
      saleApi.listLeads({
        page,
        per_page: perPage,
        search: debouncedSearch || undefined,
        pipeline_status: "da_dang_ky",
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      }),
  });

  const studentClassesQuery = useQuery({
    queryKey: ["sale", "student-class-history", selectedLead?.converted_student_id],
    queryFn: () => adminApi.studentClassHistory(selectedLead!.converted_student_id!, { page: 1 }),
    enabled: Boolean(selectedLead?.converted_student_id),
  });

  const items = studentsQuery.data?.items ?? [];
  const total = studentsQuery.data?.meta.total ?? 0;
  const totalPages = studentsQuery.data?.meta.total_pages ?? 1;

  const columns: Column<Lead>[] = [
    {
      header: "Học viên",
      cell: (lead: Lead) => {
        const studentCode = lead.converted_student_code || "HV-CHOT";
        const initials = lead.full_name
          .split(" ")
          .filter(Boolean)
          .slice(-2)
          .map((n: string) => n[0])
          .join("")
          .toUpperCase();

        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-xs font-bold text-white shadow-xs">
              {initials || "HV"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 hover:text-[#0532e6] transition-colors">
                  {lead.full_name}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-50 text-blue-700 border border-blue-200/80">
                  {studentCode}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                {lead.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="phone" className="h-3 w-3 text-slate-400" />
                    {lead.phone}
                  </span>
                )}
                {lead.email && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="mail" className="h-3 w-3 text-slate-400" />
                    {lead.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: "Khóa học ghi danh",
      cell: (lead: Lead) => (
        <div>
          <span className="font-medium text-slate-800 text-sm">
            {lead.interested_course_name || "Chưa chọn khóa"}
          </span>
          {lead.address && (
            <p className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5" title={lead.address}>
              <Icon name="location" className="inline h-3 w-3 mr-0.5 text-slate-400" />
              {lead.address}
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Ngày chốt",
      cell: (lead: Lead) => (
        <div className="text-xs text-slate-600">
          <p className="font-medium">{lead.converted_at ? formatDate(lead.converted_at) : formatDate(lead.created_at)}</p>
          <p className="text-[11px] text-slate-400">Bởi: {lead.assigned_to_email || "Tôi"}</p>
        </div>
      ),
    },
    {
      header: "Trạng thái",
      cell: () => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Học viên chính thức
        </span>
      ),
    },
    {
      header: "Thao tác",
      className: "text-right",
      cell: (lead: Lead) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2.5 text-xs text-slate-700 hover:text-[#0532e6] hover:bg-white/80 border border-slate-200/60 shadow-2xs"
            onClick={() => setSelectedLead(lead)}
            title="Xem hồ sơ học viên & lớp học"
          >
            <Icon name="user-check" className="h-3.5 w-3.5 mr-1" />
            Chi tiết
          </Button>
          <Link to={`/sale/phieu-dang-ky?lead_id=${lead.id}`}>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200/80 shadow-2xs"
              title="Xem hoặc tạo phiếu đăng ký học phí"
            >
              <Icon name="shopping-bag" className="h-3.5 w-3.5 mr-1" />
              Phiếu ĐK
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh sách Học viên"
        eyebrow="Tuyển sinh & Chăm sóc"
        subtitle="Quản lý toàn bộ học viên do bạn tư vấn và chuyển đổi thành công. Theo dõi thông tin lớp học và quá trình đào tạo."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tổng học viên đã chốt</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon name="academic" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">{total}</div>
          <p className="mt-0.5 text-xs text-slate-500">Được tư vấn & chuyển đổi từ Lead</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Trạng thái học tập</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon name="check" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 tracking-tight">100%</div>
          <p className="mt-0.5 text-xs text-slate-500">Đã kích hoạt hồ sơ học viên</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Hỗ trợ & Chăm sóc</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon name="phone" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 tracking-tight">24/7</div>
          <p className="mt-0.5 text-xs text-slate-500">Đồng hành trong suốt khóa học</p>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo tên học viên, mã HV, số điện thoại..."
        resultCount={total}
        onClearAll={
          Boolean(search) || Boolean(fromDate) || Boolean(toDate)
            ? () => {
                setSearch("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-700 shadow-2xs focus:border-[#0532e6] focus:outline-none"
            title="Từ ngày chốt"
          />
          <span className="text-xs text-slate-400">đến</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-700 shadow-2xs focus:border-[#0532e6] focus:outline-none"
            title="Đến ngày chốt"
          />
        </div>
      </FilterBar>

      {/* Table */}
      <QueryState
        loading={studentsQuery.isLoading}
        error={studentsQuery.error}
        empty={!studentsQuery.isLoading && items.length === 0}
        emptyTitle="Chưa có học viên nào"
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 backdrop-blur-2xl shadow-[0_4px_24px_rgba(7,20,38,0.04)]">
          <DataTable
            items={items}
            columns={columns}
          />
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/60">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPage={setPage}
              />
            </div>
          )}
        </div>
      </QueryState>

      {/* Student Quick Detail Modal */}
      {selectedLead && (
        <Modal
          open={Boolean(selectedLead)}
          onClose={() => setSelectedLead(null)}
          title={`Hồ sơ học viên: ${selectedLead.full_name}`}
        >
          <div className="space-y-5">
            {/* Header info */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-base font-bold text-white shadow-sm">
                {selectedLead.full_name
                  .split(" ")
                  .filter(Boolean)
                  .slice(-2)
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 text-base truncate">
                    {selectedLead.full_name}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-100 text-blue-800">
                    {selectedLead.converted_student_code || "Học viên"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ngày chuyển đổi: {selectedLead.converted_at ? formatDate(selectedLead.converted_at) : formatDate(selectedLead.created_at)}
                </p>
              </div>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <span className="text-slate-400 block mb-0.5">Số điện thoại:</span>
                <span className="font-semibold text-slate-800">{selectedLead.phone || "—"}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <span className="text-slate-400 block mb-0.5">Email:</span>
                <span className="font-semibold text-slate-800 truncate block">{selectedLead.email || "—"}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <span className="text-slate-400 block mb-0.5">Khóa học đăng ký:</span>
                <span className="font-semibold text-blue-600">{selectedLead.interested_course_name || "—"}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <span className="text-slate-400 block mb-0.5">Địa chỉ:</span>
                <span className="font-semibold text-slate-800 truncate block">{selectedLead.address || "—"}</span>
              </div>
            </div>

            {/* Enrolled classes */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Lớp học đang tham gia
              </h5>
              {studentClassesQuery.isLoading ? (
                <div className="p-4 text-center text-xs text-slate-400">Đang tải thông tin lớp học...</div>
              ) : (studentClassesQuery.data?.items ?? []).length > 0 ? (
                <div className="space-y-2">
                  {studentClassesQuery.data?.items.map((c) => (
                    <div
                      key={c.enrollment_id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-white shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs">{c.class_code}</span>
                          <span className="text-xs text-slate-600 font-medium">{c.class_name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">Khóa: {c.course_name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Đang theo học
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
              <Button type="button" variant="ghost" onClick={() => setSelectedLead(null)}>
                Đóng
              </Button>
              <Link to={`/sale/phieu-dang-ky?lead_id=${selectedLead.id}`}>
                <Button type="button" variant="primary">
                  <Icon name="shopping-bag" className="h-4 w-4 mr-1.5" />
                  Xem Phiếu đăng ký
                </Button>
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
