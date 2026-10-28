import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";

import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import { Badge, Button, PageHeader } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Lead, Order } from "../../lib/domainTypes";
import { formatDate, formatDateTime } from "../../lib/format";
import { parseOrderInstallmentPlan } from "./installmentUtils";
import { saleApi } from "./saleApi";
import { formatVND, LeadPipelineBadge } from "./saleShared";

export function PersonalSalesDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [taskFilter, setTaskFilter] = useState<"all" | "today" | "overdue">("all");

  const statsQuery = useQuery({
    queryKey: ["sale", "dashboard", "my-stats"],
    queryFn: () => saleApi.getMyStats(),
  });

  const tasksQuery = useQuery({
    queryKey: ["sale", "tasks", "pending"],
    queryFn: () => saleApi.listTasks({ status: "pending" }),
  });

  const leadsQuery = useQuery({
    queryKey: ["sale", "leads", "recent-personal"],
    queryFn: () =>
      saleApi.listLeads({
        page: 1,
        per_page: 6,
        sort_by: "created_at",
        sort_order: "desc",
      }),
  });

  const ordersQuery = useQuery({
    queryKey: ["sale", "orders", "my-recent", user?.id],
    queryFn: async () => {
      try {
        const res = await saleApi.listOrders({
          per_page: 6,
          created_by: user?.id,
        });
        return res ?? { items: [], meta: { page: 1, per_page: 6, total: 0, total_pages: 0 } };
      } catch {
        return { items: [], meta: { page: 1, per_page: 6, total: 0, total_pages: 0 } };
      }
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => saleApi.completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard", "my-stats"] });
    },
  });

  const stats = statsQuery.data;
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const recentLeads = useMemo(() => leadsQuery.data?.items ?? [], [leadsQuery.data?.items]);
  const myOrders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data?.items]);

  // Personal Monthly Target Calculation (Default target: 50.000.000 đ)
  const personalTarget = 50_000_000;
  const monthRevenue = stats?.month_revenue ?? 0;
  const targetPct =
    personalTarget > 0 ? Math.min(100, Math.round((monthRevenue / personalTarget) * 100)) : 100;
  const remainingTarget = Math.max(0, personalTarget - monthRevenue);

  const now = useMemo(() => new Date(), []);
  const lastDayOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 0), [now]);
  const daysLeft = Math.max(0, lastDayOfMonth.getDate() - now.getDate());

  // Task filtering
  const categorizedTasks = useMemo(() => {
    const today: typeof tasks = [];
    const overdue: typeof tasks = [];
    const upcoming: typeof tasks = [];

    tasks.forEach((t) => {
      const d = new Date(t.due_at);
      if (d < now && d.toDateString() !== now.toDateString()) {
        overdue.push(t);
      } else if (d.toDateString() === now.toDateString()) {
        today.push(t);
      } else {
        upcoming.push(t);
      }
    });

    return { today, overdue, upcoming };
  }, [tasks, now]);

  const displayedTasks = useMemo(() => {
    if (taskFilter === "today") return categorizedTasks.today;
    if (taskFilter === "overdue") return categorizedTasks.overdue;
    return [...categorizedTasks.overdue, ...categorizedTasks.today, ...categorizedTasks.upcoming];
  }, [taskFilter, categorizedTasks]);

  // Unpaid or installment orders
  const pendingPaymentOrdersCount = useMemo(() => {
    return myOrders.filter((o) => o.status !== "paid").length;
  }, [myOrders]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Tổng quan Tuyển sinh"
        subtitle="Theo dõi chỉ tiêu doanh số cá nhân, tiến độ chăm sóc khách hàng và học viên vừa đăng ký."
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
            <Link to="/sale/phieu-dang-ky">
              <Button
                variant="soft"
                className="bg-white/80 transition-all duration-200 hover:bg-white active:scale-95"
              >
                <Icon name="shopping-bag" className="h-4 w-4" />
                <span>Tạo đơn</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Hero Performance Cockpit - Tone Xanh Dương Chủ Đạo */}
      <QueryState loading={statsQuery.isLoading} error={statsQuery.error} empty={false}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Card 1: Doanh số & Tiến độ Mục tiêu (Hero Blue Glass Card - 7 cols) */}
          <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-white/95 via-blue-50/40 to-indigo-50/50 p-5 sm:p-6 shadow-2xs backdrop-blur-2xl transition-all duration-300 hover:shadow-card lg:col-span-7 flex flex-col justify-between">
            {/* Ambient oceanic lighting inside hero card */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-500/15 blur-2xl" />

            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-900">
                  <Icon name="shopping-bag" className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Doanh số cá nhân tháng</span>
                </div>
              </div>

              {/* Big amount */}
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-navy tracking-tight font-number">
                  {formatVND(monthRevenue)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-4 space-y-1.5">
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/60 p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400 shadow-2xs transition-all duration-500"
                    style={{ width: `${Math.max(4, targetPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 font-medium">
                  <span>Mục tiêu: {formatVND(personalTarget)}</span>
                  <span>
                    {remainingTarget > 0
                      ? `Thiếu ${formatVND(remainingTarget)}`
                      : `Đạt 100% · Còn ${daysLeft} ngày`}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom shelf strip */}
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-blue-100/80 pt-3.5 text-xs sm:text-sm">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Đã chốt</span>
                <span className="font-bold text-navy text-base sm:text-lg font-number">
                  {stats?.converted_this_month ?? 0}
                </span>
                <span className="text-xs text-slate-500 font-medium"> học viên</span>
              </div>
              <div className="border-x border-blue-100/70 px-2 text-center">
                <span className="text-xs text-slate-500 font-medium block">Tỷ lệ chốt</span>
                <span className="font-bold text-blue-700 text-base sm:text-lg font-number">
                  {stats?.conversion_rate ? stats.conversion_rate.toFixed(0) : 0}%
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 font-medium block">Chờ nộp tiền</span>
                <span className="font-bold text-amber-600 text-base sm:text-lg font-number">
                  {pendingPaymentOrdersCount}
                </span>
                <span className="text-xs text-slate-500 font-medium"> đơn</span>
              </div>
            </div>
          </div>

          {/* Card 2: Khách hàng & Nhịp vận hành hôm nay (Pipeline Cockpit - 5 cols) */}
          <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-white/95 via-sky-50/30 to-blue-50/40 p-5 sm:p-6 shadow-2xs backdrop-blur-2xl transition-all duration-300 hover:shadow-card lg:col-span-5 flex flex-col justify-between">
            {/* Ambient lighting */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-sky-400/15 blur-2xl" />

            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600">
                <div className="flex items-center gap-2">
                  <Icon name="users" className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Khách hàng & Vận hành</span>
                </div>
              </div>

              {/* 2 Hubs: Lead phụ trách & Lịch gọi */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                {/* Hub 1: Lead được gán & Mới */}
                <div className="rounded-2xl border border-white/90 bg-white/75 p-4 shadow-2xs backdrop-blur-md">
                  <span className="text-xs font-semibold text-slate-500 block">Lead được gán</span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black text-navy font-number">
                      {stats?.assigned_leads ?? 0}
                    </span>
                    <span className="text-sm text-slate-500 font-medium">khách</span>
                  </div>
                  <div className="mt-2 text-xs sm:text-sm font-medium text-slate-600">
                    <span>Mới hôm nay: </span>
                    <span className="font-bold text-blue-600 font-number">
                      {stats?.new_leads_today ?? 0}
                    </span>
                  </div>
                </div>

                {/* Hub 2: Nhắc việc & Quá hạn */}
                <div className="rounded-2xl border border-white/90 bg-white/75 p-4 shadow-2xs backdrop-blur-md">
                  <span className="text-xs font-semibold text-slate-500 block">
                    Lịch hẹn hôm nay
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black text-navy font-number">
                      {stats?.today_tasks ?? 0}
                    </span>
                    <span className="text-sm text-slate-500 font-medium">cuộc hẹn</span>
                  </div>
                  <div className="mt-2 text-xs sm:text-sm font-semibold">
                    {(stats?.overdue_tasks ?? 0) > 0 ? (
                      <span className="text-rose-600 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                        {stats?.overdue_tasks} quá hạn
                      </span>
                    ) : (
                      <span className="text-blue-600">Đúng hạn ✓</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick status notice at bottom of card */}
            <div className="mt-4 flex items-center justify-between text-xs sm:text-sm border-t border-slate-100 pt-3.5 font-medium">
              <span className="text-slate-500">
                {categorizedTasks.today.length > 0
                  ? `Có ${categorizedTasks.today.length} khách cần tư vấn trong ngày`
                  : "Đã hoàn thành hết lịch hẹn hôm nay"}
              </span>
              <Link
                to="/sale/leads?action=create"
                className="group inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 transition-colors text-xs sm:text-sm"
              >
                <span>Thêm Lead</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </QueryState>

      {/* Middle Section: Tasks (7 cols) & Recent Leads (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Tasks (7 cols) */}
        <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl lg:col-span-7 flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-navy">Nhiệm vụ & Lịch chăm sóc cần làm</h2>
                <p className="text-xs text-slate-500">
                  Các cuộc hẹn gọi điện, tư vấn và lịch nhắc việc
                </p>
              </div>

              {/* Task Filter Tabs */}
              <div className="flex items-center rounded-xl border border-white/60 bg-slate-100/60 p-0.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setTaskFilter("all")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    taskFilter === "all"
                      ? "bg-white text-navy shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  Tất cả ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter("today")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    taskFilter === "today"
                      ? "bg-white text-navy shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-navy",
                  )}
                >
                  Hôm nay ({categorizedTasks.today.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter("overdue")}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all duration-150",
                    taskFilter === "overdue"
                      ? "bg-white text-rose-600 shadow-xs border border-white/80"
                      : "text-slate-500 hover:text-rose-600",
                  )}
                >
                  Quá hạn ({categorizedTasks.overdue.length})
                </button>
              </div>
            </div>

            <QueryState
              loading={tasksQuery.isLoading}
              error={tasksQuery.error}
              empty={displayedTasks.length === 0}
              emptyTitle="Không có việc cần xử lý trong mục này"
            >
              <div className="divide-y divide-slate-100/70 overflow-hidden rounded-2xl border border-white/70 bg-white/40">
                {displayedTasks.map((task) => {
                  const dueDate = new Date(task.due_at);
                  const isOverdue = dueDate < now && dueDate.toDateString() !== now.toDateString();
                  const isToday = dueDate.toDateString() === now.toDateString();

                  return (
                    <div
                      key={task.id}
                      className={clsx(
                        "flex flex-col gap-2.5 p-3.5 transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between",
                        isOverdue && "bg-rose-50/40 hover:bg-rose-50/70",
                        isToday && !isOverdue && "bg-amber-50/30 hover:bg-amber-50/60",
                        !isOverdue && !isToday && "hover:bg-white/80",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-navy text-sm">{task.title}</span>
                          {isOverdue && <Badge tone="red">Quá hạn</Badge>}
                          {isToday && !isOverdue && <Badge tone="gold">Hôm nay</Badge>}
                        </div>
                        {task.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs sm:text-sm text-slate-600">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="clock" className="h-3.5 w-3.5" />
                            {formatDateTime(task.due_at)}
                          </span>
                          {task.lead_name && (
                            <Link
                              to={`/sale/leads/${task.lead_id}`}
                              className="font-semibold text-navy transition-colors duration-150 hover:text-blue-600"
                            >
                              Khách: {task.lead_name}
                            </Link>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pt-1 sm:pt-0">
                        <Button
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors active:scale-95"
                          loading={
                            completeTaskMutation.isPending &&
                            completeTaskMutation.variables === task.id
                          }
                          onClick={() => completeTaskMutation.mutate(task.id)}
                        >
                          <Icon name="check" className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Hoàn thành</span>
                        </Button>
                        <Link to={`/sale/leads/${task.lead_id}`}>
                          <Button
                            variant="soft"
                            className="h-8 px-2 text-xs transition-colors hover:bg-blue-100/60 active:scale-95"
                          >
                            <Icon name="chevron-right" className="h-3.5 w-3.5 text-blue-600" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </QueryState>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>{displayedTasks.length} nhiệm vụ hiển thị</span>
            <span className="text-slate-500">Tự động nhắc lịch gọi theo hẹn</span>
          </div>
        </div>

        {/* Right Column: Recent Leads Assigned (5 cols) */}
        <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl lg:col-span-5 flex flex-col justify-between transition-all duration-300 hover:shadow-card">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-navy">Khách mới tiếp nhận</h2>
                <p className="text-xs text-slate-500">
                  Danh sách khách hàng được phân công gần đây
                </p>
              </div>
              <Link
                to="/sale/leads"
                className="group inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-600 transition-colors duration-150 hover:text-blue-700"
              >
                <span>Xem tất cả</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>

            <QueryState
              loading={leadsQuery.isLoading}
              error={leadsQuery.error}
              empty={recentLeads.length === 0}
              emptyTitle="Chưa có khách hàng nào được phân công"
            >
              <div className="divide-y divide-slate-100/70 overflow-hidden rounded-2xl border border-white/70 bg-white/40">
                {recentLeads.map((lead: Lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-3.5 transition-colors duration-150 hover:bg-white/80"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <Link
                        to={`/sale/leads/${lead.id}`}
                        className="block font-bold text-navy text-sm transition-colors duration-150 hover:text-blue-600 truncate"
                      >
                        {lead.full_name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 font-mono font-medium">
                        <span>{lead.phone || "Chưa có SĐT"}</span>
                        <span>•</span>
                        <span>{formatDate(lead.created_at)}</span>
                      </div>
                      {lead.interested_course_name && (
                        <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-600">
                          {lead.interested_course_name}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <LeadPipelineBadge status={lead.pipeline_status} />
                      <Link to={`/sale/leads/${lead.id}`}>
                        <span className="inline-flex items-center gap-0.5 rounded-lg bg-blue-50/70 px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white active:scale-95 cursor-pointer">
                          Chi tiết
                        </span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </QueryState>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>{recentLeads.length} khách mới nhất</span>
            <Link
              to="/sale/leads"
              className="group inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 transition-colors text-xs sm:text-sm"
            >
              <span>Quản lý Lead</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Orders & Closed Deals */}
      <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-2xs backdrop-blur-xl transition-all duration-300 hover:shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-navy">Học viên vừa chốt & Đơn hàng của tôi</h2>
            <p className="text-xs text-slate-500">
              Danh sách các phiếu thu và khóa học bạn đã đăng ký cho học viên
            </p>
          </div>
          <Link
            to="/sale/phieu-thu"
            className="group inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-600 transition-colors duration-150 hover:text-blue-700"
          >
            <span>Xem phiếu thu</span>
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>

        <QueryState
          loading={ordersQuery.isLoading}
          error={ordersQuery.error}
          empty={myOrders.length === 0}
          emptyTitle="Chưa có đơn hàng nào"
        >
          <div className="overflow-x-auto no-scrollbar rounded-2xl border border-white/70 bg-white/40">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50/50 text-xs font-bold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Khóa học</th>
                  <th className="px-4 py-3 text-right">Học phí</th>
                  <th className="px-4 py-3 text-center">Tiến độ thu</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {myOrders.map((order: Order) => {
                  const plan = parseOrderInstallmentPlan(order);
                  const isPaid = order.status === "paid";
                  const isInstallment = plan.total_installments > 1;
                  const paidCount = plan.installments.filter((i) => i.status === "paid").length;
                  const totalCount = plan.installments.length;
                  const studentName = order.lead_name || order.student_name || "Chưa có tên";

                  return (
                    <tr key={order.id} className="transition-colors duration-150 hover:bg-white/80">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-navy text-sm">{studentName}</div>
                        <div className="text-xs font-mono text-slate-500">{order.order_code}</div>
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
  );
}
