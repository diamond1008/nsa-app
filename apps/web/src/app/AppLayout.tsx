import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

import { Icon } from "../components/icons";
import type { IconName } from "../components/icons";
import { useAuth } from "../features/auth/AuthContext";
import { notificationApi } from "../features/notifications/notificationApi";
import type { NotificationList } from "../lib/domainTypes";
import { formatDateTime } from "../lib/format";
import type { Role } from "../lib/types";

export interface NavSubItem {
  to: string;
  label: string;
  end?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: IconName;
  to?: string;
  end?: boolean;
  items: NavSubItem[];
}

const NAV_GROUPS_BY_ROLE: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      id: "tuyen-sinh",
      label: "Tuyển sinh",
      icon: "user",
      items: [
        { to: "/sale", label: "Tổng quan", end: true },
        { to: "/sale/leads", label: "Quản lý Lead" },
        { to: "/sale/phieu-dang-ky", label: "Phiếu đăng ký" },
        { to: "/sale/phieu-thu", label: "Phiếu thu" },
        { to: "/sale/reports", label: "Báo cáo" },
      ],
    },
    {
      id: "dao-tao",
      label: "Đào tạo",
      icon: "academic",
      items: [
        { to: "/admin", label: "Tổng quan", end: true },
        { to: "/admin/hoc-vien", label: "Học viên" },
        { to: "/admin/giang-vien", label: "Giảng viên" },
        { to: "/admin/khoa-hoc", label: "Khóa học" },
        { to: "/admin/lop-hoc", label: "Lớp học" },
        { to: "/admin/lich-hoc", label: "Lịch học" },
        { to: "/admin/diem-danh", label: "Điểm danh" },
        { to: "/admin/van-hanh", label: "Vận hành" },
      ],
    },
    {
      id: "he-thong",
      label: "Hệ thống",
      icon: "users",
      items: [{ to: "/admin/users", label: "Tài khoản & Phân quyền" }],
    },
  ],
  ACADEMIC_ADMIN: [
    {
      id: "dao-tao",
      label: "Đào tạo",
      icon: "academic",
      items: [
        { to: "/admin", label: "Tổng quan", end: true },
        { to: "/admin/hoc-vien", label: "Học viên" },
        { to: "/admin/giang-vien", label: "Giảng viên" },
        { to: "/admin/khoa-hoc", label: "Khóa học" },
        { to: "/admin/lop-hoc", label: "Lớp học" },
        { to: "/admin/lich-hoc", label: "Lịch học" },
        { to: "/admin/diem-danh", label: "Điểm danh" },
        { to: "/admin/van-hanh", label: "Vận hành" },
        { to: "/admin/users", label: "Tài khoản Đào tạo" },
      ],
    },
  ],
  SALE_ADMIN: [
    {
      id: "tong-quan",
      label: "Tổng quan",
      icon: "home",
      to: "/sale",
      end: true,
      items: [],
    },
    {
      id: "tuyen-sinh",
      label: "Tuyển sinh",
      icon: "user",
      items: [
        { to: "/sale/leads", label: "Quản lý Lead" },
        { to: "/sale/hoc-vien", label: "Học viên" },
        { to: "/sale/reports", label: "Báo cáo" },
        { to: "/sale/users", label: "Đội ngũ Sale" },
      ],
    },
    {
      id: "doanh-thu",
      label: "Doanh thu",
      icon: "shopping-bag",
      items: [
        { to: "/sale/phieu-dang-ky", label: "Phiếu đăng ký" },
        { to: "/sale/phieu-thu", label: "Phiếu thu" },
      ],
    },
    {
      id: "dao-tao",
      label: "Đào tạo",
      icon: "academic",
      items: [
        { to: "/sale/lop-hoc", label: "Lớp học" },
        { to: "/sale/lich-hoc", label: "Lịch học" },
        { to: "/sale/diem-danh", label: "Điểm danh" },
      ],
    },
  ],
  SALE: [
    {
      id: "tong-quan",
      label: "Tổng quan",
      icon: "home",
      to: "/sale",
      end: true,
      items: [],
    },
    {
      id: "tuyen-sinh",
      label: "Tuyển sinh",
      icon: "user",
      items: [
        { to: "/sale/leads", label: "Quản lý Lead" },
        { to: "/sale/hoc-vien", label: "Học viên" },
      ],
    },
    {
      id: "doanh-thu",
      label: "Doanh thu",
      icon: "shopping-bag",
      items: [
        { to: "/sale/phieu-dang-ky", label: "Phiếu đăng ký" },
        { to: "/sale/phieu-thu", label: "Phiếu thu" },
      ],
    },
    {
      id: "dao-tao",
      label: "Đào tạo",
      icon: "academic",
      items: [
        { to: "/sale/lop-hoc", label: "Lớp học" },
        { to: "/sale/lich-hoc", label: "Lịch học" },
        { to: "/sale/diem-danh", label: "Điểm danh" },
      ],
    },
  ],
  TEACHER: [
    {
      id: "giang-day",
      label: "Giảng dạy",
      icon: "teacher",
      items: [
        { to: "/teacher", label: "Tổng quan", end: true },
        { to: "/teacher/lop-phu-trach", label: "Lớp phụ trách" },
        { to: "/teacher/lich-day", label: "Lịch dạy" },
        { to: "/teacher/diem-danh", label: "Điểm danh" },
        { to: "/teacher/danh-gia", label: "Đánh giá" },
      ],
    },
  ],
  STUDENT: [
    {
      id: "hoc-tap",
      label: "Học tập",
      icon: "academic",
      items: [
        { to: "/student", label: "Tổng quan", end: true },
        { to: "/student/khoa-hoc", label: "Khóa học" },
        { to: "/student/lich-hoc", label: "Lịch học" },
        { to: "/student/diem-danh", label: "Điểm danh" },
        { to: "/student/danh-gia", label: "Đánh giá" },
        { to: "/student/tien-do", label: "Tiến độ học tập" },
      ],
    },
  ],
};

function navGroupsFor(roles: Role[]): NavGroup[] {
  const groupMap = new Map<string, NavGroup>();
  for (const role of roles) {
    for (const group of NAV_GROUPS_BY_ROLE[role] ?? []) {
      if (!groupMap.has(group.id)) {
        groupMap.set(group.id, {
          ...group,
          items: [...group.items],
        });
      } else {
        const existing = groupMap.get(group.id)!;
        const seenTos = new Set(existing.items.map((it) => it.to));
        for (const item of group.items) {
          if (!seenTos.has(item.to)) {
            seenTos.add(item.to);
            existing.items.push(item);
          }
        }
      }
    }
  }
  return Array.from(groupMap.values());
}

function isItemActive(pathname: string, item: NavSubItem): boolean {
  if (item.end) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  if (group.to) {
    if (group.end) return pathname === group.to;
    return pathname === group.to || pathname.startsWith(group.to + "/");
  }
  return group.items.some((item) => isItemActive(pathname, item));
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosingMenu, setIsClosingMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [menuOpen]);

  const openMobileMenu = () => {
    setIsClosingMenu(false);
    setMenuOpen(true);
  };

  const closeMobileMenu = () => {
    if (isClosingMenu) return;
    setIsClosingMenu(true);
    setTimeout(() => {
      setMenuOpen(false);
      setIsClosingMenu(false);
    }, 240);
  };

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(),
    refetchInterval: 60_000,
  });

  const handleToggleNotifications = () => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (next && notifications.data?.items) {
        const unreadItems = notifications.data.items.filter((item) => item.status === "unread");
        if (unreadItems.length > 0) {
          queryClient.setQueryData<NotificationList>(["notifications"], (old) => {
            if (!old) return old;
            return {
              ...old,
              unread: 0,
              items: old.items.map((it) => ({ ...it, status: "read" })),
            };
          });
          Promise.allSettled(unreadItems.map((item) => notificationApi.markRead(item.id))).then(
            () => {
              void queryClient.invalidateQueries({ queryKey: ["notifications"] });
            },
          );
        }
      }
      return next;
    });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [showTooltipBadge, setShowTooltipBadge] = useState(false);
  const [isHoveredLogo, setIsHoveredLogo] = useState(false);
  const [isHoveredCollapse, setIsHoveredCollapse] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const tooltipDelayTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsHoveredLogo(false);
    setIsHoveredCollapse(false);
  }, [isCollapsed]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
      if (tooltipDelayTimeoutRef.current !== null) {
        window.clearTimeout(tooltipDelayTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnterIconButton = (groupId: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredGroupId(groupId);

    // Tooltip timer should ONLY run while hovering directly on this icon button
    setShowTooltipBadge(false);
    if (tooltipDelayTimeoutRef.current !== null) {
      window.clearTimeout(tooltipDelayTimeoutRef.current);
      tooltipDelayTimeoutRef.current = null;
    }
    tooltipDelayTimeoutRef.current = window.setTimeout(() => {
      setShowTooltipBadge(true);
    }, 1000);
  };

  const handleMouseLeaveIconButton = () => {
    // When mouse leaves the exact icon button:
    // 1. Cancel the 1s timer so it never shows if user moved away early
    if (tooltipDelayTimeoutRef.current !== null) {
      window.clearTimeout(tooltipDelayTimeoutRef.current);
      tooltipDelayTimeoutRef.current = null;
    }
    // 2. Hide immediately if already shown
    setShowTooltipBadge(false);
  };

  const handleMouseEnterFlyout = (groupId: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredGroupId(groupId);

    // In the flyout menu, tooltip badge does NOT show and timer is cancelled
    if (tooltipDelayTimeoutRef.current !== null) {
      window.clearTimeout(tooltipDelayTimeoutRef.current);
      tooltipDelayTimeoutRef.current = null;
    }
    setShowTooltipBadge(false);
  };

  const handleMouseLeaveGroup = () => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredGroupId(null);
      setShowTooltipBadge(false);
      if (tooltipDelayTimeoutRef.current !== null) {
        window.clearTimeout(tooltipDelayTimeoutRef.current);
        tooltipDelayTimeoutRef.current = null;
      }
    }, 180);
  };

  const handleClickGroup = (group: NavGroup, collapsed: boolean, mobile: boolean) => {
    if (group.to) {
      navigate(group.to);
      setHoveredGroupId(null);
      setShowTooltipBadge(false);
      if (tooltipDelayTimeoutRef.current !== null) {
        window.clearTimeout(tooltipDelayTimeoutRef.current);
        tooltipDelayTimeoutRef.current = null;
      }
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (mobile) closeMobileMenu();
      return;
    }
    if (collapsed && !mobile) {
      const overviewItem = group.items.find((it) => it.label === "Tổng quan") ?? group.items[0];
      if (overviewItem) {
        navigate(overviewItem.to);
      }
      setHoveredGroupId(null);
      setShowTooltipBadge(false);
      if (tooltipDelayTimeoutRef.current !== null) {
        window.clearTimeout(tooltipDelayTimeoutRef.current);
        tooltipDelayTimeoutRef.current = null;
      }
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    } else {
      toggleGroup(group.id, group);
    }
  };

  const isGroupExpanded = (groupId: string, group: NavGroup) => {
    if (expandedGroups[groupId] !== undefined) {
      return expandedGroups[groupId];
    }
    return isGroupActive(location.pathname, group);
  };

  const toggleGroup = (groupId: string, group: NavGroup) => {
    const current = isGroupExpanded(groupId, group);
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !current,
    }));
  };

  if (!user) return null;

  const groups = navGroupsFor(user.roles);
  const displayName =
    user.teacher_profile?.full_name ?? user.student_profile?.full_name ?? user.email;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const renderSidebarContent = (mobile = false) => {
    const collapsed = mobile ? false : isCollapsed;
    return (
      <aside
        className={clsx(
          "relative flex h-full flex-col text-navy transition-[width,background-color,border-color] duration-200 ease-in-out select-none z-30",
          mobile
            ? "w-[min(22rem,85vw)] sm:w-80 bg-white/85 backdrop-blur-3xl shadow-2xl rounded-r-3xl border-r border-white/80"
            : collapsed
              ? "w-14 overflow-visible bg-transparent border-r-0 shadow-none backdrop-blur-none"
              : "w-64 bg-white/65 backdrop-blur-2xl border-r border-white/60 shadow-[4px_0_24px_rgba(7,20,38,0.02)]",
        )}
      >
        {/* Top Header */}
        <div
          className={clsx(
            "relative flex h-[4.5rem] shrink-0 items-center overflow-visible transition-colors duration-200",
            collapsed && !mobile ? "border-b-0 bg-transparent" : "border-b border-white/60",
          )}
        >
          {/* Logo slot: exactly w-14 (56px) shrink-0, centered at 28px in ALL states */}
          <div className="relative flex h-11 w-14 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={() => {
                if (collapsed && !mobile) {
                  setIsCollapsed(false);
                  setIsHoveredLogo(false);
                }
              }}
              onMouseEnter={() => {
                if (collapsed && !mobile) setIsHoveredLogo(true);
              }}
              onMouseLeave={() => {
                if (collapsed && !mobile) setIsHoveredLogo(false);
              }}
              className={clsx(
                "flex h-9 w-9 items-center justify-center select-none cursor-pointer overflow-hidden",
                "transition-all duration-150 ease-out active:duration-75 active:scale-90",
                collapsed && !mobile && isHoveredLogo
                  ? "rounded-xl bg-[#E5E7EB] text-slate-800 shadow-xs p-1.5"
                  : "rounded-xl bg-white border border-slate-200/80 shadow-xs p-1",
              )}
              aria-label={collapsed && !mobile ? "Mở rộng thanh điều hướng" : "NSA App"}
            >
              {collapsed && !mobile && isHoveredLogo ? (
                <Icon name="sidebar-expand" className="h-5 w-5 shrink-0 text-slate-800" />
              ) : (
                <img src="/logo.png" alt="NSA App" className="h-full w-full object-contain" />
              )}
            </button>

            {/* Tagline tooltip when collapsed and hovering logo */}
            {collapsed && !mobile && isHoveredLogo && (
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-xl border border-slate-200/90 animate-in fade-in zoom-in-95 duration-150">
                Mở rộng thanh điều hướng
              </div>
            )}
          </div>

          {/* Right header slot: fades/slides smoothly */}
          <div
            className={clsx(
              "flex items-center justify-between min-w-0 flex-1 pr-3 overflow-visible transition-opacity duration-200",
              collapsed && !mobile ? "opacity-0 pointer-events-none w-0" : "opacity-100",
            )}
          >
            <div className="truncate min-w-0">
              <p className="text-sm font-bold tracking-tight text-navy truncate">NSA App</p>
              <p className="text-[10px] text-gtext truncate">Management Platform</p>
            </div>
            {mobile ? (
              <button
                type="button"
                onClick={closeMobileMenu}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy/75 hover:bg-gbg2 transition-all duration-150 ease-out active:duration-75 active:scale-90"
                aria-label="Đóng menu"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsCollapsed(true);
                    setIsHoveredCollapse(false);
                  }}
                  onMouseEnter={() => setIsHoveredCollapse(true)}
                  onMouseLeave={() => setIsHoveredCollapse(false)}
                  className={clsx(
                    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-150 ease-out active:duration-75 active:scale-90 select-none",
                    isHoveredCollapse
                      ? "bg-slate-200/70 text-slate-900 shadow-2xs"
                      : "text-slate-700 bg-transparent hover:bg-slate-200/50",
                  )}
                  aria-label="Thu nhỏ thanh điều hướng"
                >
                  <Icon
                    name={isHoveredCollapse ? "sidebar-collapse" : "sidebar"}
                    className="h-5 w-5 shrink-0"
                  />
                </button>

                {/* Tagline tooltip when hovering collapse button in expanded mode */}
                {isHoveredCollapse && (
                  <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-xl border border-slate-200/90 animate-in fade-in zoom-in-95 duration-150">
                    Thu nhỏ thanh điều hướng
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation list */}
        <nav
          className={clsx(
            "flex-1 space-y-1 pb-4 pt-2 select-none",
            collapsed && !mobile ? "overflow-visible" : "overflow-y-auto overflow-x-hidden",
          )}
          aria-label="Điều hướng chính"
        >
          {groups.map((group) => {
            const isActiveGroup = isGroupActive(location.pathname, group);
            const isOpen = isGroupExpanded(group.id, group);
            const isHovered = hoveredGroupId === group.id;

            return (
              <div
                key={group.id}
                className="relative"
                onMouseLeave={() => {
                  if (collapsed && !mobile) handleMouseLeaveGroup();
                }}
              >
                {/* Header row: same unified layout for both states */}
                <button
                  type="button"
                  onClick={() => handleClickGroup(group, collapsed, mobile)}
                  onMouseEnter={() => {
                    if (collapsed && !mobile) handleMouseEnterIconButton(group.id);
                  }}
                  onMouseLeave={() => {
                    if (collapsed && !mobile) handleMouseLeaveIconButton();
                  }}
                  className={clsx(
                    "flex h-11 w-full items-center transition-all duration-150 ease-out active:duration-75 active:scale-[0.98] cursor-pointer select-none overflow-hidden",
                    isHovered && collapsed && !mobile
                      ? "bg-white/90 text-slate-900 rounded-none shadow-xs"
                      : isActiveGroup
                        ? "bg-white/80 text-[#0532e6] rounded-lg shadow-xs border border-white/90"
                        : "text-slate-700 hover:bg-white/50 active:bg-white/70 rounded-lg",
                  )}
                  aria-label={group.label}
                >
                  {/* Left slot: exactly w-14 (56px) shrink-0, centered at 28px in ALL states */}
                  <div className="flex h-11 w-14 shrink-0 items-center justify-center relative">
                    {isActiveGroup && collapsed && !mobile && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-[#0532e6]" />
                    )}
                    <Icon name={group.icon} className="h-5 w-5 shrink-0" />
                  </div>

                  {/* Right slot: expands/collapses smoothly */}
                  <div
                    className={clsx(
                      "flex items-center justify-between min-w-0 flex-1 pr-3 overflow-hidden transition-opacity duration-200",
                      collapsed && !mobile ? "opacity-0 pointer-events-none w-0" : "opacity-100",
                    )}
                  >
                    <span className="truncate text-sm font-semibold">{group.label}</span>
                    {!group.to && group.items.length > 0 && (
                      <Icon
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
                      />
                    )}
                  </div>
                </button>

                {/* Collapsed Flyout on hover */}
                {isHovered && collapsed && !mobile && (
                  group.to ? (
                    <div
                      className="absolute left-full top-0 z-50 flex items-center h-11 pl-2 drop-shadow-md animate-in fade-in zoom-in-95 duration-100"
                      onMouseEnter={() => handleMouseEnterFlyout(group.id)}
                      onMouseLeave={handleMouseLeaveGroup}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          navigate(group.to!);
                          setHoveredGroupId(null);
                          setShowTooltipBadge(false);
                        }}
                        className="flex items-center bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-slate-800 rounded-lg shadow-md border border-white/90 whitespace-nowrap cursor-pointer hover:text-[#0532e6] transition-colors"
                      >
                        {group.label}
                      </button>
                    </div>
                  ) : (
                    <div
                      className="absolute left-full top-0 z-50 flex flex-col min-w-[210px] drop-shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                      onMouseEnter={() => handleMouseEnterFlyout(group.id)}
                      onMouseLeave={handleMouseLeaveGroup}
                    >
                      <div
                        onClick={() => {
                          const overviewItem =
                            group.items.find((it) => it.label === "Tổng quan") ?? group.items[0];
                          if (overviewItem) {
                            navigate(overviewItem.to);
                            setHoveredGroupId(null);
                            setShowTooltipBadge(false);
                          }
                        }}
                        className="flex h-11 items-center bg-white/90 px-3.5 pr-6 rounded-tr-xl rounded-l-none cursor-pointer transition-colors active:bg-white/95 border-t border-r border-white/90"
                      >
                        {showTooltipBadge ? (
                          <div className="relative flex items-center bg-white px-3 py-1 text-xs font-semibold text-slate-800 rounded-md shadow-xs border border-white/90 whitespace-nowrap animate-in fade-in duration-150">
                            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-l border-b border-slate-200/90 rotate-45" />
                            <span className="relative z-10 pl-0.5">{group.label}</span>
                          </div>
                        ) : (
                          <span className="text-sm font-semibold text-[#0532e6] pl-1 tracking-tight select-none">
                            {group.label}
                          </span>
                        )}
                      </div>

                      <div className="bg-white/90 backdrop-blur-3xl border-b border-l border-r border-white/90 rounded-b-2xl shadow-2xl py-1.5 flex flex-col">
                        {group.items.map((sub) => {
                          const isSubActive = isItemActive(location.pathname, sub);
                          return (
                            <NavLink
                              key={sub.to}
                              to={sub.to}
                              end={sub.end}
                              onClick={() => {
                                setHoveredGroupId(null);
                                if (mobile) closeMobileMenu();
                              }}
                              className={clsx(
                                "group/sub relative flex h-9 items-center px-4 text-sm transition-all duration-150 ease-out active:duration-75 active:scale-[0.98] select-none cursor-pointer",
                                isSubActive
                                  ? "font-semibold text-slate-900 bg-white/70"
                                  : "text-slate-700 hover:text-slate-900 hover:bg-white/50 active:bg-white/80",
                              )}
                            >
                              <div className="w-3.5 flex items-center justify-start shrink-0 mr-1.5">
                                {isSubActive && (
                                  <span className="h-4.5 w-[3.5px] rounded-full bg-[#0532e6]" />
                                )}
                              </div>
                              <span className="truncate">{sub.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}

                {/* Expanded Subitems */}
                {isOpen && (!collapsed || mobile) && (
                  <div className="space-y-0.5 pt-0.5 pb-1">
                    {group.items.map((sub) => {
                      const isSubActive = isItemActive(location.pathname, sub);
                      return (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          end={sub.end}
                          onClick={() => {
                            if (mobile) closeMobileMenu();
                          }}
                          className={clsx(
                            "relative flex items-center h-9 text-sm transition-all duration-150 ease-out active:duration-75 active:scale-[0.98] rounded-lg select-none pl-14 pr-3 cursor-pointer",
                            isSubActive
                              ? "font-semibold text-slate-900 bg-white/75 shadow-2xs border border-white/80"
                              : "text-slate-600 hover:text-slate-900 hover:bg-white/40 active:bg-white/60",
                          )}
                        >
                          {isSubActive && (
                            <span className="absolute left-10 top-1/2 -translate-y-1/2 h-4.5 w-[3.5px] rounded-full bg-[#0532e6]" />
                          )}
                          <span className="truncate">{sub.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom User Profile & Logout */}
        <div
          className={clsx(
            "space-y-1 overflow-visible transition-colors duration-200",
            collapsed && !mobile
              ? "border-t-0 py-2 bg-transparent"
              : "border-t border-white/60 p-3 bg-white/30 backdrop-blur-sm",
          )}
        >
          {/* User profile row */}
          <div className="relative group">
            <div className="flex h-11 w-full items-center overflow-hidden rounded-lg">
              {/* Left slot: exactly w-14 (56px) shrink-0, centered at 28px in ALL states */}
              <div className="flex h-11 w-14 shrink-0 items-center justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-white cursor-pointer transition-all duration-150 ease-out active:duration-75 active:scale-90 hover:scale-105 shadow-2xs">
                  {initials}
                </div>
              </div>
              {/* Right slot */}
              <div
                className={clsx(
                  "min-w-0 flex-1 truncate pr-2 transition-opacity duration-200",
                  collapsed && !mobile ? "opacity-0 pointer-events-none w-0" : "opacity-100",
                )}
              >
                <p className="truncate text-xs font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-[10px] text-gtext">{user.email}</p>
              </div>
            </div>
            {collapsed && !mobile && (
              <div className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 whitespace-nowrap rounded-lg bg-white/90 backdrop-blur-xl text-slate-800 font-medium text-xs px-3 py-1.5 shadow-xl border border-white/90">
                <p className="font-semibold">{displayName}</p>
                <p className="text-[10px] text-gtext">{user.email}</p>
              </div>
            )}
          </div>

          {/* Logout button row */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-full cursor-pointer items-center rounded-lg text-slate-700 transition-all duration-150 ease-out active:duration-75 active:scale-[0.96] hover:bg-red-50 hover:text-red-700 active:bg-red-100 select-none overflow-hidden"
            >
              {/* Left slot: exactly w-14 (56px) shrink-0, centered at 28px in ALL states */}
              <div className="flex h-10 w-14 shrink-0 items-center justify-center">
                <Icon name="logout" className="h-5 w-5 shrink-0" />
              </div>
              {/* Right slot */}
              <span
                className={clsx(
                  "truncate pr-3 text-sm font-medium transition-opacity duration-200",
                  collapsed && !mobile ? "opacity-0 pointer-events-none w-0" : "opacity-100",
                )}
              >
                Đăng xuất
              </span>
            </button>
            {collapsed && !mobile && (
              <div className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 whitespace-nowrap rounded-lg bg-white/90 backdrop-blur-xl text-slate-800 font-medium text-xs px-3 py-1.5 shadow-xl border border-white/90">
                Đăng xuất
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  };

  return (
    <div className="relative flex h-dvh w-full max-w-full overflow-hidden bg-[#f8fafc] select-none">
      {/* Soft ambient lighting halos matching new theme */}
      <div className="pointer-events-none fixed -top-32 -left-32 h-[560px] w-[560px] rounded-full bg-[#0532e6]/8 blur-[140px]" />
      <div className="pointer-events-none fixed top-1/3 -right-32 h-[520px] w-[520px] rounded-full bg-[#C4A35A]/10 blur-[150px]" />
      <div className="pointer-events-none fixed -bottom-32 left-1/4 h-[480px] w-[480px] rounded-full bg-[#001258]/6 blur-[130px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(#0012580a_1px,transparent_1px)] [background-size:24px_24px] opacity-70" />

      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-navy px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Chuyển đến nội dung chính
      </a>
      <div className="hidden h-full shrink-0 lg:block z-30 relative overflow-visible">
        {renderSidebarContent(false)}
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden overflow-hidden touch-none">
          <button
            className={clsx(
              "absolute inset-0 bg-navy/40 backdrop-blur-md touch-none overscroll-none",
              isClosingMenu ? "animate-backdrop-out" : "animate-backdrop-in",
            )}
            onClick={closeMobileMenu}
            onTouchMove={(e) => e.preventDefault()}
            aria-label="Đóng menu"
          />
          <div
            className={clsx(
              "absolute inset-y-0 left-0 z-50 shadow-2xl flex",
              isClosingMenu ? "animate-drawer-out" : "animate-drawer-in",
            )}
          >
            {renderSidebarContent(true)}
          </div>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col relative z-10">
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between lg:justify-end pb-3">
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/60 backdrop-blur-md text-navy hover:bg-white/85 active:scale-90 active:bg-white/95 lg:hidden shadow-2xs transition-all"
                aria-label="Mở menu"
                onClick={openMobileMenu}
              >
                <Icon name="menu" />
              </button>
              <div className="relative" ref={notificationRef}>
                <button
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/60 backdrop-blur-md text-navy/80 transition-all hover:bg-white/85 active:scale-90 active:bg-white/95 hover:text-navy shadow-2xs"
                  aria-label="Thông báo"
                  aria-expanded={notificationsOpen}
                  onClick={handleToggleNotifications}
                >
                  <Icon name="bell" className="h-5 w-5" />
                  {!!notifications.data?.unread && (
                    <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white shadow-2xs">
                      {Math.min(notifications.data.unread, 99)}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/90 bg-white/85 backdrop-blur-3xl shadow-elevated animate-in fade-in zoom-in-95 duration-150">
                    <div className="border-b border-white/70 bg-white/40 px-4 py-3">
                      <b className="text-sm text-navy">Thông báo</b>
                      <p className="text-xs text-gtext">
                        {notifications.data?.unread ?? 0} chưa đọc
                      </p>
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto">
                      {notifications.data?.items.map((item) => (
                        <button
                          key={item.id}
                          className={clsx(
                            "block w-full border-b border-white/60 px-4 py-3 text-left hover:bg-white/60 transition-colors",
                            item.status === "unread" && "bg-[#0532e6]/10",
                          )}
                          onClick={() => {
                            if (item.status === "unread") markRead.mutate(item.id);
                            setNotificationsOpen(false);
                            if (item.action_url?.startsWith("/")) navigate(item.action_url);
                          }}
                        >
                          <span className="block text-sm font-semibold text-navy">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs text-gtext">{item.message}</span>
                          <span className="mt-1 block text-[10px] text-gtext">
                            {formatDateTime(item.created_at)}
                          </span>
                        </button>
                      ))}
                      {!notifications.data?.items.length && (
                        <p className="p-6 text-center text-sm text-gtext">Chưa có thông báo.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
