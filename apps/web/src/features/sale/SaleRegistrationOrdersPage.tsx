import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Order } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import { CreateRegistrationOrderModal } from "./CreateRegistrationOrderModal";
import { UpdateOrderStatusModal } from "./UpdateOrderStatusModal";
import { parseOrderInstallmentPlan } from "./installmentUtils";

export function SaleRegistrationOrdersPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Check URL query param lead_id on mount
  const paramLeadId = searchParams.get("lead_id");
  useEffect(() => {
    if (paramLeadId) {
      setIsCreateOpen(true);
    }
  }, [paramLeadId]);

  // Orders list query
  const ordersQuery = useQuery({
    queryKey: saleKeys.orders.list({
      page,
      per_page: perPage,
      search: debouncedSearch,
      status: statusFilter,
      created_from: fromDate,
      created_to: toDate,
    }),
    queryFn: () =>
      saleApi.listOrders({
        page,
        per_page: perPage,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      }),
  });

  // Query converted leads that do not yet have an active registration order
  const convertedLeadsQuery = useQuery({
    queryKey: saleKeys.leads.list({
      converted_only: true,
      unregistered_only: true,
      per_page: 100,
    }),
    queryFn: () =>
      saleApi.listLeads({
        converted_only: true,
        unregistered_only: true,
        per_page: 100,
      }),
    enabled: isCreateOpen,
  });

  // Query available classes for enrollment
  const classesQuery = useQuery({
    queryKey: saleKeys.classes.list(),
    queryFn: () => saleApi.listClasses({ capacity: "available" }),
    enabled: isCreateOpen,
  });

  const selectableLeads = useMemo(() => {
    return convertedLeadsQuery.data?.items ?? [];
  }, [convertedLeadsQuery.data?.items]);

  const availableClasses = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return (classesQuery.data?.items ?? []).filter((c) => {
      // Lớp nào tới ngày khai giảng rồi ko đc chọn tạo phiếu đk
      if (c.start_date && c.start_date <= todayStr) {
        return false;
      }
      return c.status === "planning" || c.status === "open";
    });
  }, [classesQuery.data?.items]);

  const handleExportOrders = async () => {
    setIsExporting(true);
    try {
      const blob = await saleApi.exportOrders({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `danh_sach_phieu_dang_ky_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export orders error", err);
    } finally {
      setIsExporting(false);
    }
  };

  const columns: Column<Order>[] = [
    {
      header: "Mã phiếu ĐK",
      cell: (order: Order) => (
        <span className="font-mono text-xs font-semibold text-[#0532e6]">{order.order_code}</span>
      ),
    },
    {
      header: "Học viên",
      cell: (order: Order) => (
        <div>
          <span className="font-semibold text-slate-900 block text-sm">
            {order.student_name || order.lead_name || "—"}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
            {order.student_code && (
              <span className="font-mono px-1 py-0.2 rounded bg-blue-50 text-blue-700 text-[10px] font-medium border border-blue-200/60">
                {order.student_code}
              </span>
            )}
            <span>{order.class_code ? `Lớp: ${order.class_code}` : order.course_name}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Học phí",
      cell: (order: Order) => {
        const meta = parseOrderInstallmentPlan(order);
        const paidCount = meta.installments.filter((i) => i.status === "paid").length;

        return (
          <div className="text-xs">
            <p className="text-sm font-bold text-slate-900">{formatVND(order.final_amount)}</p>
            {meta.total_installments > 1 && (
              <span className="mt-0.5 block text-[10px] font-semibold text-blue-700">
                Đóng {meta.total_installments} đợt (Đã thu {paidCount}/{meta.total_installments})
              </span>
            )}
            {order.discount_amount > 0 && (
              <p className="text-[11px] font-medium text-emerald-600">
                Ưu đãi: -{formatVND(order.discount_amount)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Trạng thái",
      cell: (order: Order) => {
        const meta = parseOrderInstallmentPlan(order);
        const paidCount = meta.installments.filter((i) => i.status === "paid").length;
        const total = meta.total_installments;

        if (order.status === "cancelled") {
          return (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              Đã hủy
            </span>
          );
        }

        if (order.status === "refunded") {
          return (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
              Đã hoàn tiền
            </span>
          );
        }

        if (order.status === "paid" || (total > 0 && paidCount === total)) {
          return (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              Đã thanh toán tất cả
            </span>
          );
        }

        if (paidCount > 0) {
          return (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Đã thanh toán {paidCount}/{total} đợt
            </span>
          );
        }

        return (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Chưa thanh toán
          </span>
        );
      },
    },
    {
      header: "Ngày lập",
      cell: (order: Order) => (
        <div className="text-xs text-slate-500">
          <p>{formatDate(order.created_at)}</p>
          <p className="text-[11px] text-slate-400">Bởi: {order.created_by_email || "Sale"}</p>
        </div>
      ),
    },
    {
      header: "Thao tác",
      className: "text-right",
      cell: (order: Order) => {
        const meta = parseOrderInstallmentPlan(order);
        const hasAnyPaid =
          order.status === "paid" || meta.installments.some((i) => i.status === "paid");

        return (
          <div className="flex items-center justify-end gap-1.5">
            {hasAnyPaid && (
              <Link to={`/sale/phieu-thu?order_id=${order.id}&action=print`}>
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 text-xs text-blue-700 hover:bg-blue-50 border border-blue-200/80 shadow-2xs"
                  title="Xem biên lai phiếu thu"
                >
                  <Icon name="download" className="mr-1 h-3.5 w-3.5" />
                  Biên lai
                </Button>
              </Link>
            )}

            {isAdmin && (
              <Button
                variant="ghost"
                className="h-8 px-2 text-xs text-slate-600 hover:text-navy hover:bg-white/80 border border-slate-200/60 shadow-2xs"
                onClick={() => setSelectedOrder(order)}
                title="Đổi trạng thái"
              >
                <Icon name="edit" className="h-3.5 w-3.5" />
              </Button>
            )}

            {!hasAnyPaid && !isAdmin && (
              <span className="text-slate-300 text-xs px-2">—</span>
            )}
          </div>
        );
      },
    },
  ];

  const items = useMemo(() => {
    const all = ordersQuery.data?.items ?? [];
    if (isAdmin) return all;
    return all.filter(
      (ord) => ord.created_by === user?.id || ord.created_by_email === user?.email,
    );
  }, [ordersQuery.data?.items, isAdmin, user]);

  const total = isAdmin ? ordersQuery.data?.meta.total ?? 0 : items.length;
  const totalPages = isAdmin ? ordersQuery.data?.meta.total_pages ?? 1 : Math.ceil(items.length / perPage) || 1;
  const hasFilterActive =
    Boolean(search) || Boolean(statusFilter) || Boolean(fromDate) || Boolean(toDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Phiếu đăng ký"
        eyebrow="Tài chính Tuyển sinh"
        subtitle="Lập phiếu đăng ký học và theo dõi toàn bộ học phí phát sinh từ học viên đã chốt."
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                onClick={handleExportOrders}
                loading={isExporting}
                title="Xuất danh sách phiếu đăng ký ra file Excel"
              >
                <Icon name="download" className="h-4 w-4 mr-1.5" />
                Xuất Excel
              </Button>
            )}
            <Button type="button" variant="primary" onClick={() => setIsCreateOpen(true)}>
              <Icon name="plus" className="h-4 w-4 mr-1.5" />
              Tạo phiếu đăng ký
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã phiếu, tên học viên..."
        resultCount={total}
        onClearAll={
          hasFilterActive
            ? () => {
                setSearch("");
                setStatusFilter("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }
            : undefined
        }
      >
        <div className="w-full min-w-40 sm:w-48">
          <Select
            label="Trạng thái"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chờ thanh toán (pending)</option>
            <option value="paid">Đã thanh toán (paid)</option>
            <option value="cancelled">Đã hủy (cancelled)</option>
            <option value="refunded">Đã hoàn tiền (refunded)</option>
          </Select>
        </div>

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
        loading={ordersQuery.isLoading}
        error={ordersQuery.error}
        empty={!ordersQuery.isLoading && items.length === 0}
        emptyTitle="Chưa có phiếu đăng ký nào"
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 backdrop-blur-2xl shadow-[0_4px_24px_rgba(7,20,38,0.04)]">
          <DataTable items={items} columns={columns} />
          {totalPages > 1 && (
            <div className="border-t border-slate-200/80 px-4 py-3 bg-white/40">
              <Pagination page={page} totalPages={totalPages} onPage={(p) => setPage(p)} />
            </div>
          )}
        </div>
      </QueryState>

      {/* Create Order Modal */}
      {isCreateOpen && (
        <CreateRegistrationOrderModal
          open={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            if (searchParams.has("lead_id")) {
              searchParams.delete("lead_id");
              setSearchParams(searchParams, { replace: true });
            }
          }}
          selectableLeads={selectableLeads}
          isLoadingLeads={convertedLeadsQuery.isLoading}
          availableClasses={availableClasses}
          defaultLeadId={paramLeadId || ""}
        />
      )}

      {/* Admin Change Status Modal */}
      {selectedOrder && (
        <UpdateOrderStatusModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}
