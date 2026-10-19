import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBanner, Modal, Select } from "../../components/ui";
import type { Order, OrderStatus } from "../../lib/domainTypes";
import { mutationMessage } from "../../lib/format";
import { saleKeys } from "../../lib/queryKeys";
import { saleApi } from "./saleApi";
import { formatVND } from "./saleShared";

interface UpdateOrderStatusModalProps {
  order: Order | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UpdateOrderStatusModal({ order, onClose, onSuccess }: UpdateOrderStatusModalProps) {
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<OrderStatus>(order?.status ?? "paid");
  const [modalError, setModalError] = useState("");

  const updateStatusMutation = useMutation({
    mutationFn: () => {
      if (!order) throw new Error("No order selected");
      return saleApi.updateOrderStatus(order.id, newStatus);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: saleKeys.orders.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.receipts.all() });
      queryClient.invalidateQueries({ queryKey: saleKeys.dashboard() });
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      setModalError(mutationMessage(err));
    },
  });

  if (!order) return null;

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={`Cập nhật trạng thái phiếu: ${order.order_code}`}
    >
      <div className="space-y-4">
        {modalError && <ErrorBanner message={modalError} />}
        <p className="text-xs text-slate-600">
          Học viên: <b>{order.student_name || order.lead_name}</b> | Số tiền:{" "}
          <b>{formatVND(order.final_amount)}</b>
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
          <Button type="button" variant="ghost" onClick={onClose}>
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
  );
}
