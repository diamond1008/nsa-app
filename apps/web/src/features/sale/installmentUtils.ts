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
    label: "Đóng 1 lần (100% full)",
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

export function getInstallmentPlanOption(count: number): InstallmentPlanOption {
  if (INSTALLMENT_PLANS[count]) {
    return INSTALLMENT_PLANS[count];
  }
  const safeCount = Math.max(1, count);
  if (safeCount === 1) {
    return INSTALLMENT_PLANS[1];
  }
  const basePct = Math.floor(100 / safeCount);
  const remainder = 100 - basePct * safeCount;
  const percentages = Array(safeCount).fill(basePct);
  percentages[0] += remainder;

  return {
    installments: safeCount,
    label: `Đóng ${safeCount} lần (Chia ${safeCount} đợt)`,
    percentages,
  };
}

export interface InstallmentItem {
  round: number; // 1, 2, ...
  percentage?: number;
  amount: number;
  due_date?: string;
  status: "pending" | "paid";
  receipt_code?: string;
  payment_method?: string;
  paid_at?: string;
  collected_by_name?: string;
  notes?: string;
}

export interface InstallmentMetadata {
  plan_type: number; // 1, 2, 3, ...
  total_installments: number;
  installments: InstallmentItem[];
  user_notes?: string;
}

/**
 * Validates that the sum of installment amounts strictly matches the expected total amount.
 */
export function verifyInstallmentsSum(items: InstallmentItem[], totalAmount: number): boolean {
  const sum = items.reduce((acc, item) => acc + item.amount, 0);
  return sum === Math.max(0, Math.round(totalAmount));
}

/**
 * Calculates the exact amount for each installment stage given final amount and plan.
 * Ensures the sum of all installments strictly equals finalAmount.
 */
export function calculateInstallments(finalAmount: number, planType: number): InstallmentItem[] {
  const plan = getInstallmentPlanOption(planType);
  const items: InstallmentItem[] = [];
  const roundedFinal = Math.max(0, Math.round(finalAmount));
  let allocated = 0;

  plan.percentages.forEach((pct, index) => {
    const isLast = index === plan.percentages.length - 1;
    const roundAmount = isLast
      ? Math.max(0, roundedFinal - allocated)
      : Math.round((roundedFinal * pct) / 100);

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
 * Gets total amount already paid across all paid installments.
 */
export function getOrderTotalPaid(meta: InstallmentMetadata): number {
  return meta.installments.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
}

/**
 * Gets remaining balance to be paid for the order.
 */
export function getOrderRemainingAmount(finalAmount: number, meta: InstallmentMetadata): number {
  const totalPaid = getOrderTotalPaid(meta);
  return Math.max(0, Math.round(finalAmount) - totalPaid);
}

/**
 * Checks if the order is 100% fully paid.
 */
export function isOrderFullyPaid(finalAmount: number, meta: InstallmentMetadata): boolean {
  return getOrderRemainingAmount(finalAmount, meta) === 0;
}

/**
 * Re-plans the remaining unpaid balance into a new number of pending installments.
 * Keeps all already paid installments untouched.
 */
export function replanRemainingInstallments(
  meta: InstallmentMetadata,
  finalAmount: number,
  newRemainingRounds: number,
): InstallmentMetadata {
  const roundedFinal = Math.max(0, Math.round(finalAmount));
  const paidItems = meta.installments
    .filter((i) => i.status === "paid")
    .sort((a, b) => a.round - b.round);
  const totalPaid = paidItems.reduce((sum, i) => sum + i.amount, 0);
  const remaining = Math.max(0, roundedFinal - totalPaid);

  if (remaining <= 0) {
    // Already fully paid
    return {
      ...meta,
      total_installments: paidItems.length || 1,
      installments: paidItems,
    };
  }

  const safeRounds = Math.max(1, newRemainingRounds);
  const newPendingItems: InstallmentItem[] = [];
  let allocated = 0;

  for (let idx = 0; idx < safeRounds; idx++) {
    const isLast = idx === safeRounds - 1;
    const roundNumber = paidItems.length + idx + 1;
    const roundAmount = isLast
      ? Math.max(0, remaining - allocated)
      : Math.round(remaining / safeRounds);

    if (!isLast) {
      allocated += roundAmount;
    }

    const pct = roundedFinal > 0 ? Math.round((roundAmount / roundedFinal) * 100) : 0;
    newPendingItems.push({
      round: roundNumber,
      percentage: pct,
      amount: roundAmount,
      status: "pending",
    });
  }

  const combined = [...paidItems, ...newPendingItems];
  return {
    ...meta,
    plan_type: combined.length,
    total_installments: combined.length,
    installments: combined,
  };
}

export interface ApplyReceiptPaymentDetails {
  receipt_code: string;
  payment_method?: string;
  paid_at?: string;
  collected_by_name?: string;
  notes?: string;
}

/**
 * Applies a receipt collection with a custom collected amount to the installment schedule.
 * - If customer pays full balance: strips subsequent pending rounds and marks allPaid = true.
 * - If customer pays partial: updates this round as paid, and distributes remaining unpaid balance across remaining pending rounds (or adds an extra round).
 */
export function applyReceiptPayment(
  meta: InstallmentMetadata,
  finalAmount: number,
  roundToPay: number,
  paidAmount: number,
  details: ApplyReceiptPaymentDetails,
): { updatedMeta: InstallmentMetadata; allPaid: boolean } {
  const roundedFinal = Math.max(0, Math.round(finalAmount));
  const safePaidAmount = Math.max(0, Math.round(paidAmount));

  // Separate already paid items prior to this round and other items
  const otherPaidItems = meta.installments.filter(
    (i) => i.status === "paid" && i.round !== roundToPay,
  );
  const totalPaidPrior = otherPaidItems.reduce((sum, i) => sum + i.amount, 0);

  // Maximum amount allowable to collect is remaining before this payment
  const remainingBefore = Math.max(0, roundedFinal - totalPaidPrior);
  const actualPaid = Math.min(safePaidAmount, remainingBefore);

  // Create/update the paid item for roundToPay
  const paidItem: InstallmentItem = {
    round: roundToPay,
    percentage: roundedFinal > 0 ? Math.round((actualPaid / roundedFinal) * 100) : 100,
    amount: actualPaid,
    status: "paid",
    receipt_code: details.receipt_code,
    payment_method: details.payment_method,
    paid_at: details.paid_at || new Date().toISOString(),
    collected_by_name: details.collected_by_name || "Sale",
    notes: details.notes,
  };

  const newTotalPaid = totalPaidPrior + actualPaid;
  const remainingAfter = Math.max(0, roundedFinal - newTotalPaid);

  const allPaidItems = [...otherPaidItems, paidItem].sort((a, b) => a.round - b.round);

  // Case A: Full payment (remainingAfter === 0)
  // Automatically records full payment and cleans up unused pending rounds
  if (remainingAfter === 0) {
    const normalized = allPaidItems.map((item, idx) => ({
      ...item,
      round: idx + 1,
    }));

    return {
      updatedMeta: {
        ...meta,
        total_installments: normalized.length,
        plan_type: normalized.length,
        installments: normalized,
      },
      allPaid: true,
    };
  }

  // Case B: Partial payment - Remaining balance exists (remainingAfter > 0)
  // Check future pending installments
  const futurePending = meta.installments.filter(
    (i) => i.status === "pending" && i.round > roundToPay,
  );

  let newPendingItems: InstallmentItem[];

  if (futurePending.length > 0) {
    // Redistribute remainingAfter across the future pending rounds
    let allocated = 0;
    newPendingItems = futurePending.map((p, idx) => {
      const isLast = idx === futurePending.length - 1;
      const roundAmt = isLast
        ? Math.max(0, remainingAfter - allocated)
        : Math.round(remainingAfter / futurePending.length);

      if (!isLast) {
        allocated += roundAmt;
      }

      const pct = roundedFinal > 0 ? Math.round((roundAmt / roundedFinal) * 100) : 0;
      return {
        ...p,
        amount: roundAmt,
        percentage: pct,
        status: "pending" as const,
      };
    });
  } else {
    // There were no future pending rounds (e.g. 1-round plan or was on last round)
    // Add an extra round for the unpaid balance so money is not lost
    const nextRound = roundToPay + 1;
    const pct = roundedFinal > 0 ? Math.round((remainingAfter / roundedFinal) * 100) : 0;
    newPendingItems = [
      {
        round: nextRound,
        percentage: pct,
        amount: remainingAfter,
        status: "pending",
      },
    ];
  }

  const combined = [...allPaidItems, ...newPendingItems].sort((a, b) => a.round - b.round);
  const normalized = combined.map((item, idx) => ({
    ...item,
    round: idx + 1,
  }));

  return {
    updatedMeta: {
      ...meta,
      total_installments: normalized.length,
      plan_type: normalized.length,
      installments: normalized,
    },
    allPaid: false,
  };
}

/**
 * Encodes human-readable summary and structured JSON metadata into order notes.
 */
export function formatOrderNotesWithInstallments(
  userNotes: string,
  metadata: InstallmentMetadata,
): string {
  const totalCount = metadata.installments?.length || metadata.total_installments || 1;
  const lines: string[] = [];
  lines.push(`[KẾ HOẠCH ĐÓNG HỌC PHÍ: ${totalCount} đợt]`);

  metadata.installments.forEach((inst) => {
    const dueStr = inst.due_date ? ` (Hạn nộp: ${inst.due_date})` : "";
    const pctStr = inst.percentage ? ` (${inst.percentage}%)` : "";
    const statusText =
      inst.status === "paid"
        ? `Đã thu (${inst.receipt_code || "PT"}, ${formatVND(inst.amount)})`
        : `Chưa thu (${formatVND(inst.amount)})`;
    lines.push(`• Đợt ${inst.round}${pctStr}: ${formatVND(inst.amount)}${dueStr} - ${statusText}`);
  });

  if (userNotes?.trim()) {
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
        receipt_code: order.order_code.replace(/^(ORD|DH)/, "PT"),
        payment_method: order.payment_method || undefined,
        paid_at: order.paid_at || undefined,
        collected_by_name: order.created_by_email?.split("@")[0] || "Sale",
      },
    ],
  };
}
