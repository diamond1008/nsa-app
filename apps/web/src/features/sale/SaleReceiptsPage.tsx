import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Button, Input, Modal, PageHeader, Select } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Order } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import { ReceiptPrintModal } from "./ReceiptPrintModal";
import type { ReceiptInfo } from "./ReceiptPrintModal";
import { CreateReceiptModal } from "./CreateReceiptModal";
import { parseOrderInstallmentPlan } from "./installmentUtils";

interface ReceiptRow {
  id: string;
  order: Order;
  receiptCode: string;
  orderCode: string;
  studentName: string;
  studentCode?: string;
  courseClassName: string;
  amount: number;
  totalOrderAmount: number;
  discountAmount: number;
  round: number;
  totalRounds: number;
  percentage: number;
  paymentMethod?: string;
  status: "paid" | "pending";
  paidAt?: string;
  createdAt: string;
  collectorName: string;
  isCreator: boolean;
}

export function SaleReceiptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, hasRole } = useAuth();
  const isManager = hasRole("ADMIN", "SALE_ADMIN");

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [methodFilter, setMethodFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Modals state
  const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
  const [preselectedOrderId, setPreselectedOrderId] = useState<string>("");
  const [confirmPrintData, setConfirmPrintData] = useState<{
    order: Order;
    receiptInfo: ReceiptInfo;
  } | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [printReceiptInfo, setPrintReceiptInfo] = useState<ReceiptInfo | null>(null);

  // Check URL query param on mount
  useEffect(() => {
    const orderId = searchParams.get("order_id");
    const action = searchParams.get("action");

    if (orderId) {
      if (action === "collect") {
        setPreselectedOrderId(orderId);
        setIsCreateReceiptOpen(true);
      } else if (action === "print") {
        saleApi
          .getOrder(orderId)
          .then((ord) => {
            setPrintOrder(ord);
            setPrintReceiptInfo(null);
          })
          .catch(console.error);
      }
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

  // Expand orders into individual paid installment receipts
  const allReceiptRows = useMemo(() => {
    const allOrders = ordersQuery.data?.items ?? [];
    const rows: ReceiptRow[] = [];
    allOrders.forEach((order) => {
      const meta = parseOrderInstallmentPlan(order);
      const isCreator = order.created_by === user?.id || order.created_by_email === user?.email;

      // Regular sale staff cannot view receipts of other sales
      if (!isManager && !isCreator) {
        return;
      }

      meta.installments.forEach((inst) => {
        // Only include installments that have actually been collected/paid
        if (inst.status !== "paid") {
          return;
        }

        const receiptCode =
          inst.receipt_code ||
          (meta.total_installments > 1
            ? `${order.order_code.replace("DH", "PT")}-${inst.round}`
            : order.order_code.replace("DH", "PT"));

        rows.push({
          id: `${order.id}-${inst.round}`,
          order,
          receiptCode,
          orderCode: order.order_code,
          studentName: order.student_name || order.lead_name || "—",
          studentCode: order.student_code || undefined,
          courseClassName: order.class_code
            ? `Lớp: ${order.class_code}`
            : order.course_name || "—",
          amount: inst.amount,
          totalOrderAmount: order.final_amount,
          discountAmount: order.discount_amount,
          round: inst.round,
          totalRounds: meta.total_installments,
          percentage: inst.percentage,
          paymentMethod:
            inst.payment_method || order.payment_method || undefined,
          status: "paid",
          paidAt: inst.paid_at || order.paid_at || order.created_at,
          createdAt: order.created_at,
          collectorName:
            inst.collected_by_name ||
            order.created_by_email?.split("@")[0] ||
            "Sale",
          isCreator,
        });
      });
    });
    return rows;
  }, [ordersQuery.data?.items, user, isManager]);

  // Client-side filtering on receipt rows
  const filteredRows = useMemo(() => {
    return allReceiptRows.filter((r) => {
      if (methodFilter && r.paymentMethod !== methodFilter) {
        return false;
      }
      return true;
    });
  }, [allReceiptRows, methodFilter]);

  // Summary statistics calculated across receipts
  const totalRevenue = useMemo(() => {
    return allReceiptRows.reduce((acc, curr) => acc + curr.amount, 0);
  }, [allReceiptRows]);

  const pendingSummary = useMemo(() => {
    const allOrders = ordersQuery.data?.items ?? [];
    let pendingOrdersCount = 0;
    let pendingRoundsCount = 0;
    let pendingAmount = 0;

    allOrders.forEach((order) => {
      if (order.status === "cancelled" || order.status === "refunded") return;
      const isCreator = order.created_by === user?.id || order.created_by_email === user?.email;
      if (!isManager && !isCreator) return;

      const meta = parseOrderInstallmentPlan(order);
      const unpaid = meta.installments.filter((i) => i.status !== "paid");
      if (unpaid.length > 0) {
        pendingOrdersCount += 1;
        pendingRoundsCount += unpaid.length;
        pendingAmount += unpaid.reduce((sum, i) => sum + i.amount, 0);
      }
    });

    return { pendingOrdersCount, pendingRoundsCount, pendingAmount };
  }, [ordersQuery.data?.items, isManager, user]);

  const totalPages = ordersQuery.data?.meta.total_pages ?? 1;

  const columns: Column<ReceiptRow>[] = [
    {
      header: "Mã phiếu thu",
      cell: (row: ReceiptRow) => (
        <div>
          <span className="font-mono text-xs font-bold text-[#0532e6]">{row.receiptCode}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
            Phiếu ĐK: {row.orderCode}
            {row.totalRounds > 1 && (
              <span className="ml-1 text-blue-700 font-semibold">
                (Đợt {row.round}/{row.totalRounds} · {row.percentage}%)
              </span>
            )}
          </span>
        </div>
      ),
    },
    {
      header: "Học viên",
      cell: (row: ReceiptRow) => (
        <div>
          <span className="block text-sm font-semibold text-slate-900">{row.studentName}</span>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {row.studentCode && (
              <span className="rounded border border-blue-200/60 bg-blue-50 px-1 py-0.2 font-mono text-[10px] font-medium text-blue-700">
                {row.studentCode}
              </span>
            )}
            <span>{row.courseClassName}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Số tiền thu",
      cell: (row: ReceiptRow) => (
        <div>
          <span className="text-sm font-bold text-slate-900">{formatVND(row.amount)}</span>
          {row.totalRounds > 1 ? (
            <span className="block text-[10px] text-slate-400">
              Tổng gói: {formatVND(row.totalOrderAmount)}
            </span>
          ) : (
            row.discountAmount > 0 && (
              <span className="block text-[11px] text-emerald-600">
                Đã giảm: {formatVND(row.discountAmount)}
              </span>
            )
          )}
        </div>
      ),
    },
    {
      header: "Hình thức",
      cell: (row: ReceiptRow) => {
        if (row.status !== "paid" || !row.paymentMethod) {
          return <span className="font-mono text-xs text-slate-300">—</span>;
        }
        const method = row.paymentMethod;
        return (
          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
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
      cell: () => (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          Đã thu tiền
        </span>
      ),
    },
    {
      header: "Ngày thu",
      cell: (row: ReceiptRow) => (
        <div className="text-xs text-slate-600">
          <p className="font-medium">
            {row.paidAt ? formatDate(row.paidAt) : formatDate(row.createdAt)}
          </p>
          <p className="text-[11px] text-slate-400">Người thu: {row.collectorName}</p>
        </div>
      ),
    },
    {
      header: "Thao tác",
      className: "text-right",
      cell: (row: ReceiptRow) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-8 border border-blue-200 bg-blue-50/80 px-2.5 text-xs text-blue-700 shadow-2xs hover:bg-blue-100"
            onClick={() => {
              setPrintOrder(row.order);
              setPrintReceiptInfo({
                receiptCode: row.receiptCode,
                amount: row.amount,
                round: row.round,
                totalRounds: row.totalRounds,
                percentage: row.percentage,
                paidAt: row.paidAt,
                paymentMethod: row.paymentMethod,
              });
            }}
            title="Xem và in phiếu thu tiền học phí"
          >
            <Icon name="download" className="mr-1 h-3.5 w-3.5" />
            In phiếu thu
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Phiếu thu"
        eyebrow="Tài chính Tuyển sinh"
        subtitle="Theo dõi các khoản thu tiền học phí thực tế, xác nhận thu tiền theo đợt và xuất biên lai phiếu thu cho học viên."
        actions={
          <Button
            type="button"
            variant="primary"
            className="border border-transparent bg-[#0532e6] text-white shadow-xs hover:bg-[#1e45ee]"
            onClick={() => {
              setPreselectedOrderId("");
              setIsCreateReceiptOpen(true);
            }}
          >
            <Icon name="plus" className="mr-1.5 h-4 w-4" />
            Tạo phiếu thu
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tổng doanh thu thực thu</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon name="shopping-bag" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600">
            {formatVND(totalRevenue)}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Đã nộp học phí và xuất phiếu thu</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Số phiếu đã thu</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon name="check" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {allReceiptRows.length} phiếu
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Giao dịch thu tiền thành công</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Đang chờ thu tiền</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Icon name="clock" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600">
            {pendingSummary.pendingOrdersCount} phiếu ĐK
            {pendingSummary.pendingRoundsCount > 0 && (
              <span className="ml-1 text-sm font-normal text-amber-700">
                ({pendingSummary.pendingRoundsCount} đợt)
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Còn {formatVND(pendingSummary.pendingAmount)} chưa thu
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã phiếu thu, mã đơn, tên học viên..."
        resultCount={filteredRows.length}
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
        empty={!ordersQuery.isLoading && filteredRows.length === 0}
        emptyTitle="Chưa có phiếu thu nào"
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 shadow-[0_4px_24px_rgba(7,20,38,0.04)] backdrop-blur-2xl">
          <DataTable items={filteredRows} columns={columns} />
          {totalPages > 1 && (
            <div className="border-t border-slate-200/80 bg-white/40 px-4 py-3">
              <Pagination page={page} totalPages={totalPages} onPage={(p) => setPage(p)} />
            </div>
          )}
        </div>
      </QueryState>

      {/* Create Receipt Modal */}
      <CreateReceiptModal
        open={isCreateReceiptOpen}
        onClose={() => {
          setIsCreateReceiptOpen(false);
          setPreselectedOrderId("");
          // Clean up URL query if any
          if (searchParams.get("action")) {
            searchParams.delete("action");
            searchParams.delete("order_id");
            setSearchParams(searchParams, { replace: true });
          }
        }}
        preselectedOrderId={preselectedOrderId}
        onSuccess={(updatedOrder, receiptInfo) => {
          const meta = parseOrderInstallmentPlan(updatedOrder);
          setConfirmPrintData({
            order: updatedOrder,
            receiptInfo: {
              receiptCode: receiptInfo.receiptCode,
              amount: receiptInfo.amount,
              round: receiptInfo.round,
              totalRounds: meta.total_installments,
              percentage: meta.installments.find((i) => i.round === receiptInfo.round)?.percentage,
              paidAt: new Date().toISOString(),
              paymentMethod: updatedOrder.payment_method || undefined,
            },
          });
        }}
      />

      {/* Confirm Print Receipt Modal */}
      {confirmPrintData && (
        <Modal
          open={Boolean(confirmPrintData)}
          onClose={() => setConfirmPrintData(null)}
          title="Tạo phiếu thu thành công"
        >
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-xs">
              <Icon name="check" className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">
                Đã lập phiếu thu {confirmPrintData.receiptInfo.receiptCode}
              </h4>
              <p className="text-xs text-slate-600">
                Học viên:{" "}
                <b className="text-slate-800">
                  {confirmPrintData.order.student_name || confirmPrintData.order.lead_name}
                </b>
                {" · "}
                Số tiền:{" "}
                <b className="font-bold text-emerald-600">
                  {formatVND(confirmPrintData.receiptInfo.amount)}
                </b>
                {confirmPrintData.receiptInfo.totalRounds &&
                  confirmPrintData.receiptInfo.totalRounds > 1 && (
                    <span className="font-medium text-blue-700">
                      {" "}
                      (Đợt {confirmPrintData.receiptInfo.round}/
                      {confirmPrintData.receiptInfo.totalRounds})
                    </span>
                  )}
              </p>
              <p className="pt-2 text-xs text-slate-500">
                Phiếu thu đã được lưu vào hệ thống. Bạn có muốn in biên lai thu tiền ngay không?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <Button
                type="button"
                variant="ghost"
                className="border border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setConfirmPrintData(null)}
              >
                Để sau
              </Button>
              <Button
                type="button"
                variant="primary"
                className="bg-[#0532e6] text-white hover:bg-[#1e45ee]"
                onClick={() => {
                  const data = confirmPrintData;
                  setConfirmPrintData(null);
                  setPrintOrder(data.order);
                  setPrintReceiptInfo(data.receiptInfo);
                }}
              >
                <Icon name="download" className="mr-1.5 h-4 w-4" />
                Xác nhận in biên lai
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Receipt Print Modal */}
      {printOrder && (
        <ReceiptPrintModal
          order={printOrder}
          receiptInfo={printReceiptInfo}
          onClose={() => {
            setPrintOrder(null);
            setPrintReceiptInfo(null);
            if (searchParams.get("action")) {
              searchParams.delete("action");
              searchParams.delete("order_id");
              setSearchParams(searchParams, { replace: true });
            }
          }}
        />
      )}
    </div>
  );
}
