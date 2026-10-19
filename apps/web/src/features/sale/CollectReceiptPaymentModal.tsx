import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBanner, Modal, Select, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";
import type { Order } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";

interface CollectReceiptPaymentModalProps {
  order: Order | null;
  onClose: () => void;
  onSuccess?: (order: Order) => void;
}

export function CollectReceiptPaymentModal({
  order,
  onClose,
  onSuccess,
}: CollectReceiptPaymentModalProps) {
  const queryClient = useQueryClient();
  const [collectPaymentMethod, setCollectPaymentMethod] = useState("transfer");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectError, setCollectError] = useState("");

  const collectPaymentMutation = useMutation({
    mutationFn: ({
      orderId,
      paymentMethod,
      notes,
    }: {
      orderId: string;
      paymentMethod: string;
      notes?: string;
    }) =>
      saleApi.updateOrderStatus(orderId, "paid", {
        payment_method: paymentMethod,
        notes,
      }),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
      onClose();
      onSuccess?.(updatedOrder);
    },
    onError: (err) => {
      setCollectError(mutationMessage(err));
    },
  });

  if (!order) return null;

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={`Ghi nhận thu tiền: ${order.order_code}`}
    >
      <div className="space-y-4">
        {collectError && <ErrorBanner message={collectError} />}

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Học viên:</span>
            <span className="font-bold text-slate-900">
              {order.student_name || order.lead_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Khóa / Lớp học:</span>
            <span className="font-semibold text-slate-800">
              {order.class_code || order.course_name}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-200">
            <span className="font-bold text-slate-700">Số tiền cần thu:</span>
            <span className="text-base font-bold text-emerald-600">
              {formatVND(order.final_amount)}
            </span>
          </div>
        </div>

        <Select
          label="Phương thức thu tiền thực tế *"
          value={collectPaymentMethod}
          onChange={(e) => setCollectPaymentMethod(e.target.value)}
        >
          <option value="transfer">Chuyển khoản ngân hàng</option>
          <option value="cash">Tiền mặt tại văn phòng</option>
          <option value="pos">Quẹt thẻ POS</option>
          <option value="installment">Trả góp học phí</option>
        </Select>

        <Textarea
          label="Ghi chú thu tiền / Mã giao dịch ngân hàng"
          placeholder="VD: Chuyển khoản Vietcombank qua mã GD 128491..."
          value={collectNotes}
          onChange={(e) => setCollectNotes(e.target.value)}
          rows={2}
        />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button
            type="button"
            variant="primary"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            loading={collectPaymentMutation.isPending}
            onClick={() =>
              collectPaymentMutation.mutate({
                orderId: order.id,
                paymentMethod: collectPaymentMethod,
                notes: collectNotes || undefined,
              })
            }
          >
            <Icon name="check" className="h-4 w-4 mr-1.5" />
            Xác nhận đã thu & In biên lai
          </Button>
        </div>
      </div>
    </Modal>
  );
}
