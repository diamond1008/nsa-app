import { forwardRef, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon } from "./icons";
import { Button, Input } from "./ui";

export interface ActiveFilter {
  key: string;
  label: string;
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export interface FilterBarProps {
  search: string;
  onSearch: (value: string) => void;
  resultCount?: number;
  resultCountLabel?: string;
  activeFilters?: ActiveFilter[];
  onRemoveFilter?: (key: string) => void;
  onClearAll?: () => void;
  children?: ReactNode;
  advancedFilters?: ReactNode;
  advancedFilterCount?: number;
  searchPlaceholder?: string;
  className?: string;
  sticky?: boolean;
  compact?: boolean;
}

export const FilterBar = forwardRef<HTMLElement, FilterBarProps>(function FilterBar(
  {
    search,
    onSearch,
    resultCount,
    activeFilters = [],
    onRemoveFilter,
    onClearAll,
    children,
    advancedFilters,
    advancedFilterCount = 0,
    searchPlaceholder = "Nhập mã, tên hoặc email…",
    className,
    sticky = true,
    compact = false,
  },
  ref,
) {
  const internalRef = useRef<HTMLElement | null>(null);
  const advancedId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);

  useEffect(() => {
    if (advancedFilterCount > 0) setAdvancedOpen(true);
  }, [advancedFilterCount]);

  useEffect(() => {
    if (!sticky) return;
    const el = internalRef.current;
    if (!el) return;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) {
        document.documentElement.style.setProperty(
          "--nsa-sticky-header-offset",
          `${Math.round(rect.height)}px`,
        );
      }
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);

    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--nsa-sticky-header-offset", "0px");
    };
  }, [sticky]);

  const hasFilters = Boolean(search.trim()) || activeFilters.length > 0;
  return (
    <section
      ref={(node) => {
        internalRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      }}
      className={clsx(
        "rounded-2xl border border-white/85 bg-white/70 backdrop-blur-xl shadow-card transition-all",
        compact ? "p-3 mb-3" : "p-4 mb-5",
        sticky &&
          "sticky top-0 z-20 border-white/95 bg-white/95 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]",
        className,
      )}
    >
      <div
        className={clsx(
          "gap-2.5 sm:gap-3",
          compact
            ? "flex flex-wrap sm:flex-nowrap items-center justify-between"
            : "flex flex-wrap items-end",
        )}
      >
        <div
          className={clsx(
            compact ? "w-full min-w-0 sm:flex-1" : "flex-1 min-w-[220px] sm:min-w-[260px]",
          )}
        >
          <Input
            label="Tìm kiếm"
            hideLabel={compact}
            name="directory-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className={compact ? "h-10 text-sm" : undefined}
          />
        </div>
        {children}
        <div
          className={clsx(
            "flex items-center gap-2",
            compact && "w-full sm:w-auto justify-between sm:justify-end shrink-0",
          )}
        >
          {compact && typeof resultCount === "number" ? (
            <span className="shrink-0 inline-flex items-center text-xs sm:text-[13px] text-slate-500 font-medium whitespace-nowrap px-1">
              {new Intl.NumberFormat("vi-VN").format(resultCount)} kết quả
            </span>
          ) : null}
          <div className="flex items-center gap-2 shrink-0">
            {compact && onClearAll ? (
              <div className="relative group/clear shrink-0">
                <button
                  type="button"
                  onClick={onClearAll}
                  title="Xóa bộ lọc"
                  aria-label="Xóa tất cả bộ lọc"
                  className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-rose-200/80 bg-rose-50/70 text-rose-600 shadow-2xs backdrop-blur-sm transition-all hover:bg-rose-100 hover:border-rose-300 hover:text-rose-700 active:scale-95"
                >
                  <Icon name="rotate-ccw" className="h-4 w-4" />
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/clear:flex flex-col items-center z-30">
                  <div className="whitespace-nowrap rounded-lg bg-slate-900/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-xs">
                    Xóa bộ lọc
                  </div>
                  <div className="h-1.5 w-1.5 -mt-0.5 rotate-45 bg-slate-900/95" />
                </div>
              </div>
            ) : null}

            {advancedFilters ? (
              <Button
                type="button"
                variant={advancedOpen ? "soft" : "ghost"}
                className={clsx(
                  "shrink-0",
                  compact ? "h-9 sm:h-10 text-xs px-2.5 sm:px-3.5" : "h-11",
                )}
                aria-expanded={advancedOpen}
                aria-controls={advancedId}
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                <Icon name="filter" className="h-4 w-4" />
                <span>
                  Bộ lọc nâng cao{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
                </span>
                <Icon
                  name="chevron-down"
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {advancedFilters && advancedOpen ? (
        <div id={advancedId} className="mt-3 border-t border-slate-200/80 pt-3">
          <div className="flex flex-wrap items-end gap-3">{advancedFilters}</div>
          {compact && onClearAll && (
            <div className="mt-3 flex justify-end border-t border-slate-100/80 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 text-xs text-gtext hover:text-navy"
                onClick={onClearAll}
              >
                Xóa tất cả bộ lọc
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {!compact && (
        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2 border-t border-white/70 pt-3">
          {typeof resultCount === "number" ? (
            <span className="mr-1 text-xs font-medium text-slate-500">
              {new Intl.NumberFormat("vi-VN").format(resultCount)} kết quả
            </span>
          ) : null}
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-label={`Bỏ lọc ${filter.label}`}
              onClick={() => onRemoveFilter?.(filter.key)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#0532e6]/25 bg-[#0532e6]/10 px-3 text-xs font-semibold text-[#001258] transition-colors hover:bg-[#0532e6]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0532e6]"
            >
              {filter.label}
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          ))}
          {hasFilters && onClearAll ? (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto h-8 px-3 text-xs"
              aria-label="Xóa tất cả bộ lọc"
              onClick={onClearAll}
            >
              Xóa tất cả
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
});
