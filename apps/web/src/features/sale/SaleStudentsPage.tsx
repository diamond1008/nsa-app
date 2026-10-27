import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DataTable, Pagination, QueryState, StatusBadge } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Input, PageHeader } from "../../components/ui";
import { formatDate } from "../../lib/format";
import type { Lead } from "../../lib/domainTypes";
import { saleApi } from "./saleApi";
import { LeadDetailDrawer } from "./LeadDetailDrawer";

export function SaleStudentsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Selected student lead ID to open the slide-over tab drawer on the right
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

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
        converted_only: true,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      }),
  });

  const items = studentsQuery.data?.items ?? [];
  const total = studentsQuery.data?.meta.total ?? 0;
  const totalPages = studentsQuery.data?.meta.total_pages ?? 1;

  const columns: Column<Lead>[] = [
    {
      header: "Học viên",
      cell: (lead: Lead) => {
        const studentCode = lead.converted_student_code;
        const initials = lead.full_name
          .split(" ")
          .filter(Boolean)
          .slice(-2)
          .map((n: string) => n[0])
          .join("")
          .toUpperCase();

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLeadId(lead.id);
            }}
            className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
            title="Nhấn để mở bảng chi tiết học viên"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-xs font-bold text-white shadow-xs group-hover:shadow-md transition-shadow">
              {initials || "HV"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors duration-150">
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
          </button>
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
            <p
              className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5"
              title={lead.address}
            >
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
          <p className="font-medium">
            {lead.converted_at ? formatDate(lead.converted_at) : formatDate(lead.created_at)}
          </p>
          <p className="text-[11px] text-slate-400">Bởi: {lead.assigned_to_email || "Tôi"}</p>
        </div>
      ),
    },
    {
      header: "Trạng thái",
      cell: (lead: Lead) => {
        const status =
          lead.converted_student_status || (lead.converted_student_id ? "active" : "pending");
        return <StatusBadge value={status} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh sách Học viên"
        eyebrow="Tuyển sinh & Chăm sóc"
        subtitle="Quản lý toàn bộ học viên do bạn tư vấn và chuyển đổi thành công. Theo dõi thông tin lớp học và quá trình đào tạo."
      />

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
        <div className="w-36 sm:w-40">
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

        <div className="w-36 sm:w-40">
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
            onRowClick={(lead) => setSelectedLeadId(lead.id)}
            rowClassName={() => "cursor-pointer hover:bg-blue-50/40 transition-colors"}
          />
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/60">
              <Pagination page={page} totalPages={totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      </QueryState>

      {/* Right-side Slide-Over Detail Drawer */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={() => {
          void studentsQuery.refetch();
        }}
      />
    </div>
  );
}
