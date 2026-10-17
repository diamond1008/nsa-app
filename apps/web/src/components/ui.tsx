import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";

import { Icon } from "./icons";

type ButtonVariant = "primary" | "accent" | "ghost" | "danger" | "soft";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#0532e6] text-white hover:bg-[#1e45ee] active:bg-[#0426b3] shadow-xs border border-transparent disabled:bg-[#0532e6]/50",
  accent:
    "bg-[#001258] text-white hover:bg-[#0a2078] active:bg-[#000d40] shadow-xs border border-transparent disabled:bg-[#001258]/50",
  ghost:
    "border border-gborder/80 bg-white/70 text-slate-700 hover:bg-white hover:border-[#0532e6]/30 hover:text-[#0532e6] active:bg-slate-100 shadow-2xs disabled:bg-white/40",
  danger:
    "bg-error text-white hover:bg-red-700 active:bg-red-800 shadow-xs border border-transparent disabled:bg-error/50",
  soft: "bg-[#0532e6]/10 text-[#0532e6] hover:bg-[#0532e6]/15 active:bg-[#0532e6]/20 border border-transparent disabled:bg-gbg2/50",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex h-10 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold select-none cursor-pointer",
        "transition-colors duration-150 active:opacity-90",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <Spinner
          size="sm"
          invert={variant === "primary" || variant === "danger" || variant === "accent"}
        />
      )}
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  error?: string;
}
const fieldClass =
  "h-11 w-full rounded-xl border border-white/80 bg-white/70 backdrop-blur-md px-3.5 text-sm text-[#111c2c] shadow-2xs outline-none transition placeholder:text-gtext/60 focus:bg-white/95 focus:border-[#0532e6] focus:ring-2 focus:ring-[#0532e6]/15 disabled:cursor-not-allowed disabled:bg-gbg2/60 disabled:text-gtext";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? label;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-navy-heading">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={clsx(fieldClass, error ? "border-error" : "border-gborder", className)}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
});

function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
    return extractText(node.props.children);
  }
  return "";
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, className, children, value, onChange, disabled, ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? label;
  const listboxId = `${useId()}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownCoords, setDropdownCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width?: number;
    maxHeight?: number;
  }>({});

  const options: Array<{ value: string; label: string }> = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const val = String(child.props.value ?? "");
      const txt = extractText(child.props.children);
      options.push({ value: val, label: txt });
    }
  });

  const stringVal = String(value ?? "");
  const selectedOption = options.find((o) => o.value === stringVal) ?? options[0];
  const selectedIndex = options.findIndex((option) => option.value === selectedOption?.value);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    const isRightHalf = rect.left > viewportWidth / 2;
    const wouldOverflow = rect.left + Math.max(rect.width, 240) > viewportWidth - 16;
    const alignR = isRightHalf || wouldOverflow;

    const calculatedMaxHeight = openUp
      ? Math.min(280, Math.max(120, spaceAbove - 20))
      : Math.min(280, Math.max(120, spaceBelow - 20));

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
    if (!isOpen) return;
    updatePosition();

    const handleScroll = (event: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector<HTMLElement>(
        `[id="${listboxId}-${activeIndex}"]`,
      );
      if (typeof activeEl?.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, activeIndex, listboxId]);

  const toggleOpen = () => {
    setIsOpen((current) => {
      if (!current) {
        updatePosition();
        setActiveIndex(Math.max(selectedIndex, 0));
      }
      return !current;
    });
  };

  const handleSelect = (val: string) => {
    setIsOpen(false);
    if (onChange) {
      const event = {
        target: { value: val, name: rest.name ?? id },
        currentTarget: { value: val, name: rest.name ?? id },
      } as ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
  };

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-navy-heading">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        id={inputId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            updatePosition();
            setIsOpen(true);
            setActiveIndex((index) =>
              index < 0 ? Math.max(selectedIndex, 0) : Math.min(index + 1, options.length - 1),
            );
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            updatePosition();
            setIsOpen(true);
            setActiveIndex((index) =>
              index < 0 ? Math.max(selectedIndex, 0) : Math.max(index - 1, 0),
            );
          }
          if (event.key === "Escape") setIsOpen(false);
          if (event.key === "Enter" && isOpen && options[activeIndex]) {
            event.preventDefault();
            handleSelect(options[activeIndex].value);
          }
        }}
        className={clsx(
          fieldClass,
          "flex cursor-pointer select-none items-center justify-between pr-3.5 text-left font-medium transition-[border-color,box-shadow] motion-reduce:transition-none",
          isOpen
            ? "border-[#0532e6] ring-2 ring-[#0532e6]/20"
            : error
              ? "border-error"
              : "border-gborder",
          className,
        )}
      >
        <span
          className={clsx("truncate", !selectedOption?.value && "text-gtext")}
          title={selectedOption ? selectedOption.label : undefined}
        >
          {selectedOption ? selectedOption.label : "-- Chọn --"}
        </span>
        <Icon
          name="chevron-down"
          className={clsx(
            "h-4 w-4 shrink-0 text-gtext transition-transform duration-200 motion-reduce:transition-none",
            isOpen && "rotate-180 text-navy",
          )}
        />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : undefined,
              bottom:
                dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : undefined,
              left: dropdownCoords.left !== undefined ? `${dropdownCoords.left}px` : undefined,
              right: dropdownCoords.right !== undefined ? `${dropdownCoords.right}px` : undefined,
              minWidth: dropdownCoords.width ? `${dropdownCoords.width}px` : undefined,
              maxHeight: `${dropdownCoords.maxHeight ?? 260}px`,
              zIndex: 10005,
            }}
            className="max-w-[min(32rem,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-2xl border border-white/95 bg-white/95 backdrop-blur-3xl p-1.5 shadow-[0_20px_50px_rgba(7,20,38,0.2),0_0_0_1px_rgba(255,255,255,0.9)] animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === stringVal;
              return (
                <div
                  id={`${listboxId}-${idx}`}
                  key={`${opt.value}-${idx}`}
                  role="option"
                  title={opt.label}
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelect(opt.value)}
                  className={clsx(
                    "flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors motion-reduce:transition-none",
                    idx === activeIndex || isSelected
                      ? "bg-[#0532e6]/10 text-[#001258] font-bold"
                      : "hover:bg-slate-100/80 hover:text-[#001258] text-[#111c2c]/80",
                  )}
                >
                  <span className="whitespace-normal leading-snug" title={opt.label}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <Icon name="check" className="h-4 w-4 text-[#0532e6] shrink-0 ml-2 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}

      {/* Hidden native select for form refs or Accessibility compatibility */}
      <select
        ref={ref}
        id={inputId ? `${inputId}-hidden` : undefined}
        value={value}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
        hidden
        className="sr-only"
        {...rest}
      >
        {children}
      </select>

      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? label;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-navy-heading">
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={clsx(
          fieldClass,
          "min-h-24 resize-y py-3",
          error ? "border-error" : "border-white/80",
          className,
        )}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/85 bg-white/70 backdrop-blur-xl p-5 shadow-card md:p-6 transition-all duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({
  size = "md",
  invert = false,
}: {
  size?: "sm" | "md" | "lg";
  invert?: boolean;
}) {
  const px = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-6 w-6";
  return (
    <span
      role="status"
      aria-label="Đang tải"
      className={clsx(
        "inline-block animate-spin rounded-full border-2 border-t-transparent",
        invert ? "border-white" : "border-navy",
        px,
      )}
    />
  );
}

export function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gbg">
      <Spinner size="lg" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx("animate-pulse rounded-lg bg-slate-200/80", className)} />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-error/20 bg-error-bg px-4 py-3 text-sm text-error shadow-sm"
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-success/20 bg-success-bg px-4 py-3 text-sm font-medium text-success shadow-sm"
    >
      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/80 bg-white/50 backdrop-blur-lg px-6 py-12 text-center shadow-2xs">
      <div className="mb-2 flex items-center justify-center text-gtext/60">
        <Icon name="info" className="h-8 w-8" />
      </div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs leading-5 text-gtext">{hint}</p>}
    </div>
  );
}

type BadgeTone = "navy" | "gold" | "green" | "red" | "gray" | "blue";
const badgeStyles: Record<BadgeTone, string> = {
  navy: "bg-navy/10 text-navy border-navy/20",
  gold: "bg-gold/15 text-gold-dark border-gold/30",
  green: "bg-success-bg/85 text-success border-success/30",
  red: "bg-error-bg/85 text-error border-error/30",
  gray: "bg-white/70 text-gtext border-white/90",
  blue: "bg-royal/10 text-royal border-royal/20",
};
export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-2xs backdrop-blur-xs",
        badgeStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#0532e6]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-navy-dark md:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gtext">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs font-medium text-gtext">
          <span>{label}</span>
          <span>{safe.toFixed(0)}%</span>
        </div>
      )}
      <div
        className="h-2.5 overflow-hidden rounded-full bg-gbg2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#001258] to-[#0532e6] transition-[width] duration-500"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isMouseDownOnBackdrop = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKeyDown);
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const modalElement = (
    <div
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-xl backdrop-saturate-150 sm:items-center sm:p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        isMouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (e.target !== e.currentTarget) {
          isMouseDownOnBackdrop.current = false;
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isMouseDownOnBackdrop.current) {
          onCloseRef.current();
        }
        isMouseDownOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
        className={clsx(
          "max-h-[90dvh] w-full max-w-xl overscroll-contain rounded-t-3xl sm:rounded-3xl border border-white/95 bg-white/90 backdrop-blur-3xl shadow-[0_32px_80px_rgba(7,20,38,0.22),0_0_0_1px_rgba(255,255,255,0.8),inset_0_1px_2px_rgba(255,255,255,1)] flex flex-col animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/70 bg-white/50 px-5 py-4 sm:px-6 rounded-t-3xl">
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0532e6]">
              NSA App
            </p>
            <h2 id={titleId} className="truncate text-lg font-bold text-navy">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-xl text-gtext transition-colors duration-150 hover:bg-gbg2 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0532e6]"
            aria-label="Đóng"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalElement, document.body) : modalElement;
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  className,
  width = "max-w-2xl",
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: string;
}) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isMouseDownOnBackdrop = useRef(false);

  const [rendered, setRendered] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setIsClosing(false);
    } else if (rendered) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setRendered(false);
        setIsClosing(false);
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKeyDown);
    const focusable = drawerRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!rendered) return null;

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = [
      ...drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const drawerElement = (
    <div
      className={clsx(
        "fixed inset-0 z-[9990] flex justify-end bg-[#000e47]/40 backdrop-blur-md",
        isClosing ? "animate-backdrop-navy-out pointer-events-none" : "animate-backdrop-navy",
      )}
      onMouseDown={(e) => {
        isMouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (e.target !== e.currentTarget) {
          isMouseDownOnBackdrop.current = false;
        }
      }}
      onClick={(e) => {
        if (!isClosing && e.target === e.currentTarget && isMouseDownOnBackdrop.current) {
          onCloseRef.current();
        }
        isMouseDownOnBackdrop.current = false;
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onKeyDown={trapFocus}
        className={clsx(
          "relative h-full w-full flex flex-col border-l border-white/90 bg-white/95 backdrop-blur-3xl shadow-[-28px_0_90px_rgba(0,18,88,0.22),_-1px_0_1px_rgba(255,255,255,0.95)] motion-reduce:animate-none overflow-hidden",
          isClosing ? "animate-drawer-right-out" : "animate-drawer-right",
          width,
          className,
        )}
      >
        {/* Subtle Liquid Glass ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -left-28 h-96 w-96 rounded-full bg-gradient-to-br from-[#0532e6]/10 via-[#0532e6]/5 to-transparent blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -right-28 h-96 w-96 rounded-full bg-gradient-to-tl from-[#C4A35A]/12 via-[#C4A35A]/5 to-transparent blur-3xl"
        />

        {title && (
          <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/70 bg-white/70 backdrop-blur-md px-6 py-4 shadow-2xs">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0532e6]">
                NSA App
              </p>
              <h2 id={titleId} className="truncate text-lg font-bold text-navy">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-xl text-gtext transition-colors duration-150 hover:bg-gbg2 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0532e6]"
              aria-label="Đóng"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="relative z-10 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(drawerElement, document.body)
    : drawerElement;
}
