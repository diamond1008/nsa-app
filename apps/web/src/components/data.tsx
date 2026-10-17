import type { ReactNode } from "react";
import clsx from "clsx";

import { ApiRequestError } from "../lib/apiClient";
import type { AttendanceRosterItem, SessionAttendance } from "../lib/domainTypes";
import { statusLabel } from "../lib/format";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { Badge, Button, Card, EmptyState, ErrorBanner, Skeleton } from "./ui";

export function QueryState({
  loading,
  error,
  empty,
  emptyTitle = "Chưa có dữ liệu",
  children,
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  emptyTitle?: string;
  children: ReactNode;
}) {
  if (loading) return <LoadingPanel />;
  if (error)
    return (
      <ErrorBanner
        message={
          error instanceof ApiRequestError
            ? error.message
            : "Không tải được dữ liệu. Vui lòng thử lại."
        }
      />
    );
  if (empty)
    return <EmptyState title={emptyTitle} hint="Thử thay đổi bộ lọc hoặc tạo dữ liệu mới." />;
  return <>{children}</>;
}

export function LoadingPanel() {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
    </Card>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = [
    "active",
    "present",
    "completed",
    "eligible",
    "excellent",
    "good",
    "competent",
  ].includes(value)
    ? "green"
    : ["absent", "cancelled", "suspended", "needs_improvement"].includes(value)
      ? "red"
      : ["scheduled", "in_progress", "open", "late", "submitted"].includes(value)
        ? "gold"
        : "gray";
  return <Badge tone={tone}>{statusLabel(value)}</Badge>;
}

export interface Column<T> {
  header: string;
  cell: (item: T, rowIndex: number) => ReactNode;
  className?: string;
  sortKey?: string;
}
export function DataTable<T extends { id: string }>({
  items,
  columns,
  sort,
  onSort,
}: {
  items: T[];
  columns: Column<T>[];
  sort?: { key: string; order: "asc" | "desc" };
  onSort?: (key: string, order: "asc" | "desc") => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-white/70 md:hidden">
        {items.map((item, rowIndex) => (
          <div key={item.id} className="space-y-3 p-4">
            {columns.map((column) => (
              <div
                key={column.header || "action"}
                className={clsx(
                  "flex items-start justify-between gap-4",
                  !column.header && "justify-end",
                )}
              >
                {column.header && (
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-gtext">
                    {column.header}
                  </span>
                )}
                <div className="min-w-0 text-right text-sm text-navy">
                  {column.cell(item, rowIndex)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white/75 text-[11px] uppercase tracking-[0.08em] text-gtext backdrop-blur-md">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  aria-sort={
                    column.sortKey && sort?.key === column.sortKey
                      ? sort.order === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={clsx(
                    "border-b border-white/70 px-5 py-3.5 font-bold",
                    column.className,
                  )}
                >
                  {column.sortKey && onSort ? (
                    <button
                      type="button"
                      aria-label={`Sắp xếp theo ${column.header}`}
                      onClick={() =>
                        onSort(
                          column.sortKey!,
                          sort?.key === column.sortKey && sort?.order === "asc" ? "desc" : "asc",
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md text-left transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0532e6]"
                    >
                      {column.header}
                      {sort?.key === column.sortKey ? (
                        <span aria-hidden>{sort.order === "asc" ? "↑" : "↓"}</span>
                      ) : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white/40">
            {items.map((item, rowIndex) => (
              <tr key={item.id} className="group transition-colors hover:bg-white/70">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={clsx(
                      "border-b border-white/60 px-5 py-4 align-middle last:border-b-0",
                      column.className,
                    )}
                  >
                    {column.cell(item, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border border-white/80 bg-white/60 backdrop-blur-md p-2 pl-4 shadow-2xs">
      <span className="text-xs font-medium text-gtext">
        Trang {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="soft"
          className="h-9 px-3"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <Icon name="arrow-left" className="h-4 w-4" />
          <span className="hidden sm:inline">Trước</span>
        </Button>
        <Button
          variant="soft"
          className="h-9 px-3"
          aria-label="Trang sau"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <span className="hidden sm:inline">Sau</span>
          <Icon name="arrow-right" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const statTone: Record<string, string> = {
  navy: "text-navy",
  gold: "text-[#0532e6]",
  green: "text-success",
  blue: "text-[#0532e6]",
  neutral: "text-navy/70",
  brand: "text-[#0532e6]",
  warning: "text-warning",
  success: "text-success",
};

export function StatCard({
  label,
  title,
  value,
  hint,
  icon,
  tone = "navy",
  delta,
}: {
  label?: string;
  title?: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: string;
  delta?: { value: string; positive: boolean };
}) {
  const displayLabel = label ?? title ?? "";
  return (
    <Card className="flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gtext">
            {displayLabel}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-black text-navy md:text-3xl">{value}</span>
            {delta && (
              <span
                className={clsx(
                  "text-xs font-bold",
                  delta.positive ? "text-success" : "text-error",
                )}
              >
                {delta.positive ? "↑" : "↓"} {delta.value}
              </span>
            )}
          </div>
          {hint && <p className="mt-1.5 text-xs leading-5 text-gtext">{hint}</p>}
        </div>
        {icon && (
          <div
            className={clsx(
              "flex shrink-0 items-center justify-center pt-0.5",
              statTone[tone] ?? "text-navy",
            )}
          >
            <Icon name={icon} className="h-6 w-6" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-bold text-navy md:text-lg">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-gtext">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function QuickAction({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  children?: ReactNode;
}) {
  return (
    <Card className="group h-full transition hover:-translate-y-0.5 hover:border-[#0532e6]/50 hover:shadow-elevated">
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 items-center justify-center text-navy transition group-hover:text-[#0532e6] pt-0.5">
          <Icon name={icon} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-navy">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-gtext">{description}</p>
          {children}
        </div>
        <Icon
          name="chevron-right"
          className="mt-2 h-4 w-4 text-gtext transition group-hover:translate-x-1 group-hover:text-[#0532e6]"
        />
      </div>
    </Card>
  );
}

export function AttendanceRoster({
  data,
  onCorrect,
}: {
  data: SessionAttendance;
  onCorrect?: (item: AttendanceRosterItem) => void;
}) {
  const locked = !!data.session.attendance_locked_at;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Tổng", data.summary.total, "navy"],
          ["Có mặt", data.summary.present, "green"],
          ["Vắng / trễ", data.summary.absent + data.summary.late, "red"],
          ["Trạng thái", locked ? "Đã khóa" : "Trong ngày", "gold"],
        ].map(([label, value, tone]) => (
          <div
            key={String(label)}
            className={clsx(
              "rounded-xl border p-3",
              tone === "green"
                ? "border-success/15 bg-success-bg"
                : tone === "red"
                  ? "border-error/15 bg-error-bg"
                  : tone === "gold"
                    ? "border-gold/25 bg-gold/10"
                    : "border-gborder bg-gbg2",
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-gtext">{label}</p>
            <b className="mt-1 block text-navy">{value}</b>
          </div>
        ))}
      </div>
      <div className="max-h-80 divide-y divide-gborder overflow-y-auto rounded-xl border border-gborder">
        {data.items.map((item) => (
          <div
            key={item.student_id}
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-gbg"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/8 text-xs font-bold text-navy">
                {item.full_name.trim().split(" ").at(-1)?.[0] ?? "H"}
              </div>
              <div className="min-w-0">
                <b className="block truncate text-sm text-navy">{item.full_name}</b>
                <p className="text-[11px] text-gtext">{item.student_code}</p>
                {item.note && <p className="mt-1 text-xs text-gtext">{item.note}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.attendance_status ? (
                <StatusBadge value={item.attendance_status} />
              ) : (
                <Badge tone="gray">Chưa ghi nhận</Badge>
              )}
              {onCorrect && item.attendance_id ? (
                <Button variant="ghost" onClick={() => onCorrect(item)}>
                  Hiệu chỉnh
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
