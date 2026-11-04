import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { Icon } from "./icons";

export interface SearchComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export function SearchCombobox({
  label,
  value,
  onChange,
  onSearch,
  options,
  loading = false,
  placeholder = "Nhập để tìm…",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  options: SearchComboboxOption[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownCoords, setDropdownCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width?: number;
    maxHeight?: number;
  }>({});

  const updatePosition = useCallback(() => {
    if (!inputRef.current || typeof window === "undefined") return;
    const rect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;

    const isRightHalf = rect.left > viewportWidth / 2;
    const wouldOverflow = rect.left + Math.max(rect.width, 240) > viewportWidth - 16;
    const alignR = isRightHalf || wouldOverflow;

    const calculatedMaxHeight = openUp
      ? Math.min(260, Math.max(120, spaceAbove - 20))
      : Math.min(260, Math.max(120, spaceBelow - 20));

    if (openUp) {
      setDropdownCoords({
        bottom: viewportHeight - rect.top + 6,
        left: alignR ? undefined : Math.max(12, rect.left),
        right: alignR ? Math.max(12, viewportWidth - rect.right) : undefined,
        width: rect.width || undefined,
        maxHeight: calculatedMaxHeight,
      });
    } else {
      setDropdownCoords({
        top: rect.bottom + 6,
        left: alignR ? undefined : Math.max(12, rect.left),
        right: alignR ? Math.max(12, viewportWidth - rect.right) : undefined,
        width: rect.width || undefined,
        maxHeight: calculatedMaxHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (selectedLabel) setQuery(selectedLabel);
    if (!value) setQuery("");
  }, [selectedLabel, value]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScroll = (event: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
        return;
      }
      updatePosition();
    };

    const handleOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handleOutside);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open && activeIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector<HTMLElement>(
        `[id="${listId}-${activeIndex}"]`,
      );
      if (typeof activeEl?.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [open, activeIndex, listId]);

  const choose = (option: SearchComboboxOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative min-w-0 space-y-2">
      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-navy-heading whitespace-nowrap"
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            updatePosition();
            setOpen(true);
            setActiveIndex(-1);
          }}
          onChange={(event) => {
            updatePosition();
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            onSearch?.(event.target.value);
            if (value) onChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              updatePosition();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, options.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              updatePosition();
              setOpen(true);
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && open && options[activeIndex]) {
              event.preventDefault();
              choose(options[activeIndex]);
            }
          }}
          className="h-11 w-full rounded-xl border border-white/80 bg-white/70 backdrop-blur-md px-3.5 pr-10 text-sm text-[#111c2c] shadow-2xs outline-none transition-[border-color,box-shadow,background-color] placeholder:text-gtext/60 focus:bg-white/95 focus:border-[#0532e6] focus:ring-2 focus:ring-[#0532e6]/15 disabled:cursor-not-allowed disabled:bg-gbg2/60"
        />
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gtext"
        />
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : undefined,
              bottom:
                dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : undefined,
              left: dropdownCoords.left !== undefined ? `${dropdownCoords.left}px` : undefined,
              right: dropdownCoords.right !== undefined ? `${dropdownCoords.right}px` : undefined,
              width: dropdownCoords.width ? `${dropdownCoords.width}px` : undefined,
              minWidth: dropdownCoords.width ? `${dropdownCoords.width}px` : undefined,
              maxHeight: `${dropdownCoords.maxHeight ?? 240}px`,
              zIndex: 10005,
            }}
            className="overflow-y-auto overscroll-contain rounded-2xl border border-white/95 bg-white/95 backdrop-blur-3xl p-1.5 shadow-[0_20px_50px_rgba(7,20,38,0.2),0_0_0_1px_rgba(255,255,255,0.9)] animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
          >
            {loading ? (
              <p role="status" className="px-3 py-3 text-sm text-gtext">
                Đang tải lựa chọn
              </p>
            ) : options.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gtext">Không tìm thấy lựa chọn phù hợp</p>
            ) : (
              options.map((option, index) => (
                <div
                  id={`${listId}-${index}`}
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={clsx(
                    "flex w-full items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors cursor-pointer",
                    index === activeIndex
                      ? "bg-[#0532e6]/10 text-[#001258] font-bold"
                      : "text-[#111c2c]/80 hover:bg-white/80 hover:text-[#111c2c]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs text-gtext">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {option.value === value ? (
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#0532e6]" />
                  ) : null}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
