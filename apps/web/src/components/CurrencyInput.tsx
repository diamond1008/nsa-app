import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import clsx from "clsx";

export interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  hideLabel?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  suffix?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

export function formatNumberWithCommas(val: number | string): string {
  if (val === "" || val == null) return "";
  const num = typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("en-US").format(num);
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    {
      value,
      onChange,
      label,
      hideLabel = false,
      placeholder = "0",
      error,
      disabled = false,
      required = false,
      className,
      inputClassName,
      suffix = "VNĐ",
      id,
      name,
      autoFocus,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current!);
    const generatedId = useId();
    const inputId = id ?? name ?? generatedId;

    // Display string formatted with commas
    const [displayVal, setDisplayVal] = useState<string>(
      value > 0 ? formatNumberWithCommas(value) : "",
    );
    const lastEmittedRef = useRef<number>(value);

    // Sync when external value changes (e.g. clicking "Thu full" or "Theo đợt")
    useEffect(() => {
      if (value !== lastEmittedRef.current) {
        lastEmittedRef.current = value;
        setDisplayVal(value > 0 ? formatNumberWithCommas(value) : "");
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cursorPosition = e.target.selectionStart || 0;

      // Count digits before cursor in raw input to preserve cursor position
      const digitsBeforeCursor = raw.slice(0, cursorPosition).replace(/\D/g, "").length;

      // Extract only digits
      const digits = raw.replace(/\D/g, "");
      const num = digits ? parseInt(digits, 10) : 0;

      const formatted = digits ? formatNumberWithCommas(num) : "";
      setDisplayVal(formatted);
      lastEmittedRef.current = num;
      onChange(num);

      // Restore cursor position smoothly
      requestAnimationFrame(() => {
        if (!inputRef.current) return;
        let newCursorPos = 0;
        let counted = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            counted++;
          }
          if (counted === digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
          }
        }
        if (counted < digitsBeforeCursor) {
          newCursorPos = formatted.length;
        }
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      });
    };

    return (
      <div className={clsx(!hideLabel && label && "space-y-1.5", className)}>
        {label && !hideLabel && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-slate-800 whitespace-nowrap"
          >
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            value={displayVal}
            onChange={handleChange}
            className={clsx(
              "w-full h-10 rounded-xl border bg-white px-3 pr-12 text-sm font-bold shadow-2xs transition-all focus:outline-none",
              error
                ? "border-red-500 bg-red-50/30 text-red-700 focus:border-red-600 ring-1 ring-red-400"
                : "border-slate-200 text-slate-900 focus:border-[#0532e6] focus:ring-1 focus:ring-[#0532e6]",
              disabled && "cursor-not-allowed bg-slate-100 text-slate-400",
              inputClassName,
            )}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400 select-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {error}
          </p>
        )}
      </div>
    );
  },
);
