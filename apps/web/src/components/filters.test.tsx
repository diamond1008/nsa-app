import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterBar, useDebouncedValue } from "./filters";

function DebounceProbe({ value, onValue }: { value: string; onValue: (value: string) => void }) {
  const debounced = useDebouncedValue(value, 300);
  onValue(debounced);
  return <span>{debounced}</span>;
}

describe("operations filters", () => {
  it("debounces server-facing search values for 300 milliseconds", () => {
    vi.useFakeTimers();
    const onValue = vi.fn();
    const view = render(<DebounceProbe value="n" onValue={onValue} />);

    view.rerender(<DebounceProbe value="nguyen" onValue={onValue} />);
    expect(screen.queryByText("nguyen")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByText("nguyen")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("nguyen")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows result count and exposes removable active filters", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterBar
        search="an"
        onSearch={() => undefined}
        resultCount={23}
        activeFilters={[
          { key: "status", label: "Trạng thái: Hoạt động" },
          { key: "course", label: "Khóa: KT cơ bản" },
        ]}
        onRemoveFilter={onRemove}
        onClearAll={onClear}
      />,
    );

    expect(screen.getByText("23 kết quả")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc Trạng thái: Hoạt động" }));
    expect(onRemove).toHaveBeenCalledWith("status");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tất cả bộ lọc" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("keeps advanced filters collapsed until requested and shows their active count", () => {
    const view = render(
      <FilterBar
        search=""
        onSearch={() => undefined}
        advancedFilters={<label htmlFor="teacher-filter">Giảng viên nâng cao</label>}
      />,
    );

    expect(screen.queryByText("Giảng viên nâng cao")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc nâng cao" }));
    expect(screen.getByText("Giảng viên nâng cao")).toBeInTheDocument();

    view.rerender(
      <FilterBar
        search=""
        onSearch={() => undefined}
        advancedFilterCount={2}
        advancedFilters={<label htmlFor="teacher-filter">Giảng viên nâng cao</label>}
      />,
    );
    expect(screen.getByRole("button", { name: "Bộ lọc nâng cao (2)" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("renders total count badge next to advanced filter in compact mode", () => {
    render(
      <FilterBar
        compact
        search=""
        onSearch={() => undefined}
        resultCount={42}
        resultCountLabel="lead"
        advancedFilters={<div>Lọc thêm</div>}
      />,
    );

    expect(screen.getByText("Tổng số lead:")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders clear icon button to the left of advanced filter in compact mode when onClearAll is present", () => {
    const onClear = vi.fn();
    render(
      <FilterBar
        compact
        search="lead moi"
        onSearch={() => undefined}
        onClearAll={onClear}
        advancedFilters={<div>Lọc thêm</div>}
      />,
    );

    const clearBtn = screen.getByRole("button", { name: "Xóa tất cả bộ lọc" });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveAttribute("title", "Xóa bộ lọc");
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
