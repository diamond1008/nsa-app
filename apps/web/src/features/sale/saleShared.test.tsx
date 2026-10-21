import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  formatVND,
  generateStudentPassword,
  getChannelLabel,
  getPipelineStatusLabel,
  getSourceLabel,
  LeadPipelineBadge,
  OrderStatusBadge,
  PIPELINE_STATUS_OPTIONS,
} from "./saleShared";

describe("sale shared helpers and badges", () => {
  it("generates 8 alphanumeric characters (letters and numbers, no special symbols) for student initial password", () => {
    const password = generateStudentPassword();
    expect(password).toHaveLength(8);
    expect(password).toMatch(/^[A-Za-z0-9]{8}$/);
  });
  it("formats VND amounts accurately", () => {
    expect(formatVND(15000000)).toMatch(/15\.000\.000\s?đ/);
    expect(formatVND(0)).toBe("0 đ");
    expect(formatVND(null)).toBe("0 đ");
  });

  it("maps all 8 pipeline statuses to human labels", () => {
    expect(PIPELINE_STATUS_OPTIONS).toHaveLength(8);
    expect(getPipelineStatusLabel("data_moi")).toBe("Data mới");
    expect(getPipelineStatusLabel("knm_thue_bao")).toBe("KNM / Thuê bao");
    expect(getPipelineStatusLabel("goi_lai_sau")).toBe("Gọi lại sau");
    expect(getPipelineStatusLabel("follow")).toBe("Follow / Chăm sóc");
    expect(getPipelineStatusLabel("tu_choi")).toBe("Từ chối");
    expect(getPipelineStatusLabel("da_dang_ky")).toBe("Đã đăng ký");
    expect(getPipelineStatusLabel("dang_hoc")).toBe("Đang học");
    expect(getPipelineStatusLabel("ket_thuc")).toBe("Kết thúc");
  });

  it("maps lead sources and interaction channels", () => {
    expect(getSourceLabel("facebook")).toBe("Facebook");
    expect(getSourceLabel("zalo")).toBe("Zalo");
    expect(getSourceLabel("referral")).toBe("Giới thiệu");

    expect(getChannelLabel("phone_call")).toBe("Điện thoại");
    expect(getChannelLabel("zalo")).toBe("Zalo");
    expect(getChannelLabel("in_person")).toBe("Gặp trực tiếp");
  });

  it("renders LeadPipelineBadge correctly", () => {
    render(<LeadPipelineBadge status="data_moi" />);
    expect(screen.getByText("Data mới")).toBeInTheDocument();
  });

  it("renders OrderStatusBadge correctly", () => {
    render(<OrderStatusBadge status="paid" />);
    expect(screen.getByText("Đã thanh toán")).toBeInTheDocument();
  });
});
