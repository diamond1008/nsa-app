import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import type { Order } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND, OrderStatusBadge } from "./saleShared";
import { ReceiptPrintModal } from "./ReceiptPrintModal";
import { CollectReceiptPaymentModal } from "./CollectReceiptPaymentModal";

export function SaleReceiptsPage() {
  const [searchParams] = useSearchParams();

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [methodFilter, setMethodFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Selected Order for Printing & Payment Collection
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [collectOrder, setCollectOrder] = useState<Order | null>(null);

  // Check URL query param on mount
  useEffect(() => {
    const orderId = searchParams.get("order_id");
    const action = searchParams.get("action");

    if (orderId) {
      saleApi.getOrder(orderId).then((ord) => {
        if (action === "print") {
          setPrintOrder(ord);
        } else if (action === "collect") {
          setCollectOrder(ord);
        }
      }).catch(console.error);
    }
  }, [searchParams]);

  // Query Orders
  const ordersQuery = useQuery({
    queryKey: saleKeys.receipts.list({
      page,
      per_page: perPage,
      search: debouncedSearch,
      created_from: fromDate,
      created_to: toDate,
    }),
    queryFn: () =>
      saleApi.listOrders({
        page,
        per_page: perPage,
        search: debouncedSearch || undefined,
        created_from: fromDate ? `${fromDate}T00:00:00Z` : undefined,
        created_to: toDate ? `${toDate}T23:59:59Z` : undefined,
      }),
  });

  const allItems = ordersQuery.data?.items ?? [];
  const items = methodFilter
    ? allItems.filter((it) => it.payment_method === methodFilter)
    : allItems;

  const paidItems = allItems.filter((it) => it.status === "paid");
  const totalRevenue = paidItems.reduce((acc, curr) => acc + curr.final_amount, 0);
  const pendingCount = allItems.filter((it) => it.status === "pending").length;
  const totalPages = ordersQuery.data?.meta.total_pages ?? 1;

  const columns: Column<Order>[] = [
    {
      header: "Mã phiếu thu",
      cell: (order: Order) => (
        <div>
          <span className="font-mono text-xs font-bold text-[#0532e6]">
            {order.order_code.replace("DH", "PT")}
          </span>
          <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
            Phiếu ĐK: {order.order_code}
          </span>
        </div>
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
      header: "Số tiền thu",
      cell: (order: Order) => (
        <div>
          <span className="font-bold text-slate-900 text-sm">{formatVND(order.final_amount)}</span>
          {order.discount_amount > 0 && (
            <span className="block text-[11px] text-emerald-600">
              Đã giảm: {formatVND(order.discount_amount)}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Hình thức",
      cell: (order: Order) => {
        if (order.status !== "paid" || !order.payment_method) {
          return <span className="text-slate-300 text-xs font-mono">—</span>;
        }
        const method = order.payment_method;
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {method === "transfer"
              ? "Chuyển khoản"
              : method === "cash"
                ? "Tiền mặt"
                : method === "pos"
                  ? "Quẹt thẻ"
                  : method === "installment"
                    ? "Trả góp"
                    : method}
          </span>
        );
      },
    },
    {
      header: "Trạng thái",
      cell: (order: Order) => <OrderStatusBadge status={order.status} />,
    },
    {
      header: "Ngày thu",
      cell: (order: Order) => (
        <div className="text-xs text-slate-600">
          <p className="font-medium">
            {order.paid_at ? formatDate(order.paid_at) : formatDate(order.created_at)}
          </p>
          <p className="text-[11px] text-slate-400">
            Người thu: {order.created_by_email?.split("@")[0] || "Sale"}
          </p>
        </div>
      ),
    },
    {
      header: "Thao tác",
      className: "text-right",
      cell: (order: Order) => (
        <div className="flex items-center justify-end gap-1.5">
          {order.status === "paid" ? (
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 shadow-2xs"
              onClick={() => setPrintOrder(order)}
              title="Xem và in phiếu thu tiền học phí"
            >
              <Icon name="download" className="h-3.5 w-3.5 mr-1" />
              In phiếu thu
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
              onClick={() => setCollectOrder(order)}
              title="Xác nhận đã nhận tiền học phí"
            >
              <Icon name="check" className="h-3.5 w-3.5 mr-1" />
              Thu tiền
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Phiếu thu"
        eyebrow="Tài chính Tuyển sinh"
        subtitle="Theo dõi các khoản thu tiền học phí thực tế, xác nhận thu tiền và xuất biên lai phiếu thu cho học viên."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tổng doanh thu thực thu</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon name="shopping-bag" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 tracking-tight">
            {formatVND(totalRevenue)}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Đã nộp học phí và xuất phiếu thu</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Số phiếu đã thu</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon name="check" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {paidItems.length} phiếu
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Giao dịch thu tiền thành công</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Đang chờ thu tiền</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Icon name="clock" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 tracking-tight">
            {pendingCount} phiếu
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Phiếu đăng ký chờ đóng học phí</p>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã phiếu thu, tên học viên..."
        resultCount={items.length}
        onClearAll={
          Boolean(search) || Boolean(methodFilter) || Boolean(fromDate) || Boolean(toDate)
            ? () => {
                setSearch("");
                setMethodFilter("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }
            : undefined
        }
      >
        <div className="w-full min-w-40 sm:w-48">
          <Select
            label="Hình thức thu"
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả hình thức</option>
            <option value="transfer">Chuyển khoản ngân hàng</option>
            <option value="cash">Tiền mặt tại văn phòng</option>
            <option value="pos">Quẹt thẻ POS</option>
            <option value="installment">Trả góp học phí</option>
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
        emptyTitle="Chưa có phiếu thu nào"
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 backdrop-blur-2xl shadow-[0_4px_24px_rgba(7,20,38,0.04)]">
          <DataTable items={items} columns={columns} />
          {totalPages > 1 && (
            <div className="border-t border-slate-200/80 px-4 py-3 bg-white/40">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPage={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      </QueryState>

      {/* Receipt Print Modal */}
      {printOrder && (
        <ReceiptPrintModal order={printOrder} onClose={() => setPrintOrder(null)} />
      )}

      {/* Quick Collect Payment Modal */}
      {collectOrder && (
        <CollectReceiptPaymentModal
          order={collectOrder}
          onClose={() => setCollectOrder(null)}
          onSuccess={(paidOrder) => {
            setPrintOrder(paidOrder);
          }}
        />
      )}
    </div>
  );
}
