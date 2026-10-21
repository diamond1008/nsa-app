import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBanner, Modal, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import type { Lead } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import type { CreateOrderInput } from "./saleApi";
import { formatVND } from "./saleShared";
import { calculateInstallments, formatOrderNotesWithInstallments } from "./installmentUtils";
import {
  ClassSelectorDropdown,
  InstallmentPlanPicker,
  StudentSelectorDropdown,
} from "./SaleDropdowns";

interface CreateRegistrationOrderModalProps {
  open: boolean;
  onClose: () => void;
  selectableLeads: Lead[];
  isLoadingLeads: boolean;
  availableClasses: Array<{
    id: string;
    class_code: string;
    name: string;
    start_date?: string;
    enrolled_students: number;
    maximum_students: number;
  }>;
  defaultLeadId?: string;
  defaultClassId?: string;
  onSuccess?: () => void;
}

export function CreateRegistrationOrderModal({
  open,
  onClose,
  selectableLeads,
  isLoadingLeads,
  availableClasses,
  defaultLeadId = "",
  defaultClassId = "",
  onSuccess,
}: CreateRegistrationOrderModalProps) {
  const queryClient = useQueryClient();

  const [formError, setFormError] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(defaultLeadId);
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId);
  const [amount, setAmount] = useState<number>(15000000);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountNote, setDiscountNote] = useState("");
  const [installmentPlan, setInstallmentPlan] = useState<number>(1);
  const [orderNotes, setOrderNotes] = useState("");

  useEffect(() => {
    if (defaultLeadId) setSelectedLeadId(defaultLeadId);
    if (defaultClassId) setSelectedClassId(defaultClassId);
  }, [defaultLeadId, defaultClassId]);

  const selectedLead = selectableLeads.find((l) => l.id === selectedLeadId);
  const finalAmount = Math.max(0, amount - discountAmount);
  const installmentItems = useMemo(
    () => calculateInstallments(finalAmount, installmentPlan),
    [finalAmount, installmentPlan],
  );

  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderInput) => saleApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
      queryClient.invalidateQueries({ queryKey: saleKeys.leads.all() });
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      setFormError(mutationMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!selectedLeadId || !selectedLead) {
      setFormError("Vui lòng chọn học viên để lập phiếu đăng ký.");
      return;
    }

    if (!selectedLead.converted_student_id) {
      setFormError(
        "Học viên này chưa được chốt (chưa có mã học viên). Vui lòng chốt học viên trước khi lập phiếu đăng ký.",
      );
      return;
    }

    if (!selectedClassId) {
      setFormError("Vui lòng chọn lớp học đang tuyển sinh.");
      return;
    }

    const selectedClass = availableClasses.find((c) => c.id === selectedClassId);
    if (!selectedClass) {
      setFormError("Vui lòng chọn lớp học đang tuyển sinh.");
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (selectedClass.start_date && selectedClass.start_date <= todayStr) {
      setFormError("Lớp học đã tới ngày khai giảng, không thể lập phiếu đăng ký mới.");
      return;
    }

    if (amount <= 0) {
      setFormError("Học phí niêm yết phải lớn hơn 0 VNĐ.");
      return;
    }

    if (discountAmount > amount) {
      setFormError("Số tiền giảm giá không được vượt quá tổng học phí.");
      return;
    }

    const serializedNotes = formatOrderNotesWithInstallments(orderNotes, {
      plan_type: installmentPlan,
      total_installments: installmentPlan,
      installments: installmentItems,
      user_notes: orderNotes,
    });

    createOrderMutation.mutate({
      lead_id: selectedLeadId,
      student_id: selectedLead.converted_student_id || undefined,
      class_id: selectedClassId,
      amount,
      discount_amount: discountAmount,
      discount_note: discountNote || undefined,
      notes: serializedNotes,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Tạo Phiếu Đăng Ký Học Viên">
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <ErrorBanner message={formError} />}

        {/* Business Rule Notice */}
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
          <Icon name="alert" className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Quy tắc nghiệp vụ:</span> Chỉ các Lead đã được chốt thành
            học viên chính thức (trạng thái <b>Đã đăng ký</b>) mới được phép tạo Phiếu đăng ký thu
            tiền học phí.
          </div>
        </div>

        {/* Select Converted Lead */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Học viên (Lead đã chốt) <span className="text-red-500">*</span>
          </label>
          {isLoadingLeads ? (
            <div className="text-xs text-slate-400 py-2">Đang tải danh sách học viên...</div>
          ) : selectableLeads.length === 0 ? (
            <div className="p-3 text-xs text-amber-800 bg-amber-50 rounded-xl border border-amber-200">
              Hiện tại chưa có học viên nào đang chờ lập phiếu đăng ký. Tất cả học viên đã chốt
              trước đó đều đã có phiếu đăng ký trong hệ thống.
            </div>
          ) : (
            <StudentSelectorDropdown
              value={selectedLeadId}
              onChange={setSelectedLeadId}
              leads={selectableLeads}
              required
            />
          )}
        </div>

        {/* Target Class */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Lớp học ghi danh <span className="text-red-500">*</span>
          </label>
          <ClassSelectorDropdown
            value={selectedClassId}
            onChange={setSelectedClassId}
            classes={availableClasses}
            required
          />
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

        {/* Payment Policy / Installments Selection */}
        <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-800">
                Chính sách đóng học phí (Số đợt thanh toán) <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] font-bold text-[#0532e6]">
                Đang chọn: {installmentPlan} đợt
              </span>
            </div>
            <InstallmentPlanPicker value={installmentPlan} onChange={setInstallmentPlan} />
          </div>

          {/* Breakdown preview of each installment */}
          <div className="space-y-2 pt-2 border-t border-slate-200/70">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
              <span>Kế hoạch chia đợt đóng ({installmentPlan} đợt):</span>
              <span className="font-bold text-[#0532e6]">{formatVND(finalAmount)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {installmentItems.map((item) => (
                <div
                  key={item.round}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-[#0532e6]">
                      {item.round}
                    </span>
                    <span className="font-medium text-slate-700">
                      Đợt {item.round} ({item.percentage}%)
                    </span>
                  </div>
                  <span className="font-bold text-[#0532e6]">{formatVND(item.amount)}</span>
                </div>
              ))}
            </div>
            <p className="pt-1 text-[11px] text-slate-500 italic">
              * Khi tạo xong phiếu đăng ký, chuyên viên Sale sẽ chủ động vào trang <b>Phiếu thu</b>{" "}
              để lập phiếu thu cho từng đợt theo thực tế.
            </p>
          </div>
        </div>

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
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={createOrderMutation.isPending}
            disabled={selectableLeads.length === 0}
          >
            <Icon name="check" className="h-4 w-4 mr-1.5" />
            Xác nhận lập phiếu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
