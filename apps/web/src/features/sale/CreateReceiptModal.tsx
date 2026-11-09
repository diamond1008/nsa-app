import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, CurrencyInput, ErrorBanner, Modal, Select, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import { useAuth } from "../auth/AuthContext";
import type { Order } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import {
  applyReceiptPayment,
  formatOrderNotesWithInstallments,
  getInstallmentPlanOption,
  getOrderRemainingAmount,
  getOrderTotalPaid,
  parseOrderInstallmentPlan,
} from "./installmentUtils";
import type { InstallmentMetadata } from "./installmentUtils";
import { OrderSelectorDropdown } from "./SaleDropdowns";
import { EditInstallmentsModal } from "./EditInstallmentsModal";

interface CreateReceiptModalProps {
  open: boolean;
  onClose: () => void;
  preselectedOrderId?: string;
  onSuccess?: (
    updatedOrder: Order,
    receiptInfo: { receiptCode: string; amount: number; round: number },
  ) => void;
}

export function CreateReceiptModal({
  open,
  onClose,
  preselectedOrderId,
  onSuccess,
}: CreateReceiptModalProps) {
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const isManager = hasRole("ADMIN", "SALE_ADMIN");

  const [selectedOrderId, setSelectedOrderId] = useState<string>(preselectedOrderId || "");
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [amountToCollect, setAmountToCollect] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("transfer");
  const [receiptNotes, setReceiptNotes] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [isEditInstallmentsOpen, setIsEditInstallmentsOpen] = useState(false);

  // Query pending / active orders for receipt collection
  const ordersQuery = useQuery({
    queryKey: saleKeys.orders.list({ per_page: 100 }),
    queryFn: () => saleApi.listOrders({ per_page: 100 }),
    enabled: open,
  });

  // Filter orders based on permissions:
  // - Regular Sale can only collect receipts for orders they created
  // - Sale Manager (SALE_ADMIN / ADMIN) can collect receipts for all orders
  const eligibleOrders = useMemo(() => {
    const list = ordersQuery.data?.items ?? [];
    return list.filter((ord) => {
      if (ord.status === "cancelled" || ord.status === "refunded") return false;

      if (!isManager) {
        const isCreator = ord.created_by === user?.id || ord.created_by_email === user?.email;
        if (!isCreator) return false;
      }

      const meta = parseOrderInstallmentPlan(ord);
      const remaining = getOrderRemainingAmount(ord.final_amount, meta);
      return remaining > 0;
    });
  }, [ordersQuery.data?.items, isManager, user]);

  const selectedOrder = useMemo(
    () => eligibleOrders.find((o) => o.id === selectedOrderId),
    [eligibleOrders, selectedOrderId],
  );

  const installmentMeta: InstallmentMetadata | null = useMemo(() => {
    if (!selectedOrder) return null;
    return parseOrderInstallmentPlan(selectedOrder);
  }, [selectedOrder]);

  // Set default selection when orders load or preselectedOrderId changes
  useEffect(() => {
    if (preselectedOrderId) {
      setSelectedOrderId(preselectedOrderId);
    } else if (!selectedOrderId && eligibleOrders.length > 0) {
      setSelectedOrderId(eligibleOrders[0].id);
    }
  }, [preselectedOrderId, eligibleOrders, selectedOrderId]);

  // When order changes, automatically pick the first pending round
  useEffect(() => {
    if (installmentMeta) {
      const firstPending = installmentMeta.installments.find((i) => i.status !== "paid");
      if (firstPending) {
        setSelectedRound(firstPending.round);
      } else {
        setSelectedRound(1);
      }
    }
  }, [installmentMeta]);

  const currentInstallment = useMemo(() => {
    if (!installmentMeta) return null;
    return (
      installmentMeta.installments.find((i) => i.round === selectedRound) ||
      installmentMeta.installments[0]
    );
  }, [installmentMeta, selectedRound]);

  // Calculate remaining balances
  const totalPaidBefore = useMemo(() => {
    if (!installmentMeta) return 0;
    return getOrderTotalPaid(installmentMeta);
  }, [installmentMeta]);

  const remainingBefore = useMemo(() => {
    if (!selectedOrder || !installmentMeta) return 0;
    return getOrderRemainingAmount(selectedOrder.final_amount, installmentMeta);
  }, [selectedOrder, installmentMeta]);

  // Sync default amount to collect when round or order changes
  useEffect(() => {
    if (currentInstallment && remainingBefore > 0) {
      if (installmentMeta?.total_installments === 1) {
        // If 1-round plan, defaults to full remaining balance
        setAmountToCollect(remainingBefore);
      } else {
        // Multi-round: defaults to the scheduled amount for this round, capped at remaining
        setAmountToCollect(Math.min(currentInstallment.amount, remainingBefore));
      }
    }
  }, [currentInstallment, remainingBefore, installmentMeta?.total_installments]);

  // Real-time calculation of remaining balance after this collection
  const remainingAfter = Math.max(0, remainingBefore - amountToCollect);
  const isOverpaying = amountToCollect > remainingBefore;
  const isFullPayment = amountToCollect === remainingBefore && amountToCollect > 0;

  // Compute expected receipt code (e.g. PT00000001 or PT00000001-2)
  const expectedReceiptCode = useMemo(() => {
    if (!selectedOrder) return "";
    const baseCode = selectedOrder.order_code.replace("DH", "PT");
    if (!installmentMeta || installmentMeta.total_installments <= 1) {
      return baseCode;
    }
    return `${baseCode}-${selectedRound}`;
  }, [selectedOrder, installmentMeta, selectedRound]);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder || !installmentMeta || !currentInstallment) {
        throw new Error("Vui lòng chọn phiếu đăng ký hợp lệ.");
      }

      if (amountToCollect <= 0) {
        throw new Error("Số tiền thu thực tế phải lớn hơn 0 VNĐ.");
      }

      if (isOverpaying) {
        throw new Error(
          `Số tiền thu (${formatVND(amountToCollect)}) không được vượt quá số tiền còn lại cần đóng (${formatVND(remainingBefore)}).`,
        );
      }

      const { updatedMeta, allPaid } = applyReceiptPayment(
        installmentMeta,
        selectedOrder.final_amount,
        selectedRound,
        amountToCollect,
        {
          receipt_code: expectedReceiptCode,
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
          collected_by_name: user?.email?.split("@")[0] || "Sale",
          notes: receiptNotes || undefined,
        },
      );

      const updatedNotes = formatOrderNotesWithInstallments(
        installmentMeta.user_notes || "",
        updatedMeta,
      );

      return saleApi.updateOrderStatus(selectedOrder.id, allPaid ? "paid" : "pending", {
        payment_method: paymentMethod,
        notes: updatedNotes,
      });
    },
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
      onClose();
      onSuccess?.(updatedOrder, {
        receiptCode: expectedReceiptCode,
        amount: amountToCollect,
        round: selectedRound,
      });
    },
    onError: (err) => {
      setFormError(mutationMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!selectedOrderId || !selectedOrder) {
      setFormError("Vui lòng chọn phiếu đăng ký để tạo phiếu thu.");
      return;
    }

    if (!currentInstallment) {
      setFormError("Vui lòng chọn đợt thu hợp lệ.");
      return;
    }

    if (currentInstallment.status === "paid") {
      setFormError(`Đợt ${selectedRound} đã được thu tiền trước đó.`);
      return;
    }

    if (amountToCollect <= 0) {
      setFormError("Số tiền thu thực tế phải lớn hơn 0 VNĐ.");
      return;
    }

    if (isOverpaying) {
      setFormError(
        `Số tiền thu không được vượt quá số tiền còn lại cần đóng (${formatVND(remainingBefore)}).`,
      );
      return;
    }

    collectMutation.mutate();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Lập Phiếu Thu Tiền Học Phí">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <ErrorBanner message={formError} />}

          {/* Role permission info banner */}
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs text-blue-900">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <span className="font-bold">
                {isManager ? "Phân quyền Quản lý (Sale Manager):" : "Phân quyền Chuyên viên Sale:"}
              </span>{" "}
              {isManager
                ? "Bạn có toàn quyền tạo phiếu thu cho tất cả các phiếu đăng ký của mọi nhân viên trong hệ thống."
                : "Hệ thống chỉ hiển thị danh sách các phiếu đăng ký do bạn trực tiếp lập."}
            </div>
          </div>

          {/* Order Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Chọn Phiếu đăng ký cần thu tiền <span className="text-red-500">*</span>
            </label>
            {ordersQuery.isLoading ? (
              <div className="py-2 text-xs text-slate-400">Đang tải danh sách phiếu đăng ký...</div>
            ) : eligibleOrders.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Hiện không có phiếu đăng ký nào đang chờ thu tiền phù hợp với quyền hạn của bạn.
              </div>
            ) : (
              <OrderSelectorDropdown
                value={selectedOrderId}
                onChange={setSelectedOrderId}
                orders={eligibleOrders}
                required
              />
            )}
          </div>

          {/* Order Details & Financial Overview */}
          {selectedOrder && installmentMeta && (
            <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400">Học viên:</span>{" "}
                  <b className="text-slate-800">
                    {selectedOrder.student_name || selectedOrder.lead_name}
                  </b>
                </div>
                <div>
                  <span className="text-slate-400">Lớp học:</span>{" "}
                  <b className="text-slate-800">
                    {selectedOrder.class_code || selectedOrder.course_name}
                  </b>
                </div>
                <div>
                  <span className="text-slate-400">Tổng học phí:</span>{" "}
                  <b className="text-slate-900">{formatVND(selectedOrder.final_amount)}</b>
                </div>
                <div>
                  <span className="text-slate-400">Chính sách:</span>{" "}
                  <b className="text-[#0532e6]">
                    {getInstallmentPlanOption(installmentMeta.total_installments).label}
                  </b>
                </div>
              </div>

              {/* Financial Balance Summary Card */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[11px] text-slate-400">Học phí cần thu</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {formatVND(selectedOrder.final_amount)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="block text-[11px] text-emerald-600">Đã thu trước đây</span>
                  <span className="font-bold text-emerald-700 text-xs">
                    {formatVND(totalPaidBefore)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="block text-[11px] text-amber-700 font-medium">Còn lại cần nộp</span>
                  <span className="font-bold text-amber-800 text-xs">
                    {formatVND(remainingBefore)}
                  </span>
                </div>
              </div>

              {/* Installments Stage Selector & Re-plan button */}
              <div className="border-t border-slate-200/80 pt-2.5">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    {installmentMeta.total_installments > 1
                      ? "Chọn đợt lập phiếu thu:"
                      : "Thông tin đợt thu (1 đợt 100% full):"}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsEditInstallmentsOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0532e6] hover:underline cursor-pointer bg-blue-50/80 px-2 py-0.5 rounded-lg border border-blue-200/60"
                  >
                    <Icon name="calendar" className="h-3 w-3" />
                    <span>Chia lại số đợt đóng</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {installmentMeta.installments.map((inst) => {
                    const isPaid = inst.status === "paid";
                    const isSelected = selectedRound === inst.round;
                    return (
                      <button
                        type="button"
                        key={inst.round}
                        disabled={isPaid}
                        onClick={() => setSelectedRound(inst.round)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
                          isPaid
                            ? "cursor-not-allowed border-slate-200 bg-slate-100/80 text-slate-400"
                            : isSelected
                              ? "border-[#0532e6] bg-blue-50/70 text-[#0532e6] shadow-xs ring-1 ring-[#0532e6]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div>
                          <div className="font-bold">
                            Đợt {inst.round} ({inst.percentage}%)
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {isPaid ? (
                              <span className="font-medium text-emerald-600">
                                ✓ Đã thu ({inst.receipt_code || "PT"})
                              </span>
                            ) : (
                              <span>Chưa thu tiền</span>
                            )}
                          </div>
                        </div>
                        <div className="font-bold text-sm">{formatVND(inst.amount)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Amount Input & Realtime Calculation Feedback */}
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-800">
                    Số tiền thực tế thu đợt này (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <span className="font-mono text-xs text-slate-500">
                    Mã phiếu dự kiến: <b className="text-slate-800">{expectedReceiptCode}</b>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CurrencyInput
                      value={amountToCollect}
                      onChange={setAmountToCollect}
                      placeholder="Nhập số tiền thu thực tế..."
                      error={isOverpaying ? "Số tiền vượt quá số tiền còn lại cần nộp" : undefined}
                      suffix="VNĐ"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-start">
                    <button
                      type="button"
                      onClick={() => setAmountToCollect(remainingBefore)}
                      className="px-2.5 h-10 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
                      title="Thu toàn bộ số tiền còn nợ"
                    >
                      Thu full ({formatVND(remainingBefore)})
                    </button>
                    {currentInstallment &&
                      currentInstallment.amount < remainingBefore && (
                        <button
                          type="button"
                          onClick={() => setAmountToCollect(currentInstallment.amount)}
                          className="px-2.5 h-10 rounded-xl border border-blue-200 bg-blue-50 text-[#0532e6] text-xs font-semibold hover:bg-blue-100 transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
                          title="Thu theo số tiền dự kiến của đợt này"
                        >
                          Theo đợt ({formatVND(currentInstallment.amount)})
                        </button>
                      )}
                  </div>
                </div>

                {/* Overpayment Error Alert */}
                {isOverpaying && (
                  <div className="p-2.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700 flex items-start gap-2">
                    <Icon name="alert" className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Không được thu vượt quá số tiền còn lại!</span>
                      <p className="mt-0.5">
                        Số tiền tối đa có thể thu là <b>{formatVND(remainingBefore)}</b>. Vui lòng điều chỉnh lại số tiền thu thực tế.
                      </p>
                    </div>
                  </div>
                )}

                {/* Full Payment Success Notice */}
                {isFullPayment && !isOverpaying && (
                  <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-start gap-2">
                    <Icon name="check" className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">✓ Thanh toán hoàn tất 100% học phí (Full):</span>
                      <p className="mt-0.5">
                        Sau khi lập phiếu thu này, toàn bộ học phí sẽ được thanh toán đủ. Hệ thống sẽ tự động cập nhật phiếu đăng ký thành <b>Đã thanh toán tất cả</b> và đóng các đợt thừa phía sau.
                      </p>
                    </div>
                  </div>
                )}

                {/* Partial Payment Info Notice */}
                {!isOverpaying && !isFullPayment && amountToCollect > 0 && (
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-700 flex items-center justify-between">
                    <span>Số tiền còn lại cần đóng sau đợt này:</span>
                    <span className="font-bold text-[#0532e6] text-sm">
                      {formatVND(remainingAfter)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <Select
              label="Hình thức thanh toán thực tế *"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="transfer">Chuyển khoản ngân hàng</option>
              <option value="cash">Tiền mặt tại văn phòng</option>
              <option value="pos">Quẹt thẻ POS</option>
              <option value="installment">Trả góp học phí</option>
            </Select>
          </div>

          {/* Receipt Notes */}
          <div>
            <Textarea
              label="Ghi chú thu tiền / Mã giao dịch ngân hàng"
              placeholder="VD: Nhận tiền qua tài khoản VCB, mã GD 839120, khách yêu cầu xuất hóa đơn..."
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              loading={collectMutation.isPending}
              disabled={
                !selectedOrder ||
                !currentInstallment ||
                currentInstallment.status === "paid" ||
                isOverpaying ||
                amountToCollect <= 0
              }
            >
              <Icon name="check" className="mr-1.5 h-4 w-4" />
              Xác nhận tạo phiếu thu ({formatVND(amountToCollect || 0)})
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Installments Modal */}
      {selectedOrder && (
        <EditInstallmentsModal
          open={isEditInstallmentsOpen}
          onClose={() => setIsEditInstallmentsOpen(false)}
          order={selectedOrder}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
          }}
        />
      )}
    </>
  );
}
