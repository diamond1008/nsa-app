import { describe, expect, it } from "vitest";
import {
  INSTALLMENT_PLANS,
  calculateInstallments,
  formatOrderNotesWithInstallments,
  parseOrderInstallmentPlan,
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

    expect(serialized).toContain("[CHÍNH SÁCH ĐÓNG HỌC PHÍ: Đóng 3 lần (40% - 30% - 30%)]");
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

  it("gracefully falls back for legacy unstructured orders", () => {
    const legacyOrder: Order = {
      id: "ord-legacy",
      order_code: "DH00000099",
      amount: 5000000,
      discount_amount: 0,
      final_amount: 5000000,
      status: "paid",
      payment_method: "transfer",
      paid_at: "2026-10-18T10:00:00Z",
      created_by: "user-2",
      created_at: "2026-10-18T00:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
      notes: "Đơn đóng tiền một lần bình thường",
    };

    const parsed = parseOrderInstallmentPlan(legacyOrder);
    expect(parsed.total_installments).toBe(1);
    expect(parsed.installments).toHaveLength(1);
    expect(parsed.installments[0].status).toBe("paid");
    expect(parsed.installments[0].amount).toBe(5000000);
    expect(parsed.installments[0].receipt_code).toBe("PT00000099");
  });
});
