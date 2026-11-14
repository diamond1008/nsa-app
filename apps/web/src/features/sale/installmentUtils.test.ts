import { describe, expect, it } from "vitest";
import {
  INSTALLMENT_PLANS,
  applyReceiptPayment,
  calculateInstallments,
  formatOrderNotesWithInstallments,
  getInstallmentPlanOption,
  getOrderRemainingAmount,
  getOrderTotalPaid,
  parseOrderInstallmentPlan,
  replanRemainingInstallments,
} from "./installmentUtils";
import type { Order } from "../../lib/domainTypes";

describe("installmentUtils", () => {
  it("defines all required installment plan policies correctly", () => {
    expect(INSTALLMENT_PLANS[1].percentages).toEqual([100]);
    expect(INSTALLMENT_PLANS[2].percentages).toEqual([50, 50]);
    expect(INSTALLMENT_PLANS[3].percentages).toEqual([40, 30, 30]);
    expect(INSTALLMENT_PLANS[4].percentages).toEqual([30, 30, 20, 20]);
    expect(INSTALLMENT_PLANS[5].percentages).toEqual([20, 20, 20, 20, 20]);
  });

  it("calculates exact installment amounts summing up to final amount (10M VND)", () => {
    const finalAmount = 10000000;

    // 1 round
    const plan1 = calculateInstallments(finalAmount, 1);
    expect(plan1).toHaveLength(1);
    expect(plan1[0].amount).toBe(10000000);

    // 2 rounds: 50% - 50%
    const plan2 = calculateInstallments(finalAmount, 2);
    expect(plan2).toHaveLength(2);
    expect(plan2[0].amount).toBe(5000000);
    expect(plan2[1].amount).toBe(5000000);

    // 3 rounds: 40% - 30% - 30%
    const plan3 = calculateInstallments(finalAmount, 3);
    expect(plan3).toHaveLength(3);
    expect(plan3[0].amount).toBe(4000000);
    expect(plan3[1].amount).toBe(3000000);
    expect(plan3[2].amount).toBe(3000000);

    // 4 rounds: 30% - 30% - 20% - 20%
    const plan4 = calculateInstallments(finalAmount, 4);
    expect(plan4).toHaveLength(4);
    expect(plan4[0].amount).toBe(3000000);
    expect(plan4[1].amount).toBe(3000000);
    expect(plan4[2].amount).toBe(2000000);
    expect(plan4[3].amount).toBe(2000000);

    // 5 rounds: 20% - 20% - 20% - 20% - 20%
    const plan5 = calculateInstallments(finalAmount, 5);
    expect(plan5).toHaveLength(5);
    expect(plan5[0].amount).toBe(2000000);
    expect(plan5[1].amount).toBe(2000000);
    expect(plan5[2].amount).toBe(2000000);
    expect(plan5[3].amount).toBe(2000000);
    expect(plan5[4].amount).toBe(2000000);
  });

  it("supports dynamic custom number of installments (e.g. 6 rounds)", () => {
    const finalAmount = 12000000;
    const plan6 = calculateInstallments(finalAmount, 6);
    expect(plan6).toHaveLength(6);
    const sum = plan6.reduce((acc, curr) => acc + curr.amount, 0);
    expect(sum).toBe(finalAmount);

    const option = getInstallmentPlanOption(6);
    expect(option.installments).toBe(6);
    expect(option.percentages.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("handles rounding edge-cases ensuring sum strictly equals finalAmount", () => {
    const oddAmount = 10000001;
    const plan3 = calculateInstallments(oddAmount, 3);
    const sum = plan3.reduce((acc, curr) => acc + curr.amount, 0);
    expect(sum).toBe(oddAmount);
  });

  it("formats order notes and roundtrips with parseOrderInstallmentPlan", () => {
    const finalAmount = 15000000;
    const installments = calculateInstallments(finalAmount, 3);

    const userNote = "Khách hẹn đóng đợt 2 vào tuần sau";
    const serialized = formatOrderNotesWithInstallments(userNote, {
      plan_type: 3,
      total_installments: 3,
      installments,
      user_notes: userNote,
    });

    expect(serialized).toContain("[KẾ HOẠCH ĐÓNG HỌC PHÍ: 3 đợt]");
    expect(serialized).toContain("Khách hẹn đóng đợt 2 vào tuần sau");
    expect(serialized).toContain("<!--INSTALLMENT_DATA:");

    const mockOrder: Order = {
      id: "ord-123",
      order_code: "DH00000001",
      amount: 15000000,
      discount_amount: 0,
      final_amount: 15000000,
      status: "pending",
      created_by: "user-1",
      created_at: "2026-10-19T00:00:00Z",
      updated_at: "2026-10-19T00:00:00Z",
      notes: serialized,
    };

    const parsed = parseOrderInstallmentPlan(mockOrder);
    expect(parsed.total_installments).toBe(3);
    expect(parsed.installments).toHaveLength(3);
    expect(parsed.installments[0].percentage).toBe(40);
    expect(parsed.installments[0].amount).toBe(6000000);
    expect(parsed.installments[1].percentage).toBe(30);
    expect(parsed.installments[1].amount).toBe(4500000);
    expect(parsed.installments[2].percentage).toBe(30);
    expect(parsed.installments[2].amount).toBe(4500000);
  });

  it("correctly computes getOrderTotalPaid and getOrderRemainingAmount", () => {
    const meta = {
      plan_type: 3,
      total_installments: 3,
      installments: [
        { round: 1, percentage: 40, amount: 6000000, status: "paid" as const },
        { round: 2, percentage: 30, amount: 4500000, status: "pending" as const },
        { round: 3, percentage: 30, amount: 4500000, status: "pending" as const },
      ],
    };

    expect(getOrderTotalPaid(meta)).toBe(6000000);
    expect(getOrderRemainingAmount(15000000, meta)).toBe(9000000);
  });

  it("applies full payment in a 1-installment plan", () => {
    const finalAmount = 15000000;
    const initial = {
      plan_type: 1,
      total_installments: 1,
      installments: [{ round: 1, percentage: 100, amount: 15000000, status: "pending" as const }],
    };

    const res = applyReceiptPayment(initial, finalAmount, 1, 15000000, {
      receipt_code: "PT00000001",
      payment_method: "transfer",
    });

    expect(res.allPaid).toBe(true);
    expect(res.updatedMeta.installments).toHaveLength(1);
    expect(res.updatedMeta.installments[0].status).toBe("paid");
    expect(res.updatedMeta.installments[0].amount).toBe(15000000);
  });

  it("automatically records full payment before all scheduled rounds are reached", () => {
    // Customer originally scheduled 3 rounds: 6M, 4.5M, 4.5M (total 15M)
    // At round 1, customer paid 6M
    // At round 2, customer pays all remaining 9M full!
    const finalAmount = 15000000;
    const meta = {
      plan_type: 3,
      total_installments: 3,
      installments: [
        { round: 1, percentage: 40, amount: 6000000, status: "paid" as const },
        { round: 2, percentage: 30, amount: 4500000, status: "pending" as const },
        { round: 3, percentage: 30, amount: 4500000, status: "pending" as const },
      ],
    };

    const res = applyReceiptPayment(meta, finalAmount, 2, 9000000, {
      receipt_code: "PT00000001-2",
      payment_method: "transfer",
    });

    expect(res.allPaid).toBe(true);
    // Round 3 is no longer needed since full 15M has been paid
    expect(res.updatedMeta.total_installments).toBe(2);
    expect(res.updatedMeta.installments).toHaveLength(2);
    expect(res.updatedMeta.installments[0].amount).toBe(6000000);
    expect(res.updatedMeta.installments[0].status).toBe("paid");
    expect(res.updatedMeta.installments[1].amount).toBe(9000000);
    expect(res.updatedMeta.installments[1].status).toBe("paid");
  });

  it("handles partial payment in 1-installment plan by creating a follow-up round for remaining balance", () => {
    // 1-round plan of 15M, but customer only pays 5M
    const finalAmount = 15000000;
    const initial = {
      plan_type: 1,
      total_installments: 1,
      installments: [{ round: 1, percentage: 100, amount: 15000000, status: "pending" as const }],
    };

    const res = applyReceiptPayment(initial, finalAmount, 1, 5000000, {
      receipt_code: "PT00000001-1",
      payment_method: "transfer",
    });

    expect(res.allPaid).toBe(false);
    expect(res.updatedMeta.total_installments).toBe(2);
    expect(res.updatedMeta.installments).toHaveLength(2);
    expect(res.updatedMeta.installments[0].amount).toBe(5000000);
    expect(res.updatedMeta.installments[0].status).toBe("paid");
    expect(res.updatedMeta.installments[1].amount).toBe(10000000);
    expect(res.updatedMeta.installments[1].status).toBe("pending");
  });

  it("successfully replans remaining unpaid installments into multiple rounds", () => {
    // 1-round plan initially: customer paid 5M, 10M remaining
    // Customer asks to split remaining 10M into 2 rounds (5M each)
    const finalAmount = 15000000;
    const meta = {
      plan_type: 2,
      total_installments: 2,
      installments: [
        { round: 1, percentage: 33, amount: 5000000, status: "paid" as const },
        { round: 2, percentage: 67, amount: 10000000, status: "pending" as const },
      ],
    };

    const replanned = replanRemainingInstallments(meta, finalAmount, 2);
    expect(replanned.total_installments).toBe(3); // 1 paid + 2 new pending
    expect(replanned.installments).toHaveLength(3);
    expect(replanned.installments[0].status).toBe("paid");
    expect(replanned.installments[0].amount).toBe(5000000);
    expect(replanned.installments[1].status).toBe("pending");
    expect(replanned.installments[1].amount).toBe(5000000);
    expect(replanned.installments[2].status).toBe("pending");
    expect(replanned.installments[2].amount).toBe(5000000);
  });
});
