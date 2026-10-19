import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBanner, Modal, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import type { Lead } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import type { CreateOrderInput } from "./saleApi";
import { formatVND } from "./saleShared";

interface CreateRegistrationOrderModalProps {
  open: boolean;
  onClose: () => void;
  selectableLeads: Lead[];
  isLoadingLeads: boolean;
  availableClasses: Array<{
    id: string;
    class_code: string;
    name: string;
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
  const [orderNotes, setOrderNotes] = useState("");

  useEffect(() => {
    if (defaultLeadId) setSelectedLeadId(defaultLeadId);
    if (defaultClassId) setSelectedClassId(defaultClassId);
  }, [defaultLeadId, defaultClassId]);

  const selectedLead = selectableLeads.find((l) => l.id === selectedLeadId);
  const finalAmount = Math.max(0, amount - discountAmount);

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

    if (!selectedClassId) {
      setFormError("Vui lòng chọn lớp học đang tuyển sinh.");
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

    createOrderMutation.mutate({
      lead_id: selectedLeadId,
      student_id: selectedLead.converted_student_id || undefined,
      class_id: selectedClassId,
      amount,
      discount_amount: discountAmount,
      discount_note: discountNote || undefined,
      notes: orderNotes || undefined,
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
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Học viên (Lead đã chốt) <span className="text-red-500">*</span>
          </label>
          {isLoadingLeads ? (
            <div className="text-xs text-slate-400 py-2">Đang tải danh sách học viên...</div>
          ) : selectableLeads.length === 0 ? (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
              Hiện bạn chưa có Lead nào để tạo phiếu đăng ký. Vui lòng chốt Lead hoặc chọn một Lead
              để tạo phiếu.
            </div>
          ) : (
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs text-slate-800 shadow-2xs focus:border-[#0532e6] focus:outline-none"
              required
            >
              <option value="">-- Chọn học viên --</option>
              {selectableLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name} ({l.phone || "Không có SĐT"}) —{" "}
                  {l.interested_course_name || "Chưa có khóa"}
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
