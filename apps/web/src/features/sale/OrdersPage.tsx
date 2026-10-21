import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import { Button, ErrorBanner, Input, Modal, PageHeader, Select } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Order, OrderStatus } from "../../lib/domainTypes";
import { formatDate, mutationMessage } from "../../lib/format";
import { saleApi } from "./saleApi";
import { formatVND, OrderStatusBadge } from "./saleShared";

export function OrdersPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const queryClient = useQueryClient();

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Status Change Modal (ADMIN)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>("paid");
  const [modalError, setModalError] = useState("");

  // Export State
  const [isExporting, setIsExporting] = useState(false);

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
      a.download = `danh_sach_don_hang_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  // Queries
  const ordersQuery = useQuery({
    queryKey: [
      "sale",
      "orders",
      {
        page,
        per_page: perPage,
        search: debouncedSearch,
        status: statusFilter,
        created_from: fromDate,
        created_to: toDate,
      },
    ],
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

  const updateStatusMutation = useMutation({
    mutationFn: () => saleApi.updateOrderStatus(selectedOrder!.id, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setSelectedOrder(null);
      setModalError("");
    },
    onError: (err: unknown) => {
      setModalError(mutationMessage(err));
    },
  });

  const columns: Column<Order>[] = [
    {
      header: "STT",
      className: "w-12 text-center",
      cell: (_, index) => (page - 1) * perPage + index + 1,
    },
    {
      header: "Mã Đơn Hàng",
      className: "min-w-[130px]",
      cell: (order) => <span className="font-bold text-navy">{order.order_code}</span>,
    },
    {
      header: "Học viên",
      className: "min-w-[170px]",
      cell: (order) => (
        <div>
          <span className="font-semibold text-navy">
            {order.student_name || order.lead_name || "—"}
          </span>
          {order.student_code && <div className="text-xs text-gtext">{order.student_code}</div>}
        </div>
      ),
    },
    {
      header: "Khóa / Lớp",
      className: "min-w-[160px]",
      cell: (order) => (
        <div className="text-xs">
          <div className="font-medium text-navy">{order.course_name || "—"}</div>
          {order.class_code && <div className="text-gtext">Lớp: {order.class_code}</div>}
        </div>
      ),
    },
    {
      header: "Học phí niêm yết",
      className: "min-w-[120px] text-right",
      cell: (order) => (
        <span className="text-sm font-medium text-gtext tabular-nums">
          {formatVND(order.amount)}
        </span>
      ),
    },
    {
      header: "Giảm giá",
      className: "min-w-[100px] text-right",
      cell: (order) => (
        <span className="text-sm font-medium text-rose-600 tabular-nums">
          {order.discount_amount > 0 ? `-${formatVND(order.discount_amount)}` : "—"}
        </span>
      ),
    },
    {
      header: "Thanh toán thực",
      className: "min-w-[130px] text-right",
      cell: (order) => (
        <span className="text-sm font-bold text-navy tabular-nums">
          {formatVND(order.final_amount)}
        </span>
      ),
    },
    {
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      header: "Ngày tạo",
      className: "min-w-[100px]",
      cell: (order) => <span className="text-xs text-gtext">{formatDate(order.created_at)}</span>,
    },
    {
      header: "Thao tác",
      className: "min-w-[140px] text-right",
      cell: (order) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="soft"
            className="h-8 px-2.5 text-xs font-semibold text-[#0532e6] hover:bg-[#0532e6]/15"
            title="Đổi trạng thái thanh toán hoặc hủy đơn"
            onClick={() => {
              setSelectedOrder(order);
              setNewStatus(order.status === "pending" ? "paid" : order.status);
              setModalError("");
            }}
          >
            <Icon name="edit" className="mr-1 h-3.5 w-3.5 text-[#0532e6]" />
            Đổi trạng thái
          </Button>

          {order.lead_id ? (
            <Link to={`/sale/leads/${order.lead_id}`}>
              <Button variant="ghost" className="h-8 px-2 text-xs" title="Xem chi tiết Lead">
                <Icon name="user-check" className="h-3.5 w-3.5 text-gtext hover:text-navy" />
              </Button>
            </Link>
          ) : order.student_id ? (
            <Link to={`/sale/hoc-vien/${order.student_id}`}>
              <Button variant="ghost" className="h-8 px-2 text-xs" title="Xem hồ sơ học viên">
                <Icon name="academic" className="h-3.5 w-3.5 text-gtext hover:text-navy" />
              </Button>
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  const totalPages = ordersQuery.data?.meta.total_pages ?? 1;

  const hasFilterActive =
    Boolean(search) || Boolean(statusFilter) || Boolean(fromDate) || Boolean(toDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Đơn hàng & Phiếu thu"
        eyebrow="Tài chính Tuyển sinh"
        subtitle="Theo dõi toàn bộ đơn hàng học phí phát sinh từ quy trình tư vấn và chuyển đổi học viên."
        actions={
          isAdmin ? (
            <Button
              variant="ghost"
              onClick={handleExportOrders}
              loading={isExporting}
              title="Xuất danh sách đơn hàng ra file Excel"
            >
              <Icon name="download" className="h-4 w-4 mr-1.5" />
              Xuất Excel
            </Button>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã đơn, tên học viên..."
        resultCount={ordersQuery.data?.meta.total}
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
        advancedFilters={
          <>
            <div className="w-48">
              <Select
                label="Trạng thái thanh toán"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="pending">Chờ thanh toán</option>
                <option value="paid">Đã thanh toán</option>
                <option value="cancelled">Đã hủy</option>
                <option value="refunded">Đã hoàn tiền</option>
              </Select>
            </div>

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

      {/* Orders Table */}
      <QueryState
        loading={ordersQuery.isLoading}
        error={ordersQuery.error}
        empty={ordersQuery.data?.items.length === 0}
        emptyTitle="Không có đơn hàng nào"
      >
        <DataTable items={ordersQuery.data?.items ?? []} columns={columns} />
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </QueryState>

      {/* Status Update Modal (ADMIN) */}
      {selectedOrder && (
        <Modal
          open={Boolean(selectedOrder)}
          title={`Cập nhật đơn hàng ${selectedOrder.order_code}`}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="space-y-4">
            {modalError && <ErrorBanner message={modalError} />}

            <div className="rounded-xl bg-gbg/60 p-4 border border-gborder space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gtext">Khách hàng / Học viên:</span>
                <span className="font-semibold text-navy">
                  {selectedOrder.student_name || selectedOrder.lead_name || "—"}
                </span>
              </div>
              {selectedOrder.course_name && (
                <div className="flex justify-between">
                  <span className="text-gtext">Khóa / Lớp học:</span>
                  <span className="font-medium text-navy text-right">
                    {selectedOrder.course_name}
                    {selectedOrder.class_code ? ` (${selectedOrder.class_code})` : ""}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gtext">Số tiền thực tế:</span>
                <span className="font-bold text-navy text-base tabular-nums">
                  {formatVND(selectedOrder.final_amount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gtext">Trạng thái hiện tại:</span>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>
            </div>

            {/* Quick 1-click actions for pending orders */}
            {selectedOrder.status === "pending" && (
              <div className="rounded-xl border border-[#0532e6]/20 bg-[#0532e6]/5 p-3.5 space-y-2">
                <p className="text-xs font-bold text-navy-heading">Thao tác nhanh 1-Click:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="justify-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2 shadow-sm"
                    loading={updateStatusMutation.isPending && newStatus === "paid"}
                    onClick={() => {
                      setNewStatus("paid");
                      saleApi
                        .updateOrderStatus(selectedOrder.id, "paid")
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
                          queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
                          setSelectedOrder(null);
                        })
                        .catch((err) => setModalError(mutationMessage(err)));
                    }}
                  >
                    <Icon name="check" className="mr-1 h-3.5 w-3.5" />
                    Đã thanh toán
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="justify-center text-xs py-2 shadow-sm"
                    loading={updateStatusMutation.isPending && newStatus === "cancelled"}
                    onClick={() => {
                      setNewStatus("cancelled");
                      saleApi
                        .updateOrderStatus(selectedOrder.id, "cancelled")
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
                          queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
                          setSelectedOrder(null);
                        })
                        .catch((err) => setModalError(mutationMessage(err)));
                    }}
                  >
                    <Icon name="close" className="mr-1 h-3.5 w-3.5" />
                    Hủy đơn hàng
                  </Button>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateStatusMutation.mutate();
              }}
              className="space-y-4 pt-1"
            >
              <Select
                label="Hoặc chọn trạng thái khác:"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
              >
                <option value="pending">Chờ thanh toán (pending)</option>
                <option value="paid">Đã thanh toán (paid)</option>
                <option value="cancelled">Đã hủy (cancelled)</option>
                <option value="refunded">Đã hoàn tiền (refunded)</option>
              </Select>

              <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-gborder">
                <Button type="button" variant="ghost" onClick={() => setSelectedOrder(null)}>
                  Đóng
                </Button>
                <Button type="submit" variant="primary" loading={updateStatusMutation.isPending}>
                  Lưu trạng thái
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
