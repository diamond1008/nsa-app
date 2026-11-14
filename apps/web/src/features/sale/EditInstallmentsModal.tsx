import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, ErrorBanner, Modal } from "../../components/ui";
import { Icon } from "../../components/icons";
import type { Order } from "../../lib/domainTypes";
import { formatDate, mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import {
  formatOrderNotesWithInstallments,
  getOrderRemainingAmount,
  getOrderTotalPaid,
  parseOrderInstallmentPlan,
  replanRemainingInstallments,
} from "./installmentUtils";

interface EditInstallmentsModalProps {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  onSuccess?: (updatedOrder: Order) => void;
}

export function EditInstallmentsModal({
  open,
  onClose,
  order,
  onSuccess,
}: EditInstallmentsModalProps) {
  const queryClient = useQueryClient();
  const [newRemainingRounds, setNewRemainingRounds] = useState<number>(2);
  const [customRoundsInput, setCustomRoundsInput] = useState<string>("");
  const [formError, setFormError] = useState("");

  const meta = useMemo(() => {
    if (!order) return null;
    return parseOrderInstallmentPlan(order);
  }, [order]);

  const totalPaid = useMemo(() => {
    if (!meta) return 0;
    return getOrderTotalPaid(meta);
  }, [meta]);

  const remainingAmount = useMemo(() => {
    if (!order || !meta) return 0;
    return getOrderRemainingAmount(order.final_amount, meta);
  }, [order, meta]);

  const paidInstallments = useMemo(() => {
    if (!meta) return [];
    return meta.installments.filter((i) => i.status === "paid");
  }, [meta]);

  // Preview of the newly calculated installments
  const previewMeta = useMemo(() => {
    if (!meta || !order) return null;
    return replanRemainingInstallments(meta, order.final_amount, newRemainingRounds);
  }, [meta, order, newRemainingRounds]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!order || !previewMeta) {
        throw new Error("Không tìm thấy thông tin phiếu đăng ký hợp lệ.");
      }

      if (remainingAmount <= 0) {
        throw new Error("Phiếu đăng ký đã thanh toán đủ 100%, không cần chia đợt nữa.");
      }

      const updatedNotes = formatOrderNotesWithInstallments(
        previewMeta.user_notes || "",
        previewMeta,
      );

      return saleApi.updateOrderStatus(order.id, "pending", {
        notes: updatedNotes,
      });
    },
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
      if (order?.lead_id) {
        queryClient.invalidateQueries({ queryKey: ["sale", "lead-orders", order.lead_id] });
      }
      onClose();
      onSuccess?.(updatedOrder);
    },
    onError: (err) => {
      setFormError(mutationMessage(err));
    },
  });

  if (!order || !meta) return null;

  const handleUpdateRemainingRounds = (val: number) => {
    const clamped = Math.max(1, Math.min(20, val));
    setNewRemainingRounds(clamped);
    setCustomRoundsInput(String(clamped));
  };

  const handleCustomChange = (val: string) => {
    setCustomRoundsInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 20) {
      setNewRemainingRounds(parsed);
    }
  };

  const handleCustomBlur = () => {
    const parsed = parseInt(customRoundsInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      handleUpdateRemainingRounds(1);
    } else if (parsed > 20) {
      handleUpdateRemainingRounds(20);
    } else {
      handleUpdateRemainingRounds(parsed);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Sửa Kế Hoạch Đợt Đóng: ${order.order_code}`}
      className="max-w-2xl sm:max-w-3xl"
    >
      <div className="space-y-4">
        {formError && <ErrorBanner message={formError} />}

        {/* Order Summary Box */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Học viên:</span>
            <span className="font-bold text-slate-800">
              {order.student_name || order.lead_name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Lớp / Khóa học:</span>
            <span className="font-semibold text-slate-700">
              {order.class_code || order.course_name}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center">
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <span className="block text-[11px] text-slate-400">Tổng học phí</span>
              <span className="font-bold text-slate-900 text-xs">
                {formatVND(order.final_amount)}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="block text-[11px] text-emerald-600">Đã thu lũy kế</span>
              <span className="font-bold text-emerald-700 text-xs">{formatVND(totalPaid)}</span>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
              <span className="block text-[11px] text-amber-700 font-medium">
                Còn lại cần chia đợt
              </span>
              <span className="font-bold text-amber-800 text-xs">{formatVND(remainingAmount)}</span>
            </div>
          </div>
        </div>

        {remainingAmount <= 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2">
            <Icon name="check" className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>
              Phiếu đăng ký này đã thanh toán đủ 100% học phí. Không còn số tiền nào chưa thu để
              chia đợt.
            </span>
          </div>
        ) : (
          <>
            {/* Pick Number of Remaining Installments */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/90 bg-white">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Chia số tiền còn lại ({formatVND(remainingAmount)}) thành mấy đợt?
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Dự kiến ~{formatVND(Math.round(remainingAmount / newRemainingRounds))}/đợt
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleUpdateRemainingRounds(newRemainingRounds - 1)}
                    disabled={newRemainingRounds <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors text-sm"
                    title="Giảm 1 đợt"
                  >
                    -
                  </button>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customRoundsInput || String(newRemainingRounds)}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      onBlur={handleCustomBlur}
                      className="w-14 h-8 text-center text-xs font-bold text-[#0532e6] rounded-lg border border-slate-300 focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]/20 bg-slate-50/80"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateRemainingRounds(newRemainingRounds + 1)}
                    disabled={newRemainingRounds >= 20}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors text-sm"
                    title="Tăng 1 đợt"
                  >
                    +
                  </button>
                  <span className="text-xs font-semibold text-slate-600 ml-1">đợt</span>
                </div>
              </div>
            </div>

            {/* Preview of the updated installment schedule */}
            {previewMeta && (
              <div className="space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3.5 text-xs">
                <div className="flex items-center justify-between text-slate-700 font-semibold text-[11px]">
                  <span>Kế hoạch đóng mới ({previewMeta.total_installments} đợt tổng cộng):</span>
                  <span className="text-[#0532e6] font-bold">{formatVND(order.final_amount)}</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {previewMeta.installments.map((inst) => {
                    const isPaid = inst.status === "paid";
                    return (
                      <div
                        key={inst.round}
                        className={clsx(
                          "flex items-center justify-between p-2 rounded-lg border text-xs",
                          isPaid
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                            : "bg-white border-slate-200 text-slate-800",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                              isPaid
                                ? "bg-emerald-200 text-emerald-800"
                                : "bg-blue-100 text-[#0532e6]",
                            )}
                          >
                            {inst.round}
                          </span>
                          <span className="font-medium">Đợt {inst.round}</span>
                          {inst.due_date && (
                            <span className="text-[11px] text-slate-400">
                              (Hạn: {formatDate(inst.due_date)})
                            </span>
                          )}
                          {isPaid ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                              ✓ Đã thu ({inst.receipt_code || "PT"})
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded-full">
                              Chưa thu
                            </span>
                          )}
                        </div>
                        <span className="font-bold">{formatVND(inst.amount)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 italic pt-1">
                  * Các đợt đã thu tiền trước đây ({paidInstallments.length} đợt) được bảo lưu
                  nguyên trạng. Số tiền còn lại được phân bổ cho {newRemainingRounds} đợt kế tiếp.
                </p>
              </div>
            )}
          </>
        )}

        {/* Modal actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={updateMutation.isPending}
            disabled={remainingAmount <= 0}
            onClick={() => updateMutation.mutate()}
          >
            <Icon name="check" className="h-4 w-4 mr-1.5" />
            Lưu kế hoạch đợt mới
          </Button>
        </div>
      </div>
    </Modal>
  );
}
