import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";

import { Icon } from "../../components/icons";
import { Button } from "../../components/ui";
import type { Order } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";
import { parseOrderInstallmentPlan } from "./installmentUtils";

export interface LeadOrdersTabProps {
  leadId: string;
  studentId?: string;
  onCreateOrder?: () => void;
}

function renderOrderStatusBadge(
  order: Order,
  paidCount: number,
  total: number,
) {
  if (order.status === "cancelled") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
        Đã hủy
      </span>
    );
  }
  if (order.status === "refunded") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
        Đã hoàn tiền
      </span>
    );
  }
  if (order.status === "paid" || (total > 0 && paidCount === total)) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        Đã thanh toán tất cả
      </span>
    );
  }
  if (paidCount > 0) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
        Đã thanh toán {paidCount}/{total} đợt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      Chưa thanh toán
    </span>
  );
}

export function LeadOrdersTab({ leadId, studentId, onCreateOrder }: LeadOrdersTabProps) {
  const ordersQuery = useQuery({
    queryKey: ["sale", "lead-orders", leadId, studentId],
    queryFn: () =>
      saleApi.listOrders({
        lead_id: leadId,
        student_id: studentId || undefined,
        per_page: 50,
      }),
    enabled: Boolean(leadId),
  });

  const orders = (ordersQuery.data?.items ?? []) as Order[];

  if (ordersQuery.isLoading) {
    return (
      <div className="py-12 text-center text-xs text-slate-500">
        <Icon name="clock" className="h-5 w-5 mx-auto mb-2 text-slate-400 animate-spin" />
        Đang tải thông tin phiếu đăng ký...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-navy flex items-center gap-2">
            <span>Phiếu đăng ký học viên</span>
            <span className="rounded-full bg-blue-100 text-[#0532e6] px-2 py-0.5 text-xs font-bold">
              {orders.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Chi tiết các lớp học ghi danh, học phí và tiến độ đóng tiền của học viên
          </p>
        </div>

        {onCreateOrder && (
          <Button
            type="button"
            variant="primary"
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
            onClick={onCreateOrder}
          >
            <Icon name="plus" className="h-3.5 w-3.5 mr-1" />
            Lập phiếu đăng ký mới
          </Button>
        )}
      </div>

      {/* Empty State */}
      {orders.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-500">
            <Icon name="shopping-bag" className="h-6 w-6 text-slate-600" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-800">Chưa có phiếu đăng ký nào</h4>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Học viên này đã chốt nhưng chưa có phiếu đăng ký thu tiền hoặc chưa chọn lớp học.
          </p>
          {onCreateOrder && (
            <Button
              type="button"
              variant="primary"
              className="mt-4 h-8 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
              onClick={onCreateOrder}
            >
              <Icon name="plus" className="h-3.5 w-3.5 mr-1" />
              Lập phiếu đăng ký ngay
            </Button>
          )}
        </div>
      ) : (
        /* Orders List */
        <div className="space-y-3.5">
          {orders.map((order) => {
            const meta = parseOrderInstallmentPlan(order);
            const paidCount = meta.installments.filter((i) => i.status === "paid").length;
            const total = meta.total_installments;
            const hasAnyPaid = order.status === "paid" || paidCount > 0;

            return (
              <div
                key={order.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 hover:border-blue-300 transition"
              >
                {/* Header row: Order code + Status badge + Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-navy">
                        {order.order_code}
                      </span>
                      {renderOrderStatusBadge(order, paidCount, total)}
                    </div>
                    <p className="text-xs text-slate-700 mt-1 font-semibold flex items-center gap-1.5">
                      <Icon name="book" className="h-3.5 w-3.5 text-[#0532e6]" />
                      <span>
                        {order.class_code ? `Lớp: ${order.class_code}` : order.course_name}
                        {order.class_name && order.class_name !== order.class_code && (
                          <span className="text-slate-500 font-normal"> — {order.class_name}</span>
                        )}
                      </span>
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-bold text-navy tabular-nums block">
                      {formatVND(order.final_amount)}
                    </span>
                    {order.discount_amount > 0 && (
                      <span className="text-[11px] text-emerald-600 font-medium">
                        Ưu đãi: -{formatVND(order.discount_amount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Installments Breakdown */}
                {total > 1 && (
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Kế hoạch đóng {total} đợt:</span>
                      <span className="text-[#0532e6]">Đã thu {paidCount}/{total} đợt</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                      {meta.installments.map((inst) => (
                        <div
                          key={inst.round}
                          className={clsx(
                            "p-2 rounded-lg border text-xs",
                            inst.status === "paid"
                              ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                              : "bg-white border-slate-200 text-slate-700"
                          )}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>Đợt {inst.round} ({inst.percentage}%)</span>
                            <span
                              className={
                                inst.status === "paid"
                                  ? "text-emerald-700 font-bold"
                                  : "text-amber-700 font-medium"
                              }
                            >
                              {inst.status === "paid" ? "✓ Đã thu" : "Chưa thu"}
                            </span>
                          </div>
                          <p className="font-mono font-bold text-xs mt-0.5">
                            {formatVND(inst.amount)}
                          </p>
                          {inst.receipt_code && (
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Phiếu: {inst.receipt_code}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer notes & actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>Ngày lập: {formatDate(order.created_at)}</span>
                    {order.created_by_email && (
                      <span className="text-slate-400">· Bởi: {order.created_by_email}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {hasAnyPaid && (
                      <Link
                        to={`/sale/phieu-thu?order_id=${order.id}&action=print`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0532e6] hover:underline"
                        target="_blank"
                      >
                        <Icon name="download" className="h-3.5 w-3.5" />
                        In biên lai
                      </Link>
                    )}
                    <Link
                      to={`/sale/phieu-thu?order_id=${order.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      <Icon name="shopping-bag" className="h-3.5 w-3.5" />
                      Lập phiếu thu / Chi tiết
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
