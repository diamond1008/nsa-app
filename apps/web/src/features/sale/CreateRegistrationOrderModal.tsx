import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, CurrencyInput, ErrorBanner, Modal, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import type { Lead } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import type { CreateOrderInput } from "./saleApi";
import { formatVND } from "./saleShared";
import { formatOrderNotesWithInstallments } from "./installmentUtils";
import {
  ClassSelectorDropdown,
  CourseSelectorDropdown,
  StudentSelectorDropdown,
} from "./SaleDropdowns";

interface ManualInstallmentRow {
  round: number;
  due_date: string;
  amount: number;
}

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
  const [enrollmentType, setEnrollmentType] = useState<"class" | "waitlist">(
    availableClasses.length > 0 ? "class" : "waitlist",
  );
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [amount, setAmount] = useState<number>(15000000);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountNote, setDiscountNote] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const finalAmount = Math.max(0, amount - discountAmount);

  // Manual installments list: Sale enters due_date and amount directly
  const [installments, setInstallments] = useState<ManualInstallmentRow[]>([
    {
      round: 1,
      due_date: new Date().toISOString().slice(0, 10),
      amount: 15000000,
    },
  ]);

  const coursesQuery = useQuery({
    queryKey: ["sale", "courses"],
    queryFn: () => saleApi.listCourses(),
  });

  useEffect(() => {
    if (defaultLeadId) setSelectedLeadId(defaultLeadId);
    if (defaultClassId) setSelectedClassId(defaultClassId);
  }, [defaultLeadId, defaultClassId]);

  const selectedLead = selectableLeads.find((l) => l.id === selectedLeadId);

  useEffect(() => {
    if (selectedLead?.interested_course_id && !selectedCourseId) {
      setSelectedCourseId(selectedLead.interested_course_id);
    }
  }, [selectedLead, selectedCourseId]);

  // Keep single-installment amount in sync with finalAmount
  useEffect(() => {
    setInstallments((prev) => {
      if (prev.length <= 1) {
        return [
          {
            round: 1,
            due_date: prev[0]?.due_date || new Date().toISOString().slice(0, 10),
            amount: finalAmount,
          },
        ];
      }
      return prev;
    });
  }, [finalAmount]);

  const totalPlanned = useMemo(
    () => installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    [installments],
  );
  const diff = finalAmount - totalPlanned;

  const handleAddInstallment = () => {
    setInstallments((prev) => {
      const nextRound = prev.length + 1;
      let nextDueDate = new Date().toISOString().slice(0, 10);
      if (prev.length > 0) {
        const lastDate = new Date(prev[prev.length - 1].due_date || new Date());
        if (!isNaN(lastDate.getTime())) {
          lastDate.setDate(lastDate.getDate() + 30);
          nextDueDate = lastDate.toISOString().slice(0, 10);
        }
      }
      const currentSum = prev.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const remaining = Math.max(0, finalAmount - currentSum);
      return [
        ...prev,
        {
          round: nextRound,
          due_date: nextDueDate,
          amount: remaining,
        },
      ];
    });
  };

  const handleRemoveInstallment = (index: number) => {
    if (installments.length <= 1) return;
    setInstallments((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({
          ...item,
          round: idx + 1,
        })),
    );
  };

  const handleEvenSplit = () => {
    if (installments.length === 0) return;
    const count = installments.length;
    const base = Math.floor(finalAmount / count);
    const remainder = finalAmount - base * count;
    setInstallments((prev) =>
      prev.map((inst, idx) => ({
        ...inst,
        amount: idx === 0 ? base + remainder : base,
      })),
    );
  };

  const handleUpdateDueDate = (index: number, newDate: string) => {
    setInstallments((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, due_date: newDate } : item)),
    );
  };

  const handleUpdateAmount = (index: number, newAmount: number) => {
    setInstallments((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, amount: newAmount } : item)),
    );
  };

  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderInput) => saleApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      if (selectedLeadId) {
        queryClient.invalidateQueries({ queryKey: ["sale", "lead-orders", selectedLeadId] });
        queryClient.invalidateQueries({ queryKey: ["sale", "lead", selectedLeadId] });
      }
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
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

    if (enrollmentType === "class") {
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
    } else {
      if (!selectedCourseId) {
        setFormError("Vui lòng chọn khóa học đăng ký vào phòng chờ.");
        return;
      }
    }

    if (amount <= 0) {
      setFormError("Học phí niêm yết phải lớn hơn 0 VNĐ.");
      return;
    }

    if (discountAmount > amount) {
      setFormError("Số tiền giảm giá không được vượt quá tổng học phí.");
      return;
    }

    if (diff !== 0) {
      setFormError(
        `Tổng số tiền các đợt đóng (${formatVND(totalPlanned)}) chưa khớp với số tiền thực thu cần nộp (${formatVND(finalAmount)}). Vui lòng điều chỉnh lại.`,
      );
      return;
    }

    for (let i = 0; i < installments.length; i++) {
      if (!installments[i].due_date) {
        setFormError(`Vui lòng chọn ngày phải đóng tiền cho Đợt ${i + 1}.`);
        return;
      }
      if (installments[i].amount <= 0 && finalAmount > 0) {
        setFormError(`Số tiền Đợt ${i + 1} phải lớn hơn 0 VNĐ.`);
        return;
      }
    }

    const serializedItems = installments.map((inst, idx) => ({
      round: idx + 1,
      amount: inst.amount,
      due_date: inst.due_date,
      status: "pending" as const,
    }));

    const serializedNotes = formatOrderNotesWithInstallments(orderNotes, {
      plan_type: installments.length,
      total_installments: installments.length,
      installments: serializedItems,
      user_notes: orderNotes,
    });

    createOrderMutation.mutate({
      lead_id: selectedLeadId,
      student_id: selectedLead.converted_student_id || undefined,
      class_id: enrollmentType === "class" ? selectedClassId : undefined,
      course_id: enrollmentType === "waitlist" ? selectedCourseId : undefined,
      amount,
      discount_amount: discountAmount,
      discount_note: discountNote || undefined,
      notes: serializedNotes,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo Phiếu Đăng Ký Học Viên"
      className="max-w-3xl sm:max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && <ErrorBanner message={formError} />}

        {/* Top 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left Column: Student & Class/Course */}
          <div className="space-y-4">
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

            {/* Enrollment Target Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Hình thức ghi danh <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEnrollmentType("class")}
                  className={clsx(
                    "flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs font-bold border transition-all cursor-pointer",
                    enrollmentType === "class"
                      ? "bg-blue-50 border-[#0532e6] text-[#0532e6] shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon name="academic" className="h-4 w-4" />
                  Lớp đang tuyển sinh
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollmentType("waitlist")}
                  className={clsx(
                    "flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs font-bold border transition-all cursor-pointer",
                    enrollmentType === "waitlist"
                      ? "bg-amber-50 border-amber-500 text-amber-900 shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon name="clock" className="h-4 w-4 text-amber-600" />
                  Phòng chờ (Chưa mở lớp)
                </button>
              </div>
            </div>

            {enrollmentType === "class" ? (
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
                {availableClasses.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50/80 p-2 rounded-lg border border-amber-200">
                    Chưa có lớp nào mở tuyển sinh. Bạn có thể bấm chọn{" "}
                    <strong>Phòng chờ (Chưa mở lớp)</strong> ở trên để ghi danh khóa học trước.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Khóa học đăng ký (Phòng chờ) <span className="text-red-500">*</span>
                </label>
                <CourseSelectorDropdown
                  value={selectedCourseId}
                  onChange={setSelectedCourseId}
                  courses={coursesQuery.data?.items ?? []}
                  required
                  placeholder="-- Chọn khóa học đăng ký chờ mở lớp --"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Học viên sẽ được lưu vào danh sách <strong>Phòng chờ</strong> và có thể xếp lớp
                  ngay khi Đào tạo mở lớp mới.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Tuition & Discount */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput
                label="Học phí niêm yết (VNĐ)"
                value={amount}
                onChange={setAmount}
                placeholder="0"
                suffix="VNĐ"
                required
              />

              <CurrencyInput
                label="Giảm giá / Học bổng (VNĐ)"
                value={discountAmount}
                onChange={setDiscountAmount}
                placeholder="0"
                suffix="VNĐ"
              />
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
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/90 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-xs font-medium text-slate-500 block">
                  Số tiền thực thu cần nộp:
                </span>
                <span className="text-xs text-slate-400">
                  {formatVND(amount)} - {formatVND(discountAmount)}
                </span>
              </div>
              <span className="text-xl font-bold text-[#0532e6] tracking-tight">
                {formatVND(finalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Section: Manual Installment Schedule */}
        <div className="pt-4 border-t border-slate-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Kế hoạch các đợt đóng học phí ({installments.length} đợt)
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Nhập trực tiếp ngày hẹn đóng và số tiền phải nộp cho từng đợt theo thỏa thuận tuyển
                sinh.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {installments.length > 1 && (
                <button
                  type="button"
                  onClick={handleEvenSplit}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-[#0532e6] bg-white hover:bg-blue-50 border border-slate-200 rounded-lg shadow-2xs cursor-pointer transition-colors"
                  title="Chia đều số tiền thực thu cho các đợt hiện có"
                >
                  <Icon name="rotate-ccw" className="h-3 w-3" />
                  Chia đều số tiền
                </button>
              )}
              <Button
                type="button"
                variant="soft"
                className="text-xs h-8 px-3"
                onClick={handleAddInstallment}
              >
                <Icon name="plus" className="h-3.5 w-3.5 mr-1" />
                Thêm đợt đóng
              </Button>
            </div>
          </div>

          {/* Table / List of Installment Rows */}
          <div className="space-y-2">
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100/70 rounded-xl">
              <span className="w-16">Đợt</span>
              <span className="flex-1">Ngày phải đóng tiền (Hạn nộp) *</span>
              <span className="flex-1">Số tiền phải đóng (VNĐ) *</span>
              <span className="w-8 text-right">Xóa</span>
            </div>

            {installments.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all shadow-2xs animate-ios-spring-pop"
              >
                <div className="sm:w-16 flex items-center gap-1.5 shrink-0">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-[#0532e6] shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    Đợt {idx + 1}
                  </span>
                </div>

                <div className="flex-1">
                  <label className="sm:hidden block text-[11px] font-medium text-slate-500 mb-1">
                    Ngày phải đóng tiền:
                  </label>
                  <input
                    type="date"
                    value={item.due_date}
                    onChange={(e) => handleUpdateDueDate(idx, e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-800 bg-white shadow-2xs focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]/20 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex-1">
                  <label className="sm:hidden block text-[11px] font-medium text-slate-500 mb-1">
                    Số tiền phải đóng:
                  </label>
                  <CurrencyInput
                    value={item.amount}
                    onChange={(val) => handleUpdateAmount(idx, val)}
                    placeholder="0"
                    suffix="VNĐ"
                    required
                  />
                </div>

                <div className="sm:w-8 flex items-center justify-end shrink-0">
                  {installments.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveInstallment(idx)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`Xóa Đợt ${idx + 1}`}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="h-8 w-8" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Verification Bar */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-500">Tổng các đợt: </span>
                <span className="font-bold text-slate-900">{formatVND(totalPlanned)}</span>
              </div>
              <div className="h-3.5 w-px bg-slate-200" />
              <div>
                <span className="text-slate-500">Cần nộp: </span>
                <span className="font-bold text-[#0532e6]">{formatVND(finalAmount)}</span>
              </div>
            </div>

            <div>
              {diff === 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  <Icon name="check" className="h-3.5 w-3.5 text-emerald-600" />
                  Đã khớp 100% ({formatVND(finalAmount)})
                </span>
              ) : diff > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 text-amber-900 font-medium border border-amber-300">
                  <Icon name="alert" className="h-3.5 w-3.5 text-amber-600" />
                  Còn thiếu: <strong>{formatVND(diff)}</strong>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 text-rose-900 font-medium border border-rose-300">
                  <Icon name="alert" className="h-3.5 w-3.5 text-rose-600" />
                  Vượt quá: <strong>{formatVND(Math.abs(diff))}</strong>
                </span>
              )}
            </div>
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
