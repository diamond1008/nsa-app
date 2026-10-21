import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBanner, Modal, Select, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import { useAuth } from "../auth/AuthContext";
import type { Order } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import {
  INSTALLMENT_PLANS,
  formatOrderNotesWithInstallments,
  parseOrderInstallmentPlan,
} from "./installmentUtils";
import type { InstallmentMetadata } from "./installmentUtils";
import { OrderSelectorDropdown } from "./SaleDropdowns";

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
  const [paymentMethod, setPaymentMethod] = useState<string>("transfer");
  const [receiptNotes, setReceiptNotes] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

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
      const hasPending = meta.installments.some((i) => i.status !== "paid");
      return hasPending;
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

      // Clone metadata and mark the selected round as paid
      const updatedInstallments = installmentMeta.installments.map((inst) => {
        if (inst.round === selectedRound) {
          return {
            ...inst,
            status: "paid" as const,
            receipt_code: expectedReceiptCode,
            payment_method: paymentMethod,
            paid_at: new Date().toISOString(),
            collected_by_name: user?.email?.split("@")[0] || "Sale",
            notes: receiptNotes || undefined,
          };
        }
        return inst;
      });

      const allPaid = updatedInstallments.every((inst) => inst.status === "paid");
      const updatedMeta: InstallmentMetadata = {
        ...installmentMeta,
        installments: updatedInstallments,
      };

      const updatedNotes = formatOrderNotesWithInstallments(
        installmentMeta.user_notes || "",
        updatedMeta,
      );

      // Call API to update order status
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
      if (currentInstallment) {
        onSuccess?.(updatedOrder, {
          receiptCode: expectedReceiptCode,
          amount: currentInstallment.amount,
          round: selectedRound,
        });
      }
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

    collectMutation.mutate();
  };

  return (
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

        {/* Order Details & Installment Progress */}
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
                  {INSTALLMENT_PLANS[installmentMeta.plan_type]?.label || "Đóng 1 lần (100%)"}
                </b>
              </div>
            </div>

            {/* Installments Stage Selector if multi-installment */}
            <div className="border-t border-slate-200/80 pt-2.5">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                {installmentMeta.total_installments > 1
                  ? "Chọn đợt thu tiền:"
                  : "Thông tin đợt thu:"}
              </label>

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

            {/* Current Selected Stage Summary */}
            {currentInstallment && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/75 p-3 text-emerald-950">
                <div>
                  <span className="block text-[11px] font-medium text-emerald-700">
                    Số tiền lập phiếu thu lần này (Đợt {currentInstallment.round}):
                  </span>
                  <span className="font-mono text-xs text-emerald-800">
                    Mã phiếu thu: <b>{expectedReceiptCode}</b>
                  </span>
                </div>
                <span className="text-lg font-bold text-emerald-700">
                  {formatVND(currentInstallment.amount)}
                </span>
              </div>
            )}
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
            disabled={!selectedOrder || !currentInstallment || currentInstallment.status === "paid"}
          >
            <Icon name="check" className="mr-1.5 h-4 w-4" />
            Xác nhận tạo phiếu thu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
