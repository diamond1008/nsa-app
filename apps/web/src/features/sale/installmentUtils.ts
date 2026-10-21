import type { Order } from "../../lib/domainTypes";
import { formatVND } from "./saleShared";

export interface InstallmentPlanOption {
  installments: number;
  label: string;
  percentages: number[];
}

export const INSTALLMENT_PLANS: Record<number, InstallmentPlanOption> = {
  1: {
    installments: 1,
    label: "Đóng 1 lần (100%)",
    percentages: [100],
  },
  2: {
    installments: 2,
    label: "Đóng 2 lần (50% - 50%)",
    percentages: [50, 50],
  },
  3: {
    installments: 3,
    label: "Đóng 3 lần (40% - 30% - 30%)",
    percentages: [40, 30, 30],
  },
  4: {
    installments: 4,
    label: "Đóng 4 lần (30% - 30% - 20% - 20%)",
    percentages: [30, 30, 20, 20],
  },
  5: {
    installments: 5,
    label: "Đóng 5 lần (20% - 20% - 20% - 20% - 20%)",
    percentages: [20, 20, 20, 20, 20],
  },
};

export interface InstallmentItem {
  round: number; // 1, 2, ...
  percentage: number;
  amount: number;
  status: "pending" | "paid";
  receipt_code?: string;
  payment_method?: string;
  paid_at?: string;
  collected_by_name?: string;
  notes?: string;
}

export interface InstallmentMetadata {
  plan_type: number; // 1 to 5
  total_installments: number;
  installments: InstallmentItem[];
  user_notes?: string;
}

/**
 * Calculates the exact amount for each installment stage given final amount and plan.
 * Ensures the sum of all installments strictly equals finalAmount.
 */
export function calculateInstallments(finalAmount: number, planType: number): InstallmentItem[] {
  const plan = INSTALLMENT_PLANS[planType] || INSTALLMENT_PLANS[1];
  const items: InstallmentItem[] = [];
  let allocated = 0;

  plan.percentages.forEach((pct, index) => {
    const isLast = index === plan.percentages.length - 1;
    const roundAmount = isLast
      ? Math.max(0, finalAmount - allocated)
      : Math.round((finalAmount * pct) / 100);

    if (!isLast) {
      allocated += roundAmount;
    }

    items.push({
      round: index + 1,
      percentage: pct,
      amount: roundAmount,
      status: "pending",
    });
  });

  return items;
}

/**
 * Encodes human-readable summary and structured JSON metadata into order notes.
 */
export function formatOrderNotesWithInstallments(
  userNotes: string,
  metadata: InstallmentMetadata,
): string {
  const plan = INSTALLMENT_PLANS[metadata.plan_type] || INSTALLMENT_PLANS[1];
  const lines: string[] = [];
  lines.push(`[CHÍNH SÁCH ĐÓNG HỌC PHÍ: ${plan.label}]`);

  metadata.installments.forEach((inst) => {
    const statusText =
      inst.status === "paid"
        ? `Đã thu (${inst.receipt_code || "PT"}, ${formatVND(inst.amount)})`
        : `Chưa thu (${formatVND(inst.amount)})`;
    lines.push(
      `• Đợt ${inst.round} (${inst.percentage}%): ${formatVND(inst.amount)} - ${statusText}`,
    );
  });

  if (userNotes.trim()) {
    lines.push(`Ghi chú: ${userNotes.trim()}`);
  }

  lines.push(`<!--INSTALLMENT_DATA:${JSON.stringify(metadata)}-->`);
  return lines.join("\n");
}

/**
 * Parses order notes to extract structured installment plan.
 * Fallbacks to 1-stage plan for legacy or unstructured orders.
 */
export function parseOrderInstallmentPlan(order: Order): InstallmentMetadata {
  if (order.notes) {
    const marker = "<!--INSTALLMENT_DATA:";
    const startIdx = order.notes.indexOf(marker);
    if (startIdx !== -1) {
      const endIdx = order.notes.indexOf("-->", startIdx);
      if (endIdx !== -1) {
        try {
          const jsonStr = order.notes.substring(startIdx + marker.length, endIdx);
          const parsed = JSON.parse(jsonStr) as InstallmentMetadata;
          if (parsed && Array.isArray(parsed.installments) && parsed.installments.length > 0) {
            return parsed;
          }
        } catch {
          // ignore parsing error
        }
      }
    }
  }

  // Fallback for orders without metadata or legacy orders:
  const isPaid = order.status === "paid";
  return {
    plan_type: 1,
    total_installments: 1,
    user_notes: order.notes || "",
    installments: [
      {
        round: 1,
        percentage: 100,
        amount: order.final_amount,
        status: isPaid ? "paid" : "pending",
        receipt_code: order.order_code.replace("DH", "PT"),
        payment_method: order.payment_method || undefined,
        paid_at: order.paid_at || undefined,
        collected_by_name: order.created_by_email?.split("@")[0] || "Sale",
      },
    ],
  };
}
