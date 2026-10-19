import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { Card } from "../../components/ui";
import { StatCard } from "../../components/data";
import { Icon } from "../../components/icons";
import { useAuth } from "../auth/AuthContext";
import type { Lead, LeadPipelineStatus, LeadSource } from "../../lib/domainTypes";
import { saleApi } from "./saleApi";
import { PIPELINE_STATUS_OPTIONS, SOURCE_OPTIONS } from "./saleShared";

export interface LeadChartsViewProps {
  leads: Lead[];
  onSelectStatus?: (status: LeadPipelineStatus) => void;
  onSelectSource?: (source: LeadSource) => void;
  isFiltered?: boolean;
}

interface StageStyle {
  label: string;
  dotColor: string;
  barColor: string;
  textColor: string;
  bgLight: string;
}

const STAGE_STYLES: Record<LeadPipelineStatus, StageStyle> = {
  data_moi: {
    label: "Data mới",
    dotColor: "bg-blue-500",
    barColor: "from-blue-500 to-sky-400",
    textColor: "text-blue-700",
    bgLight: "bg-blue-50/70 border-blue-200/60",
  },
  knm_thue_bao: {
    label: "KNM / Thuê bao",
    dotColor: "bg-amber-500",
    barColor: "from-amber-500 to-orange-400",
    textColor: "text-amber-700",
    bgLight: "bg-amber-50/70 border-amber-200/60",
  },
  goi_lai_sau: {
    label: "Gọi lại sau",
    dotColor: "bg-yellow-500",
    barColor: "from-yellow-500 to-amber-400",
    textColor: "text-yellow-700",
    bgLight: "bg-yellow-50/70 border-yellow-200/60",
  },
  follow: {
    label: "Follow / Chăm sóc",
    dotColor: "bg-indigo-500",
    barColor: "from-indigo-500 to-purple-400",
    textColor: "text-indigo-700",
    bgLight: "bg-indigo-50/70 border-indigo-200/60",
  },
  da_dang_ky: {
    label: "Đã đăng ký",
    dotColor: "bg-emerald-500",
    barColor: "from-emerald-500 to-teal-400",
    textColor: "text-emerald-700",
    bgLight: "bg-emerald-50/70 border-emerald-200/60",
  },
  dang_hoc: {
    label: "Đang học",
    dotColor: "bg-teal-500",
    barColor: "from-teal-500 to-cyan-400",
    textColor: "text-teal-700",
    bgLight: "bg-teal-50/70 border-teal-200/60",
  },
  tu_choi: {
    label: "Từ chối",
    dotColor: "bg-rose-500",
    barColor: "from-rose-500 to-pink-400",
    textColor: "text-rose-700",
    bgLight: "bg-rose-50/70 border-rose-200/60",
  },
  ket_thuc: {
    label: "Kết thúc",
    dotColor: "bg-slate-500",
    barColor: "from-slate-500 to-gray-400",
    textColor: "text-slate-700",
    bgLight: "bg-slate-50/70 border-slate-200/60",
  },
};

const SOURCE_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  google: "#EA4335",
  tiktok: "#000000",
  zalo: "#0068FF",
  website: "#0532E6",
  referral: "#10B981",
  walk_in: "#F59E0B",
  event: "#8B5CF6",
  other: "#64748B",
};

export function LeadChartsView({
  leads,
  onSelectStatus,
  onSelectSource,
  isFiltered,
}: LeadChartsViewProps) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN", "SALE_ADMIN");

  // Query full company overview only for managers/admins
  const overviewQuery = useQuery({
    queryKey: ["sale", "dashboard", "overview"],
    queryFn: () => saleApi.getOverview(),
    enabled: isAdmin,
    retry: 1,
  });

  const overview = overviewQuery.data;

  // Compute status metrics: regular sale staff strictly view their own assigned leads
  const {
    totalLeads,
    statusCounts,
    sourceCounts,
    assigneeCounts,
    convertedCount,
    activePipelineCount,
    unreachedCount,
    dailyIntake,
  } = useMemo(() => {
    let total = 0;
    const sCounts: Record<string, number> = {};
    const srcCounts: Record<string, number> = {};
    const assignees: Record<string, { email: string; total: number; converted: number }> = {};
    const dayMap: Record<string, number> = {};

    // Only prioritize full company overview if user is admin/manager and no filter is active
    if (isAdmin && !isFiltered && overview?.by_status) {
      Object.entries(overview.by_status).forEach(([st, cnt]) => {
        sCounts[st] = cnt;
        total += cnt;
      });
      if (overview.by_source) {
        Object.entries(overview.by_source).forEach(([src, cnt]) => {
          srcCounts[src] = cnt;
        });
      }
      if (overview.by_assignee) {
        overview.by_assignee.forEach((asg) => {
          assignees[asg.email || asg.user_id] = {
            email: asg.email || asg.user_id,
            total: asg.total_leads,
            converted: asg.converted_leads,
          };
        });
      }
    } else {
      total = leads.length;
      leads.forEach((l) => {
        const st = l.pipeline_status || "data_moi";
        sCounts[st] = (sCounts[st] || 0) + 1;

        const src = l.source || "other";
        srcCounts[src] = (srcCounts[src] || 0) + 1;

        const email = l.assigned_to_email || "Chưa phân bổ";
        if (!assignees[email]) {
          assignees[email] = { email, total: 0, converted: 0 };
        }
        assignees[email].total += 1;
        if (st === "da_dang_ky" || st === "dang_hoc") {
          assignees[email].converted += 1;
        }

        // Daily trend
        if (l.created_at) {
          const dayKey = l.created_at.slice(0, 10);
          dayMap[dayKey] = (dayMap[dayKey] || 0) + 1;
        }
      });
    }

    const converted = (sCounts["da_dang_ky"] || 0) + (sCounts["dang_hoc"] || 0);
    const active =
      (sCounts["data_moi"] || 0) + (sCounts["follow"] || 0) + (sCounts["goi_lai_sau"] || 0);
    const unreached = sCounts["knm_thue_bao"] || 0;

    // Sort days chronologically (most recent last 10 days)
    const sortedDays = Object.entries(dayMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10);

    return {
      totalLeads: total,
      statusCounts: sCounts,
      sourceCounts: srcCounts,
      assigneeCounts: Object.values(assignees),
      convertedCount: converted,
      activePipelineCount: active,
      unreachedCount: unreached,
      dailyIntake: sortedDays,
    };
  }, [leads, isFiltered, overview, isAdmin]);

  const conversionRate = totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 100) : 0;

  // Max count for scaling day bars
  const maxDayCount = Math.max(1, ...dailyIntake.map(([, cnt]) => cnt));

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={isAdmin ? "Tổng số Lead" : "Tổng số Lead của tôi"}
          value={new Intl.NumberFormat("vi-VN").format(totalLeads)}
          hint={
            isFiltered
              ? "Theo bộ lọc hiện tại"
              : isAdmin
                ? "Toàn bộ Lead trong hệ thống"
                : "Tổng số Lead được phân công cho bạn"
          }
          icon="users"
          tone="neutral"
        />

        <StatCard
          label="Chốt thành công"
          value={new Intl.NumberFormat("vi-VN").format(convertedCount)}
          hint={`${conversionRate}% tỷ lệ chốt (đã đăng ký & đang học)`}
          icon="award"
          tone="neutral"
        />

        <StatCard
          label="Đang chăm sóc"
          value={new Intl.NumberFormat("vi-VN").format(activePipelineCount)}
          hint="Data mới, Follow và hẹn Gọi lại sau"
          icon="clock"
          tone="neutral"
        />

        <StatCard
          label="KNM / Thuê bao"
          value={new Intl.NumberFormat("vi-VN").format(unreachedCount)}
          hint="Cần liên hệ lại hoặc đổi khung giờ gọi"
          icon="phone"
          tone="neutral"
        />
      </div>

      {/* Grid: Conversion Progression Chart & Sources Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Tiến trình chăm sóc & chuyển đổi (7 cols) */}
        <Card className="lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Icon name="chart" className="h-5 w-5 text-slate-500 shrink-0" />
                <div>
                  <h3 className="font-heading text-sm font-bold text-navy">
                    Tiến Trình Chăm Sóc & Chuyển Đổi
                  </h3>
                  <p className="text-xs text-gtext">
                    Số lượng và tỷ trọng khách hàng theo từng bước tư vấn
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-gtext">
                {totalLeads} Lead
              </span>
            </div>

            <div className="mt-5 space-y-3.5">
              {PIPELINE_STATUS_OPTIONS.map((opt) => {
                const count = statusCounts[opt.value] || 0;
                const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                const barWidth =
                  count > 0 && totalLeads > 0
                    ? Math.max(2, Math.min(100, Math.round((count / totalLeads) * 100)))
                    : 0;
                const style = STAGE_STYLES[opt.value] || {
                  label: opt.label,
                  dotColor: "bg-slate-400",
                  barColor: "from-slate-400 to-slate-500",
                  textColor: "text-slate-700",
                  bgLight: "bg-slate-50 border-slate-200",
                };

                return (
                  <div
                    key={opt.value}
                    onClick={() => onSelectStatus?.(opt.value)}
                    className={clsx(
                      "group rounded-xl border border-transparent p-2.5 transition-all",
                      onSelectStatus &&
                        "cursor-pointer hover:border-slate-200 hover:bg-slate-50/70",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={clsx("h-2.5 w-2.5 rounded-full", style.dotColor)} />
                        <span className="text-navy group-hover:text-[#0532e6] transition-colors">
                          {opt.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-calibri">
                        <span className="font-bold text-navy">{count}</span>
                        <span className="text-gtext text-[11px]">({percentage}%)</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-3 w-full rounded-full bg-slate-100/80 overflow-hidden shadow-inner">
                      <div
                        className={clsx(
                          "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                          style.barColor,
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-gtext">
            <span>💡 Nhấp vào từng giai đoạn để lọc nhanh danh sách</span>
            <span className="font-semibold text-emerald-600">
              Chốt: {convertedCount} ({conversionRate}%)
            </span>
          </div>
        </Card>

        {/* Cơ cấu Nguồn Lead (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Icon name="users" className="h-5 w-5 text-slate-500 shrink-0" />
                <div>
                  <h3 className="font-heading text-sm font-bold text-navy">
                    Cơ Cấu Nguồn Khách Hàng
                  </h3>
                  <p className="text-xs text-gtext">Kênh tiếp cận mang lại nhiều Lead nhất</p>
                </div>
              </div>
            </div>

            {/* Multi-segment stacked distribution bar */}
            {totalLeads > 0 && (
              <div className="mt-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  {SOURCE_OPTIONS.map((src) => {
                    const count = sourceCounts[src.value] || 0;
                    if (count === 0) return null;
                    const pct = Math.max(1, (count / totalLeads) * 100);
                    const color = SOURCE_COLORS[src.value] || "#64748B";
                    return (
                      <div
                        key={src.value}
                        title={`${src.label}: ${count} (${Math.round(pct)}%)`}
                        style={{ width: `${pct}%`, backgroundColor: color }}
                        className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* List of sources */}
            <div className="mt-5 space-y-3">
              {SOURCE_OPTIONS.map((src) => {
                const count = sourceCounts[src.value] || 0;
                const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                const barWidth =
                  count > 0 && totalLeads > 0
                    ? Math.max(2, Math.min(100, Math.round((count / totalLeads) * 100)))
                    : 0;
                const color = SOURCE_COLORS[src.value] || "#64748B";

                return (
                  <div
                    key={src.value}
                    onClick={() => onSelectSource?.(src.value)}
                    className={clsx(
                      "group rounded-xl border border-transparent p-2 transition-all",
                      onSelectSource &&
                        "cursor-pointer hover:border-slate-200 hover:bg-slate-50/70",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-navy group-hover:text-[#0532e6] transition-colors">
                          {src.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-calibri">
                        <span className="font-bold text-navy">{count}</span>
                        <span className="text-gtext text-[11px]">({percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-gtext flex justify-between">
            <span>💡 Nhấp vào nguồn để lọc Lead tương ứng</span>
            <span className="font-semibold text-navy">
              {Object.keys(sourceCounts).filter((k) => sourceCounts[k] > 0).length} kênh hoạt động
            </span>
          </div>
        </Card>
      </div>

      {/* Row 2: Trend & Sale Staff Performance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Xu hướng tiếp nhận Lead theo ngày */}
        <Card
          className={clsx(
            isAdmin ? "lg:col-span-6" : "lg:col-span-12",
            "flex flex-col justify-between",
          )}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Icon name="calendar" className="h-5 w-5 text-slate-500 shrink-0" />
                <div>
                  <h3 className="font-heading text-sm font-bold text-navy">
                    Xu Hướng Tiếp Nhận Lead
                  </h3>
                  <p className="text-xs text-gtext">
                    {isAdmin
                      ? "Số lượng Lead đổ về theo từng ngày gần đây"
                      : "Số lượng Lead bạn tiếp nhận theo từng ngày gần đây"}
                  </p>
                </div>
              </div>
            </div>

            {dailyIntake.length === 0 ? (
              <div className="py-12 text-center text-xs text-gtext">
                Chưa có dữ liệu xu hướng ngày trong danh sách hiện tại.
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex items-end justify-between gap-2 h-44 pt-6 pb-2 px-2 border-b border-slate-200">
                  {dailyIntake.map(([day, cnt]) => {
                    const heightPercent =
                      maxDayCount > 0 ? Math.max(12, Math.round((cnt / maxDayCount) * 100)) : 12;
                    const dateFormatted = day.slice(5); // MM-DD
                    return (
                      <div
                        key={day}
                        className="flex-1 flex flex-col items-center justify-end h-full group"
                      >
                        <span className="text-[10px] font-bold text-navy mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {cnt}
                        </span>
                        <div
                          className="w-full max-w-[28px] rounded-t-lg bg-gradient-to-t from-[#0532e6] to-sky-400 shadow-xs group-hover:from-blue-600 group-hover:to-cyan-300 transition-all duration-300"
                          style={{ height: `${heightPercent}%` }}
                        />
                        <span className="text-[10.5px] font-calibri text-gtext mt-2 block whitespace-nowrap">
                          {dateFormatted}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center text-[11px] text-gtext mt-3">
                  <span>📅 10 ngày ghi nhận gần nhất</span>
                  <span className="font-semibold text-navy">
                    Đỉnh điểm: {maxDayCount} lead/ngày
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Hiệu suất tư vấn theo nhân viên (Chỉ hiển thị cho Quản lý / Admin) */}
        {isAdmin && (
          <Card className="lg:col-span-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Icon name="award" className="h-5 w-5 text-slate-500 shrink-0" />
                  <div>
                    <h3 className="font-heading text-sm font-bold text-navy">
                      Hiệu Suất Tư Vấn Phụ Trách
                    </h3>
                    <p className="text-xs text-gtext">
                      Phân bổ khối lượng và tỷ lệ chốt của từng Sale
                    </p>
                  </div>
                </div>
              </div>

              {assigneeCounts.length === 0 ? (
                <div className="py-12 text-center text-xs text-gtext">
                  Chưa có dữ liệu phân bổ nhân sự tư vấn.
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 space-y-2">
                  {assigneeCounts
                    .sort((a, b) => b.total - a.total)
                    .map((asg) => {
                      const rate =
                        asg.total > 0 ? Math.round((asg.converted / asg.total) * 100) : 0;
                      return (
                        <div key={asg.email} className="pt-2.5 first:pt-0">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-navy uppercase">
                                {asg.email[0]}
                              </span>
                              <span className="font-medium text-navy truncate" title={asg.email}>
                                {asg.email}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-right shrink-0 font-calibri text-[12px]">
                              <span>
                                <strong className="text-navy">{asg.total}</strong> lead
                              </span>
                              <span className="font-semibold text-emerald-600">
                                {asg.converted} chốt ({rate}%)
                              </span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                              style={{ width: `${rate > 0 ? Math.max(4, rate) : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-gtext flex justify-between">
              <span>👥 {assigneeCounts.length} nhân sự tư vấn</span>
              <span className="font-semibold text-navy">Tổng chốt: {convertedCount} học viên</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
