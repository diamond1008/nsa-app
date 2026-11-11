import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput, formatNumberWithCommas } from "./CurrencyInput";

describe("formatNumberWithCommas helper", () => {
  it("formats integer numbers with commas", () => {
    expect(formatNumberWithCommas(6000000)).toBe("6,000,000");
    expect(formatNumberWithCommas(15000000)).toBe("15,000,000");
    expect(formatNumberWithCommas(500000)).toBe("500,000");
    expect(formatNumberWithCommas(0)).toBe("0");
  });

  it("handles string numbers or empty inputs", () => {
    expect(formatNumberWithCommas("")).toBe("");
    expect(formatNumberWithCommas("7000000")).toBe("7,000,000");
    expect(formatNumberWithCommas("7,000,000")).toBe("7,000,000");
  });
});

describe("CurrencyInput component", () => {
  it("renders with formatted value with commas", () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={6000000} onChange={handleChange} suffix="VNĐ" />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("6,000,000");
    expect(screen.getByText("VNĐ")).toBeInTheDocument();
  });

  it("formats input with commas when user types digits", () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={0} onChange={handleChange} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;

    // Simulate typing 1234567
    fireEvent.change(input, { target: { value: "1234567" } });

    expect(handleChange).toHaveBeenCalledWith(1234567);
    expect(input.value).toBe("1,234,567");
  });

  it("handles deletion and backspaces smoothly", () => {
    const handleChange = vi.fn();
    const { rerender } = render(<CurrencyInput value={6000000} onChange={handleChange} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("6,000,000");

    // Remove the last zero
    fireEvent.change(input, { target: { value: "6,000,00" } });
    expect(handleChange).toHaveBeenCalledWith(600000);

    rerender(<CurrencyInput value={600000} onChange={handleChange} />);
    expect(input.value).toBe("600,000");
  });

  it("displays error message when provided", () => {
    render(<CurrencyInput value={100000} onChange={() => {}} error="Số tiền vượt quá quy định" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Số tiền vượt quá quy định");
  });
});
