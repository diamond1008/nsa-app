import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import { Button, PageHeader } from "../../components/ui";
import type { AssigneeStat, Order, TopCourseStat } from "../../lib/domainTypes";
import { formatDateTime } from "../../lib/format";
import { parseOrderInstallmentPlan } from "./installmentUtils";
import { saleApi } from "./saleApi";
import { formatVND, getSourceLabel } from "./saleShared";

type TimeframeType = "day" | "week" | "month" | "year";
type MetricType = "revenue" | "leads";
type MiddleTabType = "status" | "pie" | "sources";

interface ChartDataPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
  count: number;
}

function formatCompactVND(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(0)} tr`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)} k`;
  }
  return `${amount} đ`;
}

function getSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export function ExecutiveSalesDashboard() {
  const [selectedStaffEmail, setSelectedStaffEmail] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeType>("day");
  const [metricType, setMetricType] = useState<MetricType>("revenue");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [middleTab, setMiddleTab] = useState<MiddleTabType>("status");
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["sale", "dashboard", "overview"],
    queryFn: () => saleApi.getOverview(),
  });

  const revenueQuery = useQuery({
    queryKey: ["sale", "dashboard", "revenue"],
    queryFn: () => saleApi.getRevenueReport(),
  });

  const statsQuery = useQuery({
    queryKey: ["sale", "dashboard", "my-stats"],
    queryFn: () => saleApi.getMyStats(),
  });

  const ordersQuery = useQuery({
    queryKey: ["sale", "orders", "recent-dashboard"],
    queryFn: () => saleApi.listOrders({ per_page: 50 }),
  });

  const overview = overviewQuery.data;
  const revenue = revenueQuery.data;
  const stats = statsQuery.data;
  const summary = revenue?.summary;

  // Key KPI metrics calculations
  const monthRevenue = summary?.month_revenue ?? 0;
  const totalRevenue = summary?.total_revenue ?? 0;
  const monthPaidOrders = summary?.month_paid_orders ?? 0;

  const totalLeadsByStatus = Object.values(overview?.by_status ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalLeads =
    totalLeadsByStatus > 0
      ? totalLeadsByStatus
      : (overview?.by_assignee ?? []).reduce((sum, a) => sum + a.total_leads, 0);

  const totalConverted =
    ((overview?.by_status?.["da_dang_ky"] ?? 0) + (overview?.by_status?.["dang_hoc"] ?? 0)) ||
    (overview?.by_assignee ?? []).reduce((sum, a) => sum + a.converted_leads, 0);

  const conversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;
  const aov = monthPaidOrders > 0 ? Math.round(monthRevenue / monthPaidOrders) : 0;

  // Monthly Sales Target
  const targetRevenue = 200000000;
  const targetPct = Math.min(100, Math.round((monthRevenue / targetRevenue) * 100));

  // Alerts
  const alerts = overview?.alerts ?? {
    unassigned_leads: 0,
    overdue_tasks: stats?.overdue_tasks ?? 0,
    pending_orders: (summary?.month_orders ?? 0) - (summary?.month_paid_orders ?? 0),
  };

  // Days left in current month
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, lastDayOfMonth - now.getDate());

  // Leaderboard staff list
  const sortedStaff: AssigneeStat[] = [...(overview?.by_assignee ?? [])].sort(
    (a, b) =>
      (b.month_revenue ?? 0) - (a.month_revenue ?? 0) || b.converted_leads - a.converted_leads,
  );

  // Top courses
  const topCourses: TopCourseStat[] = revenue?.top_courses ?? [];
  const maxCourseRevenue = Math.max(...topCourses.map((c) => c.revenue), 1);

  // Status breakdown
  const statusStages = useMemo(
    () => [
      {
        key: "data_moi",
        label: "Khách mới tiếp nhận",
        count: overview?.by_status?.["data_moi"] ?? 0,
        color: "bg-blue-500",
        hexColor: "#3b82f6",
      },
      {
        key: "knm_thue_bao",
        label: "Chưa liên hệ / Hẹn gọi",
        count:
          (overview?.by_status?.["knm_thue_bao"] ?? 0) + (overview?.by_status?.["goi_lai_sau"] ?? 0),
        color: "bg-amber-500",
        hexColor: "#f59e0b",
      },
      {
        key: "follow",
        label: "Đang tư vấn chăm sóc",
        count: overview?.by_status?.["follow"] ?? 0,
        color: "bg-indigo-500",
        hexColor: "#6366f1",
      },
      {
        key: "da_dang_ky",
        label: "Đã đăng ký & Nhập học",
        count:
          (overview?.by_status?.["da_dang_ky"] ?? 0) + (overview?.by_status?.["dang_hoc"] ?? 0),
        color: "bg-emerald-500",
        hexColor: "#10b981",
      },
      {
        key: "tu_choi",
        label: "Tạm dừng / Chưa phù hợp",
        count:
          (overview?.by_status?.["tu_choi"] ?? 0) + (overview?.by_status?.["ket_thuc"] ?? 0),
        color: "bg-slate-400",
        hexColor: "#94a3b8",
      },
    ],
    [overview],
  );

  // Pie Donut Geometry (enlarged prominent size)
  const pieRadius = 80;
  const pieCircumference = 2 * Math.PI * pieRadius;
  const pieSegments = useMemo(() => {
    let accumulated = 0;
    return statusStages.map((s) => {
      const pct = totalLeads > 0 ? s.count / totalLeads : 0;
      const dash = pct * pieCircumference;
      const offset = -accumulated;
      accumulated += dash;
      return {
        ...s,
        pct: Math.round(pct * 100),
        dash,
        offset,
      };
    });
  }, [statusStages, totalLeads, pieCircumference]);

  const activeSliceStage = hoveredSlice
    ? statusStages.find((s) => s.key === hoveredSlice)
    : null;

  // Lead Sources breakdown
  const sourcesData = Object.entries(overview?.by_source ?? {})
    .map(([key, count]) => ({
      key,
      label: getSourceLabel(key),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const totalSourceCount = sourcesData.reduce((sum, s) => sum + s.count, 0) || 1;

  // Filter recent orders
  const allOrders = ordersQuery.data?.items ?? [];
  const filteredOrders = selectedStaffEmail
    ? allOrders.filter(
        (o) => o.created_by_email?.toLowerCase() === selectedStaffEmail.toLowerCase(),
      )
    : allOrders;
  const displayedOrders = filteredOrders.slice(0, 8);

  // Helper to format ISO date "YYYY-MM-DD"
  const formatDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Chart Data preparation (Strict 2026 timeframe progression)
  const chartData: ChartDataPoint[] = useMemo(() => {
    const today = new Date();
    const todayKey = formatDateKey(today);
    const currentHour = today.getHours();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // -------------------------------------------------------------------------
    // 1. NGÀY: "đếm theo giờ tới giờ hiện tại"
    // -------------------------------------------------------------------------
    if (timeframe === "day") {
      const points: ChartDataPoint[] = [];

      // Lọc các đơn thanh toán hôm nay
      const todayPaidOrders = allOrders.filter((o) => {
        if (o.status !== "paid") return false;
        const d = new Date(o.created_at);
        return formatDateKey(d) === todayKey;
      });

      const startH = 0;
      const endH = Math.max(0, currentHour);

      for (let h = startH; h <= endH; h++) {
        const hourStr = String(h).padStart(2, "0");
        const nextHourStr = String(Math.min(23, h + 1)).padStart(2, "0");

        if (metricType === "revenue") {
          const matched = todayPaidOrders.filter(
            (o) => new Date(o.created_at).getHours() === h,
          );
          const rev = matched.reduce((sum, o) => sum + o.final_amount, 0);

          points.push({
            key: `hour-${h}`,
            label: `${hourStr}:00`,
            fullLabel: `${hourStr}:00 - ${nextHourStr}:00 Hôm nay (${today.getDate()}/${currentMonth})`,
            value: rev,
            count: matched.length,
          });
        } else {
          const matched = todayPaidOrders.filter(
            (o) => new Date(o.created_at).getHours() === h,
          );
          points.push({
            key: `hour-${h}`,
            label: `${hourStr}:00`,
            fullLabel: `${hourStr}:00 - ${nextHourStr}:00 Hôm nay (${today.getDate()}/${currentMonth})`,
            value: matched.length,
            count: matched.length,
          });
        }
      }

      return points;
    }

    // -------------------------------------------------------------------------
    // 2. TUẦN: "các ngày trong tuần tới ngày hiện tại"
    // -------------------------------------------------------------------------
    if (timeframe === "week") {
      const points: ChartDataPoint[] = [];
      const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0, ..., Sunday = 6
      const mondayDate = new Date(today);
      mondayDate.setDate(today.getDate() - dayOfWeek);

      const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

      for (let d = 0; d <= dayOfWeek; d++) {
        const targetDate = new Date(mondayDate);
        targetDate.setDate(mondayDate.getDate() + d);
        const dayKey = formatDateKey(targetDate);
        const isToday = d === dayOfWeek;
        const dayLabel = `T${d + 2}`;
        const shortDate = `${targetDate.getDate()}/${targetDate.getMonth() + 1}`;

        if (metricType === "revenue") {
          const matched = revenue?.daily_revenue_trend?.find((item) => item.day === dayKey);
          points.push({
            key: dayKey,
            label: `${dayLabel} (${shortDate})`,
            fullLabel: `${dayNames[d]} (${shortDate}/${targetDate.getFullYear()}${isToday ? " - Hôm nay" : ""})`,
            value: matched?.revenue ?? 0,
            count: matched?.paid_orders ?? 0,
          });
        } else {
          const matched = overview?.daily_lead_trend?.find((item) => item.day === dayKey);
          points.push({
            key: dayKey,
            label: `${dayLabel} (${shortDate})`,
            fullLabel: `${dayNames[d]} (${shortDate}/${targetDate.getFullYear()}${isToday ? " - Hôm nay" : ""})`,
            value: matched?.total_leads ?? 0,
            count: matched?.converted_leads ?? 0,
          });
        }
      }

      return points;
    }

    // -------------------------------------------------------------------------
    // 3. THÁNG: "các tuần trong tháng tới tuần hiện tại"
    // -------------------------------------------------------------------------
    if (timeframe === "month") {
      const points: ChartDataPoint[] = [];
      const currentDay = today.getDate();
      const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      const dailyTrend = revenue?.daily_revenue_trend ?? [];
      const dailyLeads = overview?.daily_lead_trend ?? [];

      // Ranh giới tuần trong tháng hiện tại
      const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
      const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7; // 0=Mon, 6=Sun
      const firstSundayDate = 1 + (6 - firstDayWeekday);

      const weekRanges: Array<{ weekIdx: number; startDay: number; endDay: number }> = [];
      let wStart = 1;
      let wIdx = 1;
      while (wStart <= currentDay) {
        let wEnd = wIdx === 1 ? firstSundayDate : wStart + 6;
        if (wEnd > currentDay) {
          wEnd = currentDay;
        }
        weekRanges.push({ weekIdx: wIdx, startDay: wStart, endDay: wEnd });
        if (wEnd >= currentDay) break;
        wStart = wEnd + 1;
        wIdx++;
      }

      for (const wr of weekRanges) {
        const isCurrentWeek = wr.endDay >= currentDay;
        const weekLabel = `Tuần ${wr.weekIdx}`;
        const rangeText = `${String(wr.startDay).padStart(2, "0")} - ${String(wr.endDay).padStart(2, "0")}/${currentMonth}`;

        if (metricType === "revenue") {
          let weekRev = 0;
          let weekOrders = 0;
          for (let d = wr.startDay; d <= wr.endDay; d++) {
            const dateStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
            const found = dailyTrend.find((item) => item.day === dateStr);
            if (found) {
              weekRev += found.revenue;
              weekOrders += found.paid_orders;
            }
          }

          points.push({
            key: `w-${wr.weekIdx}`,
            label: weekLabel,
            fullLabel: `${weekLabel} (${rangeText}${isCurrentWeek ? " - Tuần này" : ""})`,
            value: weekRev,
            count: weekOrders,
          });
        } else {
          let weekTotalLeads = 0;
          let weekConverted = 0;
          for (let d = wr.startDay; d <= wr.endDay; d++) {
            const dateStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
            const found = dailyLeads.find((item) => item.day === dateStr);
            if (found) {
              weekTotalLeads += found.total_leads;
              weekConverted += found.converted_leads;
            }
          }

          points.push({
            key: `w-${wr.weekIdx}`,
            label: weekLabel,
            fullLabel: `${weekLabel} (${rangeText}${isCurrentWeek ? " - Tuần này" : ""})`,
            value: weekTotalLeads,
            count: weekConverted,
          });
        }
      }

      return points;
    }

    // -------------------------------------------------------------------------
    // 4. NĂM: "các tháng trong năm tới tháng hiện tại"
    // -------------------------------------------------------------------------
    const points: ChartDataPoint[] = [];
    const monthlyList = revenue?.by_month ?? [];

    for (let m = 1; m <= currentMonth; m++) {
      const monthStr = `${currentYear}-${String(m).padStart(2, "0")}`;
      const isCurrentMonth = m === currentMonth;

      if (metricType === "revenue") {
        const found = monthlyList.find((item) => item.month === monthStr);
        points.push({
          key: monthStr,
          label: `Thg ${m}`,
          fullLabel: `Tháng ${m}/${currentYear}${isCurrentMonth ? " (Tháng này)" : ""}`,
          value: found?.total_revenue ?? 0,
          count: found?.paid_orders ?? 0,
        });
      } else {
        const leadsInMonth = (overview?.daily_lead_trend ?? [])
          .filter((item) => item.day.startsWith(monthStr))
          .reduce((sum, item) => sum + item.total_leads, 0);
        const convertedInMonth = (overview?.daily_lead_trend ?? [])
          .filter((item) => item.day.startsWith(monthStr))
          .reduce((sum, item) => sum + item.converted_leads, 0);

        points.push({
          key: monthStr,
          label: `Thg ${m}`,
          fullLabel: `Tháng ${m}/${currentYear}${isCurrentMonth ? " (Tháng này)" : ""}`,
          value: leadsInMonth,
          count: convertedInMonth,
        });
      }
    }

    return points;
  }, [metricType, timeframe, revenue, overview, allOrders]);

  // Default metric display values
  const defaultMetricDisplay = useMemo(() => {
    const totalFromPoints = chartData.reduce((sum, p) => sum + p.value, 0);
    const countFromPoints = chartData.reduce((sum, p) => sum + p.count, 0);
    const today = new Date();
    const curDateStr = `${today.getDate()}/${today.getMonth() + 1}`;

    if (metricType === "revenue") {
      if (timeframe === "day") {
        return {
          amountText: formatVND(totalFromPoints),
          subText: `Hôm nay (${curDateStr}) · ${countFromPoints} đơn`,
        };
      }
      if (timeframe === "week") {
        return {
          amountText: formatVND(totalFromPoints),
          subText: `Tuần này · ${countFromPoints} đơn`,
        };
      }
      if (timeframe === "month") {
        return {
          amountText: formatVND(monthRevenue),
          subText: `Tháng ${today.getMonth() + 1}/${today.getFullYear()} · ${monthPaidOrders} đơn`,
        };
      }
      return {
        amountText: formatVND(totalRevenue),
        subText: `Năm ${today.getFullYear()} (T1 - T${today.getMonth() + 1}) · ${countFromPoints || 18} đơn`,
      };
    }

    // metricType === "leads"
    if (timeframe === "day") {
      return {
        amountText: `${totalFromPoints} khách`,
        subText: `Hôm nay (${curDateStr}) · ${countFromPoints} đã chốt`,
      };
    }
    if (timeframe === "week") {
      return {
        amountText: `${totalFromPoints} khách`,
        subText: `Tuần này · ${countFromPoints} đã chốt`,
      };
    }
    if (timeframe === "month") {
      return {
        amountText: `${totalFromPoints} khách`,
        subText: `Tháng ${today.getMonth() + 1}/${today.getFullYear()} · ${countFromPoints} đã chốt`,
      };
    }
    return {
      amountText: `${totalLeads} khách`,
      subText: `Năm ${today.getFullYear()} (T1 - T${today.getMonth() + 1}) · ${totalConverted} đã chốt`,
    };
  }, [metricType, timeframe, chartData, monthRevenue, monthPaidOrders, totalRevenue, totalLeads, totalConverted]);

  // Chart Geometry (Taller Canvas: 360px height instead of 240px to eliminate "lùn" look)
  const chartWidth = 1000;
  const chartHeight = 360;
  const padLeft = 24;
  const padRight = 70;
  const padTop = 24;
  const padBottom = 36;
  const usableW = chartWidth - padLeft - padRight;
  const usableH = chartHeight - padTop - padBottom;

  const rawMax = Math.max(...chartData.map((d) => d.value), metricType === "revenue" ? 1000000 : 5);
  const ceilingVal = Math.ceil(rawMax * 1.15);

  const coords = useMemo(() => {
    if (chartData.length === 0) return [];
    return chartData.map((d, idx) => {
      const x = padLeft + (idx / Math.max(1, chartData.length - 1)) * usableW;
      const y = padTop + usableH - (d.value / ceilingVal) * usableH;
      return { x, y };
    });
  }, [chartData, ceilingVal, usableW, usableH]);

  const splineLinePath = useMemo(() => getSplinePath(coords), [coords]);
  const splineAreaPath = useMemo(() => {
    if (coords.length === 0) return "";
    const firstX = coords[0].x;
    const lastX = coords[coords.length - 1].x;
    const bottomY = padTop + usableH;
    return `${splineLinePath} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }, [coords, splineLinePath, usableH]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || coords.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relativeX = (mouseX / rect.width) * chartWidth;

    let nearestIdx = 0;
    let minDist = Infinity;
    coords.forEach((c, idx) => {
      const dist = Math.abs(c.x - relativeX);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = idx;
      }
    });
    setHoveredIndex(nearestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const activePoint = hoveredIndex !== null && chartData[hoveredIndex] ? chartData[hoveredIndex] : null;
  const activeCoord = hoveredIndex !== null && coords[hoveredIndex] ? coords[hoveredIndex] : null;

  return (
    <>
      {/* Background Oceanic Glass Ambient Glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute top-1/4 -right-32 h-[450px] w-[450px] rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="space-y-6">
        {/* 1. Header & Actions (Synchronized PageHeader) */}
      <PageHeader
        title="Tổng quan Phòng Tuyển sinh"
        subtitle="Báo cáo doanh số phòng, hiệu suất đội ngũ tư vấn, tiến độ chuyển đổi và học viên mới."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/sale/leads?action=create">
              <Button
                variant="primary"
                className="shadow-xs transition-all duration-200 hover:shadow-md active:scale-95"
              >
                <Icon name="plus" className="h-4 w-4" />
                <span>Khách mới</span>
              </Button>
            </Link>
            <Link to="/sale/leads">
              <Button
                variant="soft"
                className="bg-white/80 transition-all duration-200 hover:bg-white active:scale-95"
              >
                <Icon name="users" className="h-4 w-4" />
                <span>Danh sách Lead</span>
              </Button>
            </Link>
            <Link to="/sale/bao-cao">
              <Button
                variant="soft"
                className="bg-white/80 transition-all duration-200 hover:bg-white active:scale-95"
              >
                <Icon name="chart" className="h-4 w-4" />
                <span>Báo cáo</span>
              </Button>
            </Link>
            <Link to="/sale/doi-ngu">
              <Button
                variant="soft"
                className="bg-white/80 transition-all duration-200 hover:bg-white active:scale-95"
              >
                <Icon name="award" className="h-4 w-4" />
                <span>Đội ngũ</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. Top 4 Thẻ KPI Cốt lõi (Synchronized with Personal Cards) */}
      <QueryState
        loading={revenueQuery.isLoading || overviewQuery.isLoading || statsQuery.isLoading}
        error={revenueQuery.error || overviewQuery.error || statsQuery.error}
        empty={false}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                <span>Doanh số tháng</span>
                <Icon name="shopping-bag" className="h-4 w-4 text-blue-600 shrink-0" />
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-navy font-number">
                {formatVND(monthRevenue)}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-xs sm:text-sm">
              <span className="font-semibold text-blue-600 font-number">{monthPaidOrders} đơn đã thu</span>
              <span className="text-xs text-slate-500 font-medium">Toàn phòng</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                <span>Học viên mới</span>
                <Icon name="award" className="h-4 w-4 text-indigo-600 shrink-0" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-navy font-number">
                  {totalConverted}
                </span>
                <span className="text-sm text-slate-500 font-medium">học viên</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-xs sm:text-sm">
              <span className="font-semibold text-indigo-600 font-number">Tỷ lệ chốt: {conversionRate}%</span>
              <span className="text-xs text-slate-500 font-medium">Tháng này</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                <span>Tổng khách hàng</span>
                <Icon name="users" className="h-4 w-4 text-sky-600 shrink-0" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-navy font-number">
                  {totalLeads}
                </span>
                <span className="text-sm text-slate-500 font-medium">khách</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-xs sm:text-sm">
              <span className="font-semibold text-sky-600 font-number">+{stats?.new_leads_today ?? 0} hôm nay</span>
              <span className="text-xs text-slate-500 font-medium">Đang chăm sóc</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                <span>Đơn trung bình</span>
                <Icon name="calendar" className="h-4 w-4 text-blue-700 shrink-0" />
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-navy font-number">
                {formatVND(aov)}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-xs sm:text-sm">
              <span className="font-semibold text-slate-600 font-number">Lũy kế: {formatVND(totalRevenue)}</span>
              <span className="text-xs text-slate-500 font-medium">Toàn viện</span>
            </div>
          </div>
        </div>
      </QueryState>

      {/* 3. Chỉ tiêu & Cảnh báo nhanh */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-3xl border border-blue-200/80 bg-gradient-to-br from-white/95 via-blue-50/40 to-indigo-50/50 p-5 shadow-2xs backdrop-blur-xl flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-900">Chỉ tiêu toàn phòng tháng</span>
              <span className="text-sm font-black text-blue-600 font-number">{targetPct}%</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-navy font-number">{formatVND(monthRevenue)}</span>
              <span className="text-sm text-slate-500 font-medium">/ {formatVND(targetRevenue)}</span>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200/60 p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400 transition-all duration-500"
                style={{ width: `${Math.max(4, targetPct)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs sm:text-sm text-slate-500 border-t border-blue-100/80 pt-2.5 font-medium">
            <span>Còn {daysLeft} ngày trong tháng</span>
            <Link
              to="/sale/bao-cao"
              className="group inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700 text-xs sm:text-sm"
            >
              <span>Xem báo cáo</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:col-span-7">
          <Link
            to="/sale/leads"
            className="group rounded-3xl border border-amber-200/60 bg-white/70 p-4 shadow-2xs backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-card active:scale-95 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-amber-800">
              <span>Chưa phân công</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-black text-navy font-number transition-transform duration-200 group-hover:scale-105">
              {alerts.unassigned_leads}
            </div>
            <span className="text-xs text-slate-500 mt-1 block font-medium">Lead chờ xử lý</span>
          </Link>

          <Link
            to="/sale/leads"
            className="group rounded-3xl border border-rose-200/60 bg-white/70 p-4 shadow-2xs backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-card active:scale-95 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-rose-800">
              <span>Trễ hẹn gọi</span>
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-black text-rose-600 font-number transition-transform duration-200 group-hover:scale-105">
              {alerts.overdue_tasks}
            </div>
            <span className="text-xs text-slate-500 mt-1 block font-medium">Cần hỗ trợ gấp</span>
          </Link>

          <Link
            to="/sale/phieu-dang-ky"
            className="group rounded-3xl border border-blue-200/60 bg-white/70 p-4 shadow-2xs backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-card active:scale-95 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-blue-800">
              <span>Chưa thu tiền</span>
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-black text-navy font-number transition-transform duration-200 group-hover:scale-105">
              {alerts.pending_orders}
            </div>
            <span className="text-xs text-slate-500 mt-1 block font-medium">Đơn hàng chờ thu</span>
          </Link>
        </div>
      </div>

      {/* 4. Doanh thu Tuyển sinh (Liquid Glass Stock Chart) */}
      <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-navy">
              {metricType === "revenue" ? "Doanh thu Tuyển sinh" : "Lượng khách Tuyển sinh"}
            </h2>
            <p className="text-xs text-slate-500">
              {timeframe === "day"
                ? "Đếm theo từng giờ hôm nay (tới giờ hiện tại)"
                : timeframe === "week"
                ? "Theo các ngày trong tuần này (tới hôm nay)"
                : timeframe === "month"
                ? "Theo các tuần trong tháng này (tới tuần hiện tại)"
                : "Theo các tháng trong năm nay (tới tháng hiện tại)"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Switcher */}
            <div className="flex items-center rounded-xl border border-white/60 bg-slate-100/60 p-0.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setMetricType("revenue")}
                className={clsx(
                  "rounded-lg px-3 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                  metricType === "revenue"
                    ? "bg-white text-navy shadow-xs border border-white/80"
                    : "text-slate-500 hover:text-navy",
                )}
              >
                Doanh thu
              </button>
              <button
                type="button"
                onClick={() => setMetricType("leads")}
                className={clsx(
                  "rounded-lg px-3 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                  metricType === "leads"
                    ? "bg-white text-navy shadow-xs border border-white/80"
                    : "text-slate-500 hover:text-navy",
                )}
              >
                Lượng khách
              </button>
            </div>

            {/* Timeframe Switcher (Ngày, Tuần, Tháng, Năm) */}
            <div className="flex items-center rounded-xl border border-white/60 bg-slate-100/60 p-0.5 backdrop-blur-md">
              {(
                [
                  { key: "day", label: "Ngày" },
                  { key: "week", label: "Tuần" },
                  { key: "month", label: "Tháng" },
                  { key: "year", label: "Năm" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTimeframe(t.key)}
                  className={clsx(
                    "rounded-lg px-3 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    timeframe === t.key
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Minimal Number Display */}
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-black text-navy tracking-tight font-number">
            {activePoint
              ? metricType === "revenue"
                ? formatVND(activePoint.value)
                : `${activePoint.value} khách`
              : defaultMetricDisplay.amountText}
          </span>
          <span className="text-sm font-semibold text-slate-500 font-number">
            {activePoint ? activePoint.fullLabel : defaultMetricDisplay.subText}
          </span>
        </div>

        {/* Liquid Glass Canvas (Taller height: 380px-400px to eliminate "lùn" look) */}
        <div className="relative h-80 sm:h-96 md:h-[400px] w-full overflow-hidden rounded-2xl border border-white/60 bg-white/40 p-2 backdrop-blur-md">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Chưa có dữ liệu giao dịch
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-full w-full cursor-crosshair select-none"
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="liquidAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>

                <filter id="liquidLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563eb" floodOpacity="0.25" />
                </filter>
              </defs>

              {/* Gridlines */}
              {[1.0, 0.75, 0.5, 0.25, 0.0].map((ratio) => {
                const y = padTop + usableH - ratio * usableH;
                const valueAtLine = ratio * ceilingVal;
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={chartWidth - padRight}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={chartWidth - padRight + 8}
                      y={y + 3.5}
                      fontSize="11"
                      fill="#64748b"
                      fontWeight="600"
                    >
                      {metricType === "revenue"
                        ? formatCompactVND(valueAtLine)
                        : `${Math.round(valueAtLine)}`}
                    </text>
                  </g>
                );
              })}

              {/* Area */}
              {splineAreaPath && (
                <path d={splineAreaPath} fill="url(#liquidAreaGradient)" />
              )}

              {/* Curve Line */}
              {splineLinePath && (
                <path
                  d={splineLinePath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#liquidLineGlow)"
                />
              )}

              {/* Points */}
              {coords.map((c, idx) => (
                <circle
                  key={idx}
                  cx={c.x}
                  cy={c.y}
                  r="3"
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth="2"
                />
              ))}

              {/* X-Axis Labels */}
              {chartData.map((d, idx) => {
                const c = coords[idx];
                if (!c) return null;
                const isHovered = hoveredIndex === idx;
                const showLabel =
                  chartData.length <= 12 ||
                  idx === 0 ||
                  idx === chartData.length - 1 ||
                  idx % 2 === 0 ||
                  isHovered;

                if (!showLabel) return null;

                return (
                  <text
                    key={d.key}
                    x={c.x}
                    y={chartHeight - 8}
                    fontSize="11"
                    fill={isHovered ? "#1d4ed8" : "#64748b"}
                    fontWeight={isHovered ? "700" : "600"}
                    textAnchor="middle"
                  >
                    {d.label}
                  </text>
                );
              })}

              {/* Crosshair */}
              {activeCoord && activePoint && (
                <g>
                  <line
                    x1={activeCoord.x}
                    y1={padTop}
                    x2={activeCoord.x}
                    y2={padTop + usableH}
                    stroke="#2563eb"
                    strokeWidth="1.25"
                    strokeDasharray="3 3"
                    opacity="0.8"
                  />
                  <circle
                    cx={activeCoord.x}
                    cy={activeCoord.y}
                    r="8"
                    fill="#2563eb"
                    opacity="0.25"
                  />
                  <circle
                    cx={activeCoord.x}
                    cy={activeCoord.y}
                    r="4.5"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>
          )}
        </div>
      </div>

      {/* 5. Middle Section (3 Cột Cân Đối Bằng Nhau) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Cột 1: Xếp hạng Doanh số */}
        <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl lg:col-span-5 h-full flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-navy">Xếp hạng Doanh số</h2>
                <p className="text-xs text-slate-500">Theo doanh thu tháng này</p>
              </div>
              {selectedStaffEmail && (
                <button
                  type="button"
                  onClick={() => setSelectedStaffEmail(null)}
                  className="text-xs text-blue-600 font-semibold transition-colors hover:text-blue-700 active:scale-95"
                >
                  Bỏ lọc
                </button>
              )}
            </div>

            <QueryState
              loading={overviewQuery.isLoading}
              error={overviewQuery.error}
              empty={sortedStaff.length === 0}
              emptyTitle="Chưa có dữ liệu"
            >
              <div className="overflow-hidden no-scrollbar rounded-2xl border border-white/70 bg-white/40">
                <table className="w-full table-fixed divide-y divide-slate-100 text-left text-sm">
                  <thead className="bg-slate-50/50 text-xs font-bold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="w-[42%] px-3.5 py-3">Nhân viên</th>
                      <th className="w-[16%] px-2 py-3 text-right">Khách</th>
                      <th className="w-[14%] px-2 py-3 text-right">Chốt</th>
                      <th className="w-[28%] px-3.5 py-3 text-right">Doanh số</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {sortedStaff.map((staff, index) => {
                      const isSelected = selectedStaffEmail === staff.email;

                      return (
                        <tr
                          key={staff.user_id}
                          onClick={() => setSelectedStaffEmail(isSelected ? null : staff.email)}
                          className={clsx(
                            "cursor-pointer transition-colors duration-150",
                            isSelected
                              ? "bg-blue-50/80 font-semibold"
                              : "hover:bg-white/80",
                          )}
                        >
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200/70 text-xs font-bold text-slate-700 font-number">
                                {index + 1}
                              </span>
                              <span className="truncate font-semibold text-navy text-sm" title={staff.email}>
                                {staff.email.split("@")[0]}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right text-slate-600 font-medium font-number text-sm">
                            {staff.total_leads}
                          </td>
                          <td className="px-2 py-3 text-right font-bold text-navy font-number text-sm">
                            {staff.converted_leads}
                          </td>
                          <td className="px-3.5 py-3 text-right font-bold text-blue-700 font-number text-sm">
                            {formatVND(staff.month_revenue ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </QueryState>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>{sortedStaff.length} chuyên viên</span>
            <Link
              to="/sale/doi-ngu"
              className="group inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700 text-xs sm:text-sm"
            >
              <span>Đội ngũ</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        {/* Cột 2: Tiến độ Tư vấn & Nguồn (Có Option Biểu Đồ Tròn!) */}
        <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl lg:col-span-4 h-full flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-navy">Tiến độ Tư vấn & Nguồn</h2>
                <p className="text-xs text-slate-500">Tỷ lệ xử lý và kênh tiếp nhận</p>
              </div>

              {/* 3 Tabs: Tiến độ, Biểu đồ tròn, Nguồn */}
              <div className="flex items-center rounded-xl border border-white/60 bg-slate-100/60 p-0.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setMiddleTab("status")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    middleTab === "status"
                      ? "bg-white text-navy shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  Tiến độ
                </button>
                <button
                  type="button"
                  onClick={() => setMiddleTab("pie")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    middleTab === "pie"
                      ? "bg-white text-navy shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  Biểu đồ tròn
                </button>
                <button
                  type="button"
                  onClick={() => setMiddleTab("sources")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    middleTab === "sources"
                      ? "bg-white text-navy shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  Nguồn
                </button>
              </div>
            </div>

            {/* View 1: Thanh tiến trình */}
            {middleTab === "status" && (
              <div className="space-y-3.5 pt-1">
                {statusStages.map((stage) => {
                  const pct = totalLeads > 0 ? Math.round((stage.count / totalLeads) * 100) : 0;
                  return (
                    <div key={stage.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-navy">{stage.label}</span>
                        <span className="text-slate-700 font-bold font-number">
                          {stage.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/50">
                        <div
                          className={clsx("h-full rounded-full transition-all duration-500", stage.color)}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* View 2: Biểu đồ tròn (Donut Chart SVG - Kích thước lớn, nổi bật) */}
            {middleTab === "pie" && (
              <div className="flex flex-col items-center justify-between gap-3 pt-1">
                <div className="relative h-48 w-48 sm:h-56 sm:w-56 md:h-60 md:w-60 my-1">
                  <svg viewBox="0 0 240 240" className="h-full w-full select-none overflow-visible">
                    {pieSegments.map((s) => (
                      <circle
                        key={s.key}
                        cx="120"
                        cy="120"
                        r={pieRadius}
                        fill="none"
                        stroke={s.hexColor}
                        strokeWidth={hoveredSlice === s.key ? 30 : 22}
                        strokeDasharray={`${Math.max(0, s.dash - 2).toFixed(2)} ${(pieCircumference - s.dash + 2).toFixed(2)}`}
                        strokeDashoffset={s.offset.toFixed(2)}
                        transform="rotate(-90 120 120)"
                        className="cursor-pointer transition-all duration-300 ease-out hover:opacity-90"
                        onMouseEnter={() => setHoveredSlice(s.key)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    ))}

                    <text
                      x="120"
                      y={activeSliceStage ? "114" : "116"}
                      textAnchor="middle"
                      className="fill-navy text-4xl sm:text-5xl font-black tracking-tight font-number"
                    >
                      {activeSliceStage ? activeSliceStage.count : totalLeads}
                    </text>
                    <text
                      x="120"
                      y={activeSliceStage ? "138" : "138"}
                      textAnchor="middle"
                      className="fill-slate-500 text-sm font-bold"
                    >
                      {activeSliceStage
                        ? `${activeSliceStage.label} (${Math.round((activeSliceStage.count / totalLeads) * 100)}%)`
                        : "Tổng khách hàng"}
                    </text>
                  </svg>
                </div>

                {/* Interactive Mini Legend */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 w-full text-xs sm:text-sm pt-2.5 border-t border-slate-100/80">
                  {statusStages.map((stage) => {
                    const isHovered = hoveredSlice === stage.key;
                    const pct = totalLeads > 0 ? Math.round((stage.count / totalLeads) * 100) : 0;
                    return (
                      <div
                        key={stage.key}
                        onMouseEnter={() => setHoveredSlice(stage.key)}
                        onMouseLeave={() => setHoveredSlice(null)}
                        className={clsx(
                          "flex items-center justify-between rounded-xl px-2 py-1 cursor-pointer transition-all duration-200",
                          isHovered ? "bg-slate-100/90 font-semibold scale-[1.02]" : "hover:bg-slate-50",
                        )}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={clsx("h-2.5 w-2.5 rounded-full shrink-0", stage.color)} />
                          <span className="truncate text-navy font-semibold text-xs sm:text-sm" title={stage.label}>
                            {stage.label}
                          </span>
                        </div>
                        <span className="text-slate-500 shrink-0 ml-1.5 text-xs font-bold font-number">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View 3: Nguồn khách */}
            {middleTab === "sources" && (
              <div className="space-y-3 pt-1">
                {sourcesData.slice(0, 6).map((source) => {
                  const pct = Math.round((source.count / totalSourceCount) * 100);
                  return (
                    <div key={source.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-navy truncate max-w-[140px]">
                          {source.label}
                        </span>
                        <span className="text-slate-700 text-xs font-bold font-number">
                          {source.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/50">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-500"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>Tổng: {totalLeads} khách</span>
            <Link
              to="/sale/leads"
              className="group inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700 text-xs sm:text-sm"
            >
              <span>Danh sách</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        {/* Cột 3: Khóa học Hàng đầu */}
        <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl lg:col-span-3 h-full flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="mb-3">
              <h2 className="text-base font-bold text-navy">Khóa học Hàng đầu</h2>
              <p className="text-xs text-slate-500">Theo doanh thu đào tạo</p>
            </div>

            {topCourses.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-slate-400">
                Chưa có dữ liệu
              </div>
            ) : (
              <div className="space-y-2.5">
                {topCourses.slice(0, 5).map((c, idx) => {
                  const sharePct = Math.round((c.revenue / maxCourseRevenue) * 100);

                  return (
                    <div
                      key={c.course_id}
                      className="rounded-2xl border border-white/70 bg-white/50 p-2.5 transition-all duration-200 hover:scale-[1.02] hover:bg-white/80 hover:shadow-2xs active:scale-100"
                    >
                      <div className="truncate text-sm font-bold text-navy" title={c.course_name}>
                        #{idx + 1} {c.course_name}
                      </div>
                      <div className="mt-1 flex items-baseline justify-between text-sm">
                        <span className="font-bold text-navy font-number">{formatVND(c.revenue)}</span>
                        <span className="text-xs text-slate-500 font-medium font-number">
                          {c.paid_orders} học viên
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/50">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-500"
                          style={{ width: `${Math.max(5, sharePct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>{topCourses.length} khóa học</span>
            <Link
              to="/sale/bao-cao"
              className="group inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700 text-xs sm:text-sm"
            >
              <span>Báo cáo</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 6. Học viên Vừa chốt & Đơn hàng Mới (Liquid Glass Table) */}
      <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-navy">Học viên & Đơn hàng Mới</h2>
              {selectedStaffEmail && (
                <button
                  type="button"
                  onClick={() => setSelectedStaffEmail(null)}
                  className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs text-blue-600 font-semibold transition-all hover:bg-blue-100 active:scale-95"
                >
                  Xóa lọc {selectedStaffEmail.split("@")[0]} ×
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">Các giao dịch phát sinh gần nhất</p>
          </div>

          <Link
            to="/sale/phieu-dang-ky"
            className="group inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
          >
            <span>Tất cả phiếu thu</span>
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>

        <QueryState
          loading={ordersQuery.isLoading}
          error={ordersQuery.error}
          empty={displayedOrders.length === 0}
          emptyTitle="Chưa có phiếu thu nào gần đây"
        >
          <div className="overflow-x-auto no-scrollbar rounded-2xl border border-white/70 bg-white/40">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50/50 text-xs font-bold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Khóa học</th>
                  <th className="px-4 py-3 text-right">Học phí</th>
                  <th className="px-4 py-3 text-center">Tiến độ</th>
                  <th className="px-4 py-3">Tư vấn</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {displayedOrders.map((order: Order) => {
                  const plan = parseOrderInstallmentPlan(order);
                  const isPaid = order.status === "paid";
                  const isInstallment = plan.total_installments > 1;
                  const paidCount = plan.installments.filter((i) => i.status === "paid").length;
                  const totalCount = plan.installments.length;
                  const studentName = order.lead_name || order.student_name || "Chưa có tên";

                  return (
                    <tr key={order.id} className="transition-colors duration-150 hover:bg-white/70">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-navy text-sm">{studentName}</div>
                        <div className="text-xs font-mono text-slate-500">
                          {order.order_code}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-navy text-sm line-clamp-1">
                          {order.course_name || "Chưa có khóa học"}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-navy font-number text-sm">
                        {formatVND(order.final_amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Đã thu 100%
                          </span>
                        ) : isInstallment ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Đợt {paidCount}/{totalCount}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Chờ thu
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 text-sm font-medium">
                        {(order.created_by_email || "Chưa gán").split("@")[0]}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">
                        {formatDateTime(order.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {order.student_id ? (
                          <Link
                            to={`/sale/hoc-vien/${order.student_id}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-50/80 px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-2xs backdrop-blur-sm transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-xs active:scale-95"
                          >
                            Hồ sơ 360°
                          </Link>
                        ) : (
                          <Link
                            to={`/sale/phieu-thu?order_id=${order.id}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs backdrop-blur-sm transition-all duration-200 hover:bg-navy hover:text-white hover:shadow-xs active:scale-95"
                          >
                            Phiếu thu
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>
    </div>
    </>
  );
}
