import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Icon } from "../../components/icons";
import type { Lead, Order } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { formatVND } from "./saleShared";
import { INSTALLMENT_PLANS, parseOrderInstallmentPlan } from "./installmentUtils";

// --- Hook for fixed dropdown positioning (safe inside scrollable modals) ---
function useDropdownPosition(
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  isOpen: boolean,
) {
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width?: number;
    maxHeight?: number;
  }>({});

  const updatePosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const isRightHalf = rect.left > viewportWidth / 2;
    const wouldOverflow = rect.left + Math.max(rect.width, 360) > viewportWidth - 16;
    const alignR = isRightHalf || wouldOverflow;

    const calculatedMaxHeight = openUp
      ? Math.min(340, Math.max(160, spaceAbove - 24))
      : Math.min(340, Math.max(160, spaceBelow - 24));

    if (openUp) {
      setCoords({
        bottom: viewportHeight - rect.top + 6,
        left: alignR ? undefined : Math.max(12, rect.left),
        right: alignR ? Math.max(12, viewportWidth - rect.right) : undefined,
        width: rect.width || undefined,
        maxHeight: calculatedMaxHeight,
      });
    } else {
      setCoords({
        top: rect.bottom + 6,
        left: alignR ? undefined : Math.max(12, rect.left),
        right: alignR ? Math.max(12, viewportWidth - rect.right) : undefined,
        width: rect.width || undefined,
        maxHeight: calculatedMaxHeight,
      });
    }
  }, [buttonRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScroll = () => updatePosition();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  return { coords, updatePosition };
}

// ============================================================================
// 1. CLASS SELECTOR DROPDOWN
// ============================================================================
export interface ClassItem {
  id: string;
  class_code: string;
  name: string;
  start_date?: string;
  enrolled_students: number;
  maximum_students: number;
}

interface ClassSelectorDropdownProps {
  value: string;
  onChange: (id: string) => void;
  classes: ClassItem[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export function ClassSelectorDropdown({
  value,
  onChange,
  classes,
  disabled = false,
  required = false,
  placeholder = "-- Chọn lớp học đang mở tuyển sinh --",
}: ClassSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const { coords, updatePosition } = useDropdownPosition(buttonRef, isOpen);

  const selectedClass = classes.find((c) => c.id === value);

  const filteredClasses = classes.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      c.class_code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      (c.start_date && c.start_date.includes(term))
    );
  });

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }
    updatePosition();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={clsx(
          "w-full text-left rounded-xl border bg-white px-3.5 py-2.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0532e6]/20",
          isOpen
            ? "border-[#0532e6] ring-2 ring-[#0532e6]/20 shadow-sm"
            : "border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50",
          disabled && "opacity-60 cursor-not-allowed bg-slate-100",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {selectedClass ? (
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-[#0532e6] font-mono text-xs font-bold border border-blue-200/60">
                  {selectedClass.class_code}
                </span>
                {selectedClass.start_date && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-medium">
                    <Icon name="calendar" className="h-3 w-3 text-emerald-600" />
                    Khai giảng: {formatDate(selectedClass.start_date)}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Sĩ số: {selectedClass.enrolled_students}/{selectedClass.maximum_students}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 truncate">
                {selectedClass.name}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Icon name="book" className="h-4 w-4 text-slate-400 shrink-0" />
              <span>{placeholder}</span>
            </div>
          )}

          <div className="shrink-0 flex items-center text-slate-400 pl-2 border-l border-slate-100">
            <Icon
              name="chevron-down"
              className={clsx(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180 text-[#0532e6]",
              )}
            />
          </div>
        </div>
      </button>

      {/* Hidden input for HTML5 validity */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Dropdown Popover */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: coords.left !== undefined ? `${coords.left}px` : undefined,
              right: coords.right !== undefined ? `${coords.right}px` : undefined,
              width: coords.width ? `${coords.width}px` : undefined,
              minWidth: "340px",
              maxHeight: coords.maxHeight ? `${coords.maxHeight}px` : "320px",
              zIndex: 10005,
            }}
            className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
          >
            {/* Search Header */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Tìm theo mã lớp, tên khóa học..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]/20"
                />
              </div>
            </div>

            {/* Class Items List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 overscroll-contain">
              {filteredClasses.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Không tìm thấy lớp học nào phù hợp.
                </div>
              ) : (
                filteredClasses.map((c) => {
                  const isSelected = c.id === value;
                  const remaining = Math.max(0, c.maximum_students - c.enrolled_students);
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={clsx(
                        "group relative flex flex-col gap-1 p-2.5 rounded-xl border cursor-pointer transition-all duration-150",
                        isSelected
                          ? "bg-blue-50/80 border-[#0532e6]/40 shadow-2xs"
                          : "border-transparent hover:border-blue-100 hover:bg-slate-50/90",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded-md font-mono text-xs font-bold tracking-tight",
                              isSelected
                                ? "bg-[#0532e6] text-white"
                                : "bg-blue-100/70 text-blue-800 group-hover:bg-blue-200/80",
                            )}
                          >
                            {c.class_code}
                          </span>
                          {c.start_date && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10.5px] font-medium">
                              <Icon name="calendar" className="h-3 w-3 text-emerald-600" />
                              {formatDate(c.start_date)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Còn {remaining}/{c.maximum_students} chỗ
                          </span>
                          {isSelected && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0532e6] text-white shrink-0 shadow-2xs">
                              <Icon name="check" className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={clsx(
                          "text-xs leading-snug font-medium",
                          isSelected
                            ? "font-bold text-[#0532e6]"
                            : "text-slate-800 group-hover:text-blue-900",
                        )}
                      >
                        {c.name}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// 2. STUDENT SELECTOR DROPDOWN (Leads đã chốt)
// ============================================================================
interface StudentSelectorDropdownProps {
  value: string;
  onChange: (id: string) => void;
  leads: Lead[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export function StudentSelectorDropdown({
  value,
  onChange,
  leads,
  disabled = false,
  required = false,
  placeholder = "-- Chọn học viên (Lead đã chốt) --",
}: StudentSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const { coords, updatePosition } = useDropdownPosition(buttonRef, isOpen);

  const selectedLead = leads.find((l) => l.id === value);

  const filteredLeads = leads.filter((l) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (l.full_name && l.full_name.toLowerCase().includes(term)) ||
      (l.phone && l.phone.toLowerCase().includes(term)) ||
      (l.email && l.email.toLowerCase().includes(term)) ||
      (l.converted_student_code && l.converted_student_code.toLowerCase().includes(term))
    );
  });

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }
    updatePosition();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={clsx(
          "w-full text-left rounded-xl border bg-white px-3.5 py-2.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0532e6]/20",
          isOpen
            ? "border-[#0532e6] ring-2 ring-[#0532e6]/20 shadow-sm"
            : "border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50",
          disabled && "opacity-60 cursor-not-allowed bg-slate-100",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {selectedLead ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                {selectedLead.full_name?.slice(0, 1).toUpperCase() || "H"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {selectedLead.full_name}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  {selectedLead.phone ? (
                    <span className="flex items-center gap-1">
                      <Icon name="phone" className="h-3 w-3 text-slate-400" />
                      {selectedLead.phone}
                    </span>
                  ) : (
                    <span className="italic text-slate-400">Không có SĐT</span>
                  )}
                  {selectedLead.converted_student_code && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                      {selectedLead.converted_student_code}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Icon name="user" className="h-4 w-4 text-slate-400 shrink-0" />
              <span>{placeholder}</span>
            </div>
          )}

          <div className="shrink-0 flex items-center text-slate-400 pl-2 border-l border-slate-100">
            <Icon
              name="chevron-down"
              className={clsx(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180 text-[#0532e6]",
              )}
            />
          </div>
        </div>
      </button>

      {/* Hidden input for HTML5 validity */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Dropdown Popover */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: coords.left !== undefined ? `${coords.left}px` : undefined,
              right: coords.right !== undefined ? `${coords.right}px` : undefined,
              width: coords.width ? `${coords.width}px` : undefined,
              minWidth: "340px",
              maxHeight: coords.maxHeight ? `${coords.maxHeight}px` : "320px",
              zIndex: 10005,
            }}
            className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
          >
            {/* Search Header */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Tìm theo tên học viên, số điện thoại..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]/20"
                />
              </div>
            </div>

            {/* Leads List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 overscroll-contain">
              {filteredLeads.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Không tìm thấy học viên nào phù hợp.
                </div>
              ) : (
                filteredLeads.map((l) => {
                  const isSelected = l.id === value;
                  return (
                    <div
                      key={l.id}
                      onClick={() => {
                        onChange(l.id);
                        setIsOpen(false);
                      }}
                      className={clsx(
                        "group flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all duration-150",
                        isSelected
                          ? "bg-blue-50/80 border-[#0532e6]/40 shadow-2xs"
                          : "border-transparent hover:border-blue-100 hover:bg-slate-50/90",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-full text-white font-bold text-[11px] flex items-center justify-center shrink-0 shadow-2xs",
                            isSelected
                              ? "bg-[#0532e6]"
                              : "bg-gradient-to-tr from-slate-600 to-slate-800 group-hover:from-blue-600 group-hover:to-indigo-600",
                          )}
                        >
                          {l.full_name?.slice(0, 1).toUpperCase() || "H"}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={clsx(
                              "text-xs truncate",
                              isSelected
                                ? "font-bold text-[#0532e6]"
                                : "font-semibold text-slate-800 group-hover:text-blue-900",
                            )}
                          >
                            {l.full_name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                            {l.phone ? (
                              <span className="flex items-center gap-1">
                                <Icon name="phone" className="h-3 w-3 text-slate-400" />
                                {l.phone}
                              </span>
                            ) : (
                              <span className="italic text-slate-400">Không có SĐT</span>
                            )}
                            {l.interested_course_name && (
                              <span className="text-slate-400 text-[10.5px] truncate max-w-44">
                                · {l.interested_course_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0532e6] text-white shrink-0 shadow-2xs ml-2">
                          <Icon name="check" className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// 3. INSTALLMENT PLAN PICKER (Interactive segment / pill cards)
// ============================================================================
interface InstallmentPlanPickerProps {
  value: number;
  onChange: (plan: number) => void;
}

export function InstallmentPlanPicker({ value, onChange }: InstallmentPlanPickerProps) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Object.values(INSTALLMENT_PLANS).map((p) => {
          const isSelected = value === p.installments;
          const ratioText =
            p.installments === 1
              ? "100%"
              : p.installments === 2
                ? "50% - 50%"
                : p.label.replace(`Đóng ${p.installments} lần: `, "");

          return (
            <button
              key={p.installments}
              type="button"
              onClick={() => onChange(p.installments)}
              className={clsx(
                "relative flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all duration-150 cursor-pointer shadow-2xs",
                isSelected
                  ? "border-[#0532e6] bg-[#0532e6]/10 text-[#0532e6] ring-1 ring-[#0532e6] shadow-sm font-bold"
                  : "border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/70",
              )}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">{p.installments} đợt</span>
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0532e6] inline-block" />
                )}
              </div>
              <span
                className={clsx(
                  "text-[10px] mt-0.5 line-clamp-1",
                  isSelected ? "text-[#0532e6]/90 font-medium" : "text-slate-400",
                )}
              >
                {ratioText}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. ORDER SELECTOR DROPDOWN (Dành cho Phiếu Thu - Chọn Phiếu Đăng Ký)
// ============================================================================
interface OrderSelectorDropdownProps {
  value: string;
  onChange: (id: string) => void;
  orders: Order[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export function OrderSelectorDropdown({
  value,
  onChange,
  orders,
  disabled = false,
  required = false,
  placeholder = "-- Chọn phiếu đăng ký học viên --",
}: OrderSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const { coords, updatePosition } = useDropdownPosition(buttonRef, isOpen);

  const selectedOrder = orders.find((o) => o.id === value);
  const selectedMeta = selectedOrder ? parseOrderInstallmentPlan(selectedOrder) : null;

  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (o.order_code && o.order_code.toLowerCase().includes(term)) ||
      (o.student_name && o.student_name.toLowerCase().includes(term)) ||
      (o.lead_name && o.lead_name.toLowerCase().includes(term)) ||
      (o.class_code && o.class_code.toLowerCase().includes(term)) ||
      (o.course_name && o.course_name.toLowerCase().includes(term))
    );
  });

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }
    updatePosition();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={clsx(
          "w-full text-left rounded-xl border bg-white px-3.5 py-2.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0532e6]/20",
          isOpen
            ? "border-[#0532e6] ring-2 ring-[#0532e6]/20 shadow-sm"
            : "border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50",
          disabled && "opacity-60 cursor-not-allowed bg-slate-100",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {selectedOrder ? (
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-[#0532e6] font-mono text-xs font-bold border border-blue-200/60">
                  {selectedOrder.order_code}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {selectedOrder.student_name || selectedOrder.lead_name}
                </span>
                {selectedOrder.class_code && (
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-mono">
                    Lớp: {selectedOrder.class_code}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Tổng: <b className="text-slate-800">{formatVND(selectedOrder.final_amount)}</b>
                </span>
                {selectedMeta && selectedMeta.total_installments > 1 && (
                  <span className="text-[#0532e6] font-medium">
                    · Tiến độ: {selectedMeta.installments.filter((i) => i.status === "paid").length}
                    /{selectedMeta.total_installments} đợt
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Icon name="shopping-bag" className="h-4 w-4 text-slate-400 shrink-0" />
              <span>{placeholder}</span>
            </div>
          )}

          <div className="shrink-0 flex items-center text-slate-400 pl-2 border-l border-slate-100">
            <Icon
              name="chevron-down"
              className={clsx(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180 text-[#0532e6]",
              )}
            />
          </div>
        </div>
      </button>

      {/* Hidden input for HTML5 validity */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Dropdown Popover */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: coords.left !== undefined ? `${coords.left}px` : undefined,
              right: coords.right !== undefined ? `${coords.right}px` : undefined,
              width: coords.width ? `${coords.width}px` : undefined,
              minWidth: "360px",
              maxHeight: coords.maxHeight ? `${coords.maxHeight}px` : "340px",
              zIndex: 10005,
            }}
            className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
          >
            {/* Search Header */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Tìm theo mã phiếu, tên học viên, lớp..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]/20"
                />
              </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 overscroll-contain">
              {filteredOrders.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Không tìm thấy phiếu đăng ký nào phù hợp.
                </div>
              ) : (
                filteredOrders.map((ord) => {
                  const isSelected = ord.id === value;
                  const meta = parseOrderInstallmentPlan(ord);
                  const paidCount = meta.installments.filter((i) => i.status === "paid").length;
                  const unpaid = meta.installments.filter((i) => i.status !== "paid");
                  const remaining = unpaid.reduce((sum, i) => sum + i.amount, 0);

                  return (
                    <div
                      key={ord.id}
                      onClick={() => {
                        onChange(ord.id);
                        setIsOpen(false);
                      }}
                      className={clsx(
                        "group relative flex flex-col gap-1 p-2.5 rounded-xl border cursor-pointer transition-all duration-150",
                        isSelected
                          ? "bg-blue-50/80 border-[#0532e6]/40 shadow-2xs"
                          : "border-transparent hover:border-blue-100 hover:bg-slate-50/90",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded-md font-mono text-xs font-bold tracking-tight",
                              isSelected
                                ? "bg-[#0532e6] text-white"
                                : "bg-blue-100/70 text-blue-800 group-hover:bg-blue-200/80",
                            )}
                          >
                            {ord.order_code}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {ord.student_name || ord.lead_name}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0532e6] text-white shrink-0 shadow-2xs">
                            <Icon name="check" className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5">
                        <span className="truncate">
                          {ord.class_code ? `Lớp: ${ord.class_code}` : ord.course_name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {meta.total_installments > 1 ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                              Đã thu {paidCount}/{meta.total_installments} đợt
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">
                              Chưa thu tiền
                            </span>
                          )}
                          <span className="font-semibold text-slate-700">
                            Còn {formatVND(remaining)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
