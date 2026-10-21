import { useRef } from "react";
import { Icon } from "../../components/icons";
import { Button, Modal } from "../../components/ui";
import type { Order } from "../../lib/domainTypes";
import { formatVND } from "./saleShared";

// Helper convert number to Vietnamese words
function numberToVietnameseWords(num: number): string {
  if (num === 0) return "Không đồng";

  const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const scales = ["", "nghìn", "triệu", "tỷ"];

  function readGroup(n: number): string {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let res = "";

    if (h > 0) {
      res += `${units[h]} trăm `;
    }
    if (t > 1) {
      res += `${units[t]} mươi `;
      if (u === 1) res += "mốt";
      else if (u === 5) res += "lăm";
      else if (u > 0) res += units[u];
    } else if (t === 1) {
      res += "mười ";
      if (u === 5) res += "lăm";
      else if (u > 0) res += units[u];
    } else if (u > 0) {
      if (h > 0) res += "lẻ ";
      res += units[u];
    }

    return res.trim();
  }

  let scaleIdx = 0;
  let remaining = Math.round(num);
  let words = "";

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkStr = readGroup(chunk);
      words = `${chunkStr} ${scales[scaleIdx]} ${words}`.trim();
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} đồng chẵn.`;
}

export interface ReceiptInfo {
  receiptCode?: string;
  amount?: number;
  round?: number;
  totalRounds?: number;
  percentage?: number;
  paidAt?: string;
  paymentMethod?: string;
}

interface ReceiptPrintModalProps {
  order: Order | null;
  onClose: () => void;
  receiptInfo?: ReceiptInfo | null;
}

export function ReceiptPrintModal({ order, onClose, receiptInfo }: ReceiptPrintModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const receiptCode = receiptInfo?.receiptCode || order.order_code.replace("DH", "PT");
  const actualAmount = receiptInfo?.amount ?? order.final_amount;
  const studentName = order.student_name || order.lead_name || "Học viên";
  const courseClassName = order.class_name
    ? `${order.course_name} (${order.class_code})`
    : order.course_name || "Khóa học đào tạo";
  const amountWords = numberToVietnameseWords(actualAmount);
  
  const paymentMethodKey = receiptInfo?.paymentMethod || order.payment_method;
  const paymentMethodLabel =
    paymentMethodKey === "transfer"
      ? "Chuyển khoản ngân hàng"
      : paymentMethodKey === "cash"
        ? "Tiền mặt tại văn phòng"
        : paymentMethodKey === "pos"
          ? "Quẹt thẻ POS"
          : paymentMethodKey === "installment"
            ? "Trả góp học phí"
            : paymentMethodKey || "Chuyển khoản ngân hàng";

  const dateValue = receiptInfo?.paidAt || order.paid_at || order.created_at;
  const paymentDate = new Date(dateValue);
  const day = paymentDate.getDate();
  const month = paymentDate.getMonth() + 1;
  const year = paymentDate.getFullYear();

  const stageText =
    receiptInfo?.round && receiptInfo.totalRounds && receiptInfo.totalRounds > 1
      ? ` (Đợt ${receiptInfo.round}/${receiptInfo.totalRounds} · ${receiptInfo.percentage}%)`
      : "";

  // Strip html comment metadata for clean print note
  const cleanNotes = order.notes?.replace(/<!--INSTALLMENT_DATA:[\s\S]*?-->/g, "").trim() || "";

  return (
    <Modal open={Boolean(order)} onClose={onClose} title="Biên lai Phiếu thu Tiền học phí">
      <div className="space-y-4">
        {/* Print Styles */}
        <style>
          {`
            @media print {
              body * {
                visibility: hidden;
              }
              #receipt-print-area, #receipt-print-area * {
                visibility: visible;
              }
              #receipt-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 24px;
                background: white !important;
                color: black !important;
                box-shadow: none !important;
                border: none !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}
        </style>

        {/* Printable Receipt Paper */}
        <div
          id="receipt-print-area"
          ref={printAreaRef}
          className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 text-slate-800 shadow-sm font-sans"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider text-navy uppercase">
                  NSA TRAINING PLATFORM
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Học viện Đào tạo & Khảo thí Kỹ thuật Quốc tế
              </p>
              <p className="text-xs text-slate-400">
                Địa chỉ: Tòa nhà NSA, Khu Công Nghệ Cao, TP.HCM
              </p>
              <p className="text-xs text-slate-400">Hotline: 1900 8888 · Website: nsa.edu.vn</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                Mẫu số: 01-TT
              </span>
              <p className="text-xs font-mono text-slate-500 mt-1">
                Số: <b className="text-slate-900">{receiptCode}</b>
              </p>
              <p className="text-[11px] text-slate-400">Gốc: {order.order_code}</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-4">
            <h3 className="text-xl font-bold uppercase tracking-tight text-slate-900">
              PHIẾU THU TIỀN HỌC PHÍ
            </h3>
            <p className="text-xs italic text-slate-500 mt-0.5">
              Ngày {day} tháng {month} năm {year}
            </p>
          </div>

          {/* Content Details */}
          <div className="space-y-3 text-xs sm:text-sm my-6">
            <div className="flex items-baseline">
              <span className="w-36 shrink-0 font-medium text-slate-600">Họ và tên người nộp:</span>
              <span className="font-bold text-slate-900 uppercase">{studentName}</span>
              {order.student_code && (
                <span className="ml-2 font-mono text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                  Mã HV: {order.student_code}
                </span>
              )}
            </div>

            <div className="flex items-baseline">
              <span className="w-36 shrink-0 font-medium text-slate-600">Nội dung thu:</span>
              <span className="font-semibold text-slate-800">
                Thu học phí ghi danh khóa học: {courseClassName}{stageText}
              </span>
            </div>

            <div className="flex items-baseline">
              <span className="w-36 shrink-0 font-medium text-slate-600">
                Hình thức thanh toán:
              </span>
              <span className="font-medium text-slate-800">{paymentMethodLabel}</span>
            </div>

            <div className="flex items-baseline">
              <span className="w-36 shrink-0 font-medium text-slate-600">Học phí gốc:</span>
              <span className="text-slate-700">{formatVND(order.amount)}</span>
              {order.discount_amount > 0 && (
                <span className="ml-3 text-emerald-600 font-medium">
                  (Đã giảm giá/học bổng: -{formatVND(order.discount_amount)})
                </span>
              )}
            </div>

            <div className="flex items-baseline pt-2 border-t border-dashed border-slate-200">
              <span className="w-36 shrink-0 font-bold text-slate-900">Số tiền thực thu:</span>
              <span className="font-extrabold text-base text-[#0532e6]">
                {formatVND(actualAmount)}
              </span>
            </div>

            <div className="flex items-baseline">
              <span className="w-36 shrink-0 font-medium text-slate-600">Viết bằng chữ:</span>
              <span className="italic font-medium text-slate-800">{amountWords}</span>
            </div>

            {cleanNotes && (
              <div className="flex items-baseline">
                <span className="w-36 shrink-0 font-medium text-slate-600">Ghi chú:</span>
                <span className="text-slate-600 whitespace-pre-line">{cleanNotes}</span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-4 text-center mt-10 pt-4 border-t border-slate-200">
            <div>
              <p className="font-bold text-xs uppercase text-slate-800">Người nộp tiền</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="text-xs font-semibold text-slate-700">{studentName}</span>
              </div>
            </div>

            <div>
              <p className="font-bold text-xs uppercase text-slate-800">Người lập phiếu</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="text-xs font-semibold text-slate-700">
                  {order.created_by_email?.split("@")[0] || "Ban Tuyển sinh"}
                </span>
              </div>
            </div>

            <div>
              <p className="font-bold text-xs uppercase text-slate-800">Thủ quỹ / Kế toán</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, đóng dấu)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="text-xs font-semibold text-slate-700">Kế toán Tuyển sinh</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button type="button" variant="primary" onClick={handlePrint}>
            <Icon name="download" className="h-4 w-4 mr-1.5" />
            In Phiếu Thu
          </Button>
        </div>
      </div>
    </Modal>
  );
}
