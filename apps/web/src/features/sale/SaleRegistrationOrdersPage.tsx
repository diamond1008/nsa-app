import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { DataTable, Pagination, QueryState } from "../../components/data";
import type { Column } from "../../components/data";
import { FilterBar, useDebouncedValue } from "../../components/filters";
import { Icon } from "../../components/icons";
import {
  Button,
  ErrorBanner,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Order, OrderStatus } from "../../lib/domainTypes";
import { formatDate, mutationMessage } from "../../lib/format";
import { saleApi } from "./saleApi";
import type { CreateOrderInput } from "./saleApi";
import { formatVND, OrderStatusBadge } from "./saleShared";

export function SaleRegistrationOrdersPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFormError, setCreateFormError] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [amount, setAmount] = useState<number>(15000000);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountNote, setDiscountNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [orderNotes, setOrderNotes] = useState("");

  // Status Modal State (Admin / Sale Manager)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>("paid");
  const [modalError, setModalError] = useState("");

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Check URL query param lead_id on mount
  useEffect(() => {
    const paramLeadId = searchParams.get("lead_id");
    if (paramLeadId) {
      setSelectedLeadId(paramLeadId);
      setIsCreateOpen(true);
    }
  }, [searchParams]);

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

  // Query ONLY converted leads (Strict rule: only won leads can have orders)
  const convertedLeadsQuery = useQuery({
    queryKey: ["sale", "converted-leads-for-order"],
    queryFn: () =>
      saleApi.listLeads({
        pipeline_status: "da_dang_ky",
        per_page: 100,
      }),
    enabled: isCreateOpen,
  });

  // Query available classes for enrollment
  const classesQuery = useQuery({
    queryKey: ["sale", "classes", "available-for-order"],
    queryFn: () => saleApi.listClasses({ capacity: "available" }),
    enabled: isCreateOpen,
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

  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderInput) => saleApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
      setIsCreateOpen(false);
      resetCreateForm();
    },
    onError: (err: unknown) => {
      setCreateFormError(mutationMessage(err));
    },
  });

  const resetCreateForm = () => {
    setSelectedLeadId("");
    setSelectedClassId("");
    setAmount(15000000);
    setDiscountAmount(0);
    setDiscountNote("");
    setPaymentMethod("transfer");
    setOrderNotes("");
    setCreateFormError("");
    if (searchParams.has("lead_id")) {
      searchParams.delete("lead_id");
      setSearchParams(searchParams, { replace: true });
    }
  };

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

  const convertedLeads = convertedLeadsQuery.data?.items ?? [];
  const selectedLead = convertedLeads.find((l) => l.id === selectedLeadId);
  const isSelectedLeadConverted =
    selectedLead &&
    (selectedLead.pipeline_status === "da_dang_ky" || Boolean(selectedLead.converted_student_id));

  const availableClasses = (classesQuery.data?.items ?? []).filter(
    (c) => c.status === "planning" || c.status === "open" || c.status === "in_progress",
  );

  const finalAmount = Math.max(0, amount - discountAmount);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFormError("");

    if (!selectedLeadId) {
      setCreateFormError("Vui lòng chọn học viên (lead đã chốt) để lập phiếu đăng ký.");
      return;
    }

    if (!isSelectedLeadConverted) {
      setCreateFormError("Chỉ được tạo phiếu đăng ký khi Lead đã được chốt thành học viên.");
      return;
    }

    if (!selectedClassId) {
      setCreateFormError("Vui lòng chọn lớp học ghi danh.");
      return;
    }

    if (amount <= 0) {
      setCreateFormError("Học phí gốc phải lớn hơn 0.");
      return;
    }

    createOrderMutation.mutate({
      lead_id: selectedLead.id,
      student_id: selectedLead.converted_student_id || undefined,
      course_id: selectedLead.interested_course_id || undefined,
      class_id: selectedClassId,
      amount,
      discount_amount: discountAmount,
      discount_note: discountNote || undefined,
      payment_method: paymentMethod,
      notes: orderNotes || undefined,
    });
  };

  const columns: Column<Order>[] = [
    {
      header: "Mã phiếu ĐK",
      cell: (order: Order) => (
        <span className="font-mono text-xs font-semibold text-[#0532e6]">
          {order.order_code}
        </span>
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
      cell: (order: Order) => (
        <div className="text-xs">
          <p className="font-bold text-slate-900 text-sm">{formatVND(order.final_amount)}</p>
          {order.discount_amount > 0 && (
            <p className="text-[11px] text-emerald-600 font-medium">
              Ưu đãi: -{formatVND(order.discount_amount)}
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Trạng thái",
      cell: (order: Order) => <OrderStatusBadge status={order.status} />,
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
      cell: (order: Order) => (
        <div className="flex items-center justify-end gap-1.5">
          {order.status === "pending" ? (
            <Link to={`/sale/phieu-thu?order_id=${order.id}&action=collect`}>
              <Button
                variant="ghost"
                className="h-8 px-2.5 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 shadow-2xs"
                title="Ghi nhận thu tiền cho phiếu đăng ký này"
              >
                <Icon name="check" className="mr-1 h-3.5 w-3.5" />
                Thu tiền
              </Button>
            </Link>
          ) : (
            <Link to={`/sale/phieu-thu?order_id=${order.id}&action=print`}>
              <Button
                variant="ghost"
                className="h-8 px-2.5 text-xs text-blue-700 hover:bg-blue-50 border border-blue-200/80 shadow-2xs"
                title="Xem biên lai thu tiền"
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
              onClick={() => {
                setSelectedOrder(order);
                setNewStatus(order.status as OrderStatus);
              }}
              title="Đổi trạng thái"
            >
              <Icon name="edit" className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const total = ordersQuery.data?.meta.total ?? 0;
  const totalPages = ordersQuery.data?.meta.total_pages ?? 1;
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
            <Button
              variant="ghost"
              onClick={handleExportOrders}
              loading={isExporting}
              title="Xuất danh sách phiếu đăng ký ra file Excel"
            >
              <Icon name="download" className="h-4 w-4 mr-1.5" />
              Xuất Excel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setIsCreateOpen(true);
              }}
            >
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

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-700 shadow-2xs focus:border-[#0532e6] focus:outline-none"
            title="Từ ngày lập"
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
            title="Đến ngày lập"
          />
        </div>
      </FilterBar>

      {/* Table */}
      <QueryState
        loading={ordersQuery.isLoading}
        error={ordersQuery.error}
        empty={!ordersQuery.isLoading && (ordersQuery.data?.items ?? []).length === 0}
        emptyTitle="Chưa có phiếu đăng ký nào"
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 backdrop-blur-2xl shadow-[0_4px_24px_rgba(7,20,38,0.04)]">
          <DataTable
            items={ordersQuery.data?.items ?? []}
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

      {/* Create Order Modal */}
      {isCreateOpen && (
        <Modal
          open={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            resetCreateForm();
          }}
          title="Tạo Phiếu Đăng Ký Học Viên"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {createFormError && <ErrorBanner message={createFormError} />}

            {/* Business Rule Notice */}
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
              <Icon name="alert" className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Quy tắc nghiệp vụ:</span> Chỉ các Lead đã được chốt
                thành học viên chính thức (trạng thái <b>Đã đăng ký</b>) mới được phép tạo Phiếu
                đăng ký thu tiền học phí.
              </div>
            </div>

            {/* Select Converted Lead */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Học viên (Lead đã chốt) <span className="text-red-500">*</span>
              </label>
              {convertedLeadsQuery.isLoading ? (
                <div className="text-xs text-slate-400 py-2">Đang tải danh sách lead đã chốt...</div>
              ) : convertedLeads.length === 0 ? (
                <div className="p-3 text-xs text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
                  Hiện bạn chưa có Lead nào ở trạng thái &quot;Đã đăng ký&quot;. Vui lòng chốt Lead
                  thành học viên trước khi tạo phiếu đăng ký.
                </div>
              ) : (
                <select
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
                  required
                >
                  <option value="">-- Chọn học viên đã chốt --</option>
                  {convertedLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name} ({l.phone || "Không có SĐT"}) — {l.interested_course_name || "Chưa có khóa"}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Target Class */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lớp học ghi danh <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
                required
              >
                <option value="">-- Chọn lớp học đang mở --</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.class_code} — {c.name} (Sĩ số: {c.enrolled_students}/{c.maximum_students})
                  </option>
                ))}
              </select>
            </div>

            {/* Tuition & Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Học phí niêm yết (VNĐ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="100000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Giảm giá / Học bổng (VNĐ)
                </label>
                <input
                  type="number"
                  min="0"
                  max={amount}
                  step="100000"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
                />
              </div>
            </div>

            {discountAmount > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do giảm giá / Tên học bổng
                </label>
                <input
                  type="text"
                  placeholder="VD: Ưu đãi ngày hội khai giảng, học bổng 10%..."
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
                />
              </div>
            )}

            {/* Total Calculation Display */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 block">Số tiền thực thu cần nộp:</span>
                <span className="text-xs text-slate-400">
                  {formatVND(amount)} - {formatVND(discountAmount)}
                </span>
              </div>
              <span className="text-lg font-bold text-[#0532e6] tracking-tight">
                {formatVND(finalAmount)}
              </span>
            </div>

            {/* Payment Method */}
            <Select
              label="Phương thức thanh toán dự kiến"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="transfer">Chuyển khoản ngân hàng</option>
              <option value="cash">Tiền mặt tại trung tâm</option>
              <option value="pos">Quẹt thẻ POS</option>
              <option value="installment">Trả góp học phí</option>
            </Select>

            {/* Notes */}
            <Textarea
              label="Ghi chú đơn đăng ký"
              placeholder="Ghi chú nội dung tư vấn, thỏa thuận đóng tiền..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={2}
            />

            {/* Submit */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={createOrderMutation.isPending}
                disabled={convertedLeads.length === 0}
              >
                <Icon name="check" className="h-4 w-4 mr-1.5" />
                Xác nhận lập phiếu
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Admin Change Status Modal */}
      {selectedOrder && (
        <Modal
          open={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Cập nhật trạng thái phiếu: ${selectedOrder.order_code}`}
        >
          <div className="space-y-4">
            {modalError && <ErrorBanner message={modalError} />}
            <p className="text-xs text-slate-600">
              Học viên: <b>{selectedOrder.student_name || selectedOrder.lead_name}</b> | Số tiền:{" "}
              <b>{formatVND(selectedOrder.final_amount)}</b>
            </p>

            <Select
              label="Trạng thái đơn hàng:"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
            >
              <option value="pending">Chờ thanh toán (pending)</option>
              <option value="paid">Đã thanh toán (paid)</option>
              <option value="cancelled">Đã hủy (cancelled)</option>
              <option value="refunded">Đã hoàn tiền (refunded)</option>
            </Select>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <Button type="button" variant="ghost" onClick={() => setSelectedOrder(null)}>
                Đóng
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={updateStatusMutation.isPending}
                onClick={() => updateStatusMutation.mutate()}
              >
                Lưu trạng thái
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
