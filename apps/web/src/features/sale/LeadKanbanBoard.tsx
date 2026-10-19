import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";

import { Icon } from "../../components/icons";
import type { Lead, LeadPipelineStatus } from "../../lib/domainTypes";
import { formatDate } from "../../lib/format";
import { getSourceLabel } from "./saleShared";

interface LeadKanbanBoardProps {
  leads: Lead[];
  onStatusChange: (leadId: string, newStatus: LeadPipelineStatus) => void;
  isUpdating?: boolean;
  onSelectLead?: (leadId: string) => void;
}

interface StageConfig {
  status: LeadPipelineStatus;
  title: string;
  shortDesc: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  // Tone màu nhẹ phong cách liquid glass khi chưa chọn
  cardBg: string;
  cardBorder: string;
  cardHoverBg: string;
  cardHoverBorder: string;
  titleColor: string;
  descColor: string;
  // Trạng thái đang chọn
  activeBorder: string;
  activeBg: string;
  activeText: string;
  activeRing: string;
  // Trạng thái khi kéo rê vào ô
  dragOverBg: string;
  dragOverBorder: string;
}

const KANBAN_STAGES: StageConfig[] = [
  {
    status: "data_moi",
    title: "Data mới",
    shortDesc: "Lead mới tiếp nhận cần liên hệ",
    dotColor: "bg-sky-500",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
    cardBg: "bg-sky-50/50 backdrop-blur-xs",
    cardBorder: "border-sky-200/70",
    cardHoverBg: "hover:bg-sky-50/80",
    cardHoverBorder: "hover:border-sky-300",
    titleColor: "text-sky-950 group-hover:text-sky-700",
    descColor: "text-sky-900/70",
    activeBorder: "border-sky-500",
    activeBg: "bg-sky-100/70",
    activeText: "text-sky-950",
    activeRing: "ring-2 ring-sky-300/60 shadow-xs",
    dragOverBg: "bg-sky-100/90",
    dragOverBorder: "border-sky-500 ring-4 ring-sky-200",
  },
  {
    status: "knm_thue_bao",
    title: "KNM / Thuê bao",
    shortDesc: "Không nghe máy hoặc bận",
    dotColor: "bg-orange-500",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-800",
    cardBg: "bg-orange-50/50 backdrop-blur-xs",
    cardBorder: "border-orange-200/70",
    cardHoverBg: "hover:bg-orange-50/80",
    cardHoverBorder: "hover:border-orange-300",
    titleColor: "text-orange-950 group-hover:text-orange-700",
    descColor: "text-orange-900/70",
    activeBorder: "border-orange-500",
    activeBg: "bg-orange-100/70",
    activeText: "text-orange-950",
    activeRing: "ring-2 ring-orange-300/60 shadow-xs",
    dragOverBg: "bg-orange-100/90",
    dragOverBorder: "border-orange-500 ring-4 ring-orange-200",
  },
  {
    status: "goi_lai_sau",
    title: "Gọi lại sau",
    shortDesc: "Khách hẹn gọi lại theo lịch",
    dotColor: "bg-amber-500",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    cardBg: "bg-amber-50/50 backdrop-blur-xs",
    cardBorder: "border-amber-200/70",
    cardHoverBg: "hover:bg-amber-50/80",
    cardHoverBorder: "hover:border-amber-300",
    titleColor: "text-amber-950 group-hover:text-amber-700",
    descColor: "text-amber-900/70",
    activeBorder: "border-amber-500",
    activeBg: "bg-amber-100/70",
    activeText: "text-amber-950",
    activeRing: "ring-2 ring-amber-300/60 shadow-xs",
    dragOverBg: "bg-amber-100/90",
    dragOverBorder: "border-amber-500 ring-4 ring-amber-200",
  },
  {
    status: "follow",
    title: "Follow / Chăm sóc",
    shortDesc: "Đang tư vấn, tìm hiểu khóa học",
    dotColor: "bg-indigo-500",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-800",
    cardBg: "bg-indigo-50/50 backdrop-blur-xs",
    cardBorder: "border-indigo-200/70",
    cardHoverBg: "hover:bg-indigo-50/80",
    cardHoverBorder: "hover:border-indigo-300",
    titleColor: "text-indigo-950 group-hover:text-indigo-700",
    descColor: "text-indigo-900/70",
    activeBorder: "border-indigo-500",
    activeBg: "bg-indigo-100/70",
    activeText: "text-indigo-950",
    activeRing: "ring-2 ring-indigo-300/60 shadow-xs",
    dragOverBg: "bg-indigo-100/90",
    dragOverBorder: "border-indigo-500 ring-4 ring-indigo-200",
  },
  {
    status: "tu_choi",
    title: "Từ chối",
    shortDesc: "Không có nhu cầu / sai số",
    dotColor: "bg-rose-500",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
    cardBg: "bg-rose-50/50 backdrop-blur-xs",
    cardBorder: "border-rose-200/70",
    cardHoverBg: "hover:bg-rose-50/80",
    cardHoverBorder: "hover:border-rose-300",
    titleColor: "text-rose-950 group-hover:text-rose-700",
    descColor: "text-rose-900/70",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-100/70",
    activeText: "text-rose-950",
    activeRing: "ring-2 ring-rose-300/60 shadow-xs",
    dragOverBg: "bg-rose-100/90",
    dragOverBorder: "border-rose-500 ring-4 ring-rose-200",
  },
  {
    status: "da_dang_ky",
    title: "Đã đăng ký",
    shortDesc: "Chốt thành công thành học viên",
    dotColor: "bg-emerald-500",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    cardBg: "bg-emerald-50/50 backdrop-blur-xs",
    cardBorder: "border-emerald-200/70",
    cardHoverBg: "hover:bg-emerald-50/80",
    cardHoverBorder: "hover:border-emerald-300",
    titleColor: "text-emerald-950 group-hover:text-emerald-700",
    descColor: "text-emerald-900/70",
    activeBorder: "border-emerald-500",
    activeBg: "bg-emerald-100/70",
    activeText: "text-emerald-950",
    activeRing: "ring-2 ring-emerald-300/60 shadow-xs",
    dragOverBg: "bg-emerald-100/90",
    dragOverBorder: "border-emerald-500 ring-4 ring-emerald-200",
  },
];

export function LeadKanbanBoard({
  leads,
  onStatusChange,
  isUpdating = false,
  onSelectLead,
}: LeadKanbanBoardProps) {
  // Trạng thái đang chọn để hiển thị danh sách chính bên trái
  const [activeStatus, setActiveStatus] = useState<LeadPipelineStatus>(() => {
    const saved = localStorage.getItem("nsa_kanban_active_stage") as LeadPipelineStatus;
    return saved && KANBAN_STAGES.some((s) => s.status === saved) ? saved : "data_moi";
  });

  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<LeadPipelineStatus | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragCardWidth, setDragCardWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectStage = (status: LeadPipelineStatus) => {
    setActiveStatus(status);
    localStorage.setItem("nsa_kanban_active_stage", status);
    setSearchQuery("");
  };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, lead: Lead) => {
    // Chỉ kích hoạt khi bấm chuột trái
    if (e.button !== 0) return;

    // Không kích hoạt kéo khi click vào nút hoặc link
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) {
      return;
    }

    const cardEl = e.currentTarget;
    const rect = cardEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);
      if (!hasMoved && dist > 4) {
        hasMoved = true;
        setDraggedLead(lead);
        setDragCardWidth(rect.width);
        setDragOffset({ x: offsetX, y: offsetY });
        document.body.style.userSelect = "none";
      }

      if (hasMoved) {
        setPointerPos({ x: moveEv.clientX, y: moveEv.clientY });

        const el = document.elementFromPoint(moveEv.clientX, moveEv.clientY);
        const stageEl = el?.closest("[data-stage-status]");
        const targetStatus = stageEl?.getAttribute(
          "data-stage-status",
        ) as LeadPipelineStatus | null;
        if (targetStatus && targetStatus !== lead.pipeline_status) {
          setDragOverTarget(targetStatus);
        } else {
          setDragOverTarget(null);
        }
      }
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.userSelect = "";

      if (hasMoved) {
        const el = document.elementFromPoint(upEv.clientX, upEv.clientY);
        const stageEl = el?.closest("[data-stage-status]");
        const targetStatus = stageEl?.getAttribute(
          "data-stage-status",
        ) as LeadPipelineStatus | null;

        if (targetStatus && targetStatus !== lead.pipeline_status) {
          onStatusChange(lead.id, targetStatus);
        }

        setDraggedLead(null);
        setDragOverTarget(null);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const currentStageConfig =
    KANBAN_STAGES.find((s) => s.status === activeStatus) || KANBAN_STAGES[0];

  // Lọc các lead theo trạng thái đang chọn
  const activeLeads = leads.filter((l) => l.pipeline_status === activeStatus);

  // Tìm kiếm cục bộ trong trạng thái nếu có gõ
  const displayedLeads = searchQuery.trim()
    ? activeLeads.filter(
        (l) =>
          l.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (l.phone && l.phone.includes(searchQuery)) ||
          (l.email && l.email.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : activeLeads;

  return (
    <div className="relative">
      {/* Loading Overlay */}
      {isUpdating && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-white/50 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 rounded-xl bg-navy px-4 py-2.5 text-xs font-semibold text-white shadow-xl">
            <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
            Đang cập nhật trạng thái Lead...
          </div>
        </div>
      )}

      {/* Bố cục chia đôi: Trái (Cột chính) - Phải (Bảng chuyển trạng thái thon gọn chiều ngang, dính theo khi cuộn) */}
      <div className="flex flex-col gap-5 lg:flex-row">
        {/* VÙNG CHÍNH BÊN TRÁI: Danh sách Lead của trạng thái đang chọn */}
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            {/* Header Cột chính */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={clsx(
                      "h-3.5 w-3.5 rounded-full ring-4 ring-slate-100 shrink-0",
                      currentStageConfig.dotColor,
                    )}
                  />
                  <h3 className="text-base font-bold text-navy">{currentStageConfig.title}</h3>
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 text-xs font-bold",
                      currentStageConfig.badgeBg,
                      currentStageConfig.badgeText,
                    )}
                  >
                    {activeLeads.length} Lead
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {currentStageConfig.shortDesc} •{" "}
                  <span className="text-slate-600 font-medium">
                    Kéo thẻ sang ô bên phải để đổi trạng thái
                  </span>
                </p>
              </div>

              {/* Tìm kiếm nhanh trong cột */}
              {activeLeads.length > 0 && (
                <div className="relative w-full sm:w-64">
                  <Icon
                    name="search"
                    className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Tìm tên, SĐT trong cột này..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-3 py-1.5 text-xs text-navy focus:border-brand focus:bg-white focus:outline-hidden"
                  />
                </div>
              )}
            </div>

            {/* Danh sách thẻ Lead */}
            <div className="mt-4">
              {displayedLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200/80 bg-slate-50/50 py-16 text-center">
                  <div className="rounded-2xl bg-slate-100 p-4 text-slate-400">
                    <Icon name="users" className="h-8 w-8 text-slate-400" />
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-navy">
                    {searchQuery
                      ? "Không tìm thấy Lead nào khớp với tìm kiếm"
                      : "Chưa có Lead nào ở trạng thái này"}
                  </h4>
                  <p className="mt-1 max-w-sm text-xs text-slate-500">
                    {searchQuery
                      ? "Vui lòng thử từ khóa tìm kiếm khác."
                      : "Bạn có thể kéo thẻ từ trạng thái khác sang ô bên phải để chuyển vào đây."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Thanh chỉ dẫn động khi đang kéo thẻ */}
                  {draggedLead && (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-emerald-500/10 border border-[#0532e6]/25 px-4 py-3 text-xs text-navy shadow-xs animate-pulse">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0532e6] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0532e6]"></span>
                        </span>
                        <span>
                          Đang di chuyển:{" "}
                          <strong className="font-bold text-[#0532e6]">
                            {draggedLead.full_name}
                          </strong>
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 hidden sm:inline-block">
                        Thả sang ô giai đoạn bên phải để chuyển bước
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                    {displayedLeads.map((lead) => {
                      const isDragging = draggedLead?.id === lead.id;
                      const isOtherDimmed = draggedLead !== null && !isDragging;

                      return (
                        <div
                          key={lead.id}
                          onPointerDown={(e) => handleCardPointerDown(e, lead)}
                          className={clsx(
                            "group relative flex flex-col justify-between rounded-xl border bg-white p-4 shadow-xs transition-all duration-300 ease-out select-none",
                            isDragging
                              ? "border-2 border-dashed border-[#0532e6]/60 bg-[#0532e6]/5 opacity-40 scale-[0.98] ring-2 ring-[#0532e6]/20 cursor-grabbing"
                              : isOtherDimmed
                                ? "opacity-25 scale-[0.98] blur-[0.6px] pointer-events-none select-none transition-all duration-300"
                                : "border-slate-200/90 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 cursor-grab active:cursor-grabbing",
                          )}
                        >
                          {/* Drag Handle Bar Indicator */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {onSelectLead ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectLead(lead.id);
                                  }}
                                  className="font-bold text-sm text-navy hover:text-[#0532e6] hover:underline text-left cursor-pointer"
                                >
                                  {lead.full_name}
                                </button>
                              ) : (
                                <Link
                                  to={`/sale/leads/${lead.id}`}
                                  className="font-bold text-sm text-navy hover:text-[#0532e6] hover:underline"
                                >
                                  {lead.full_name}
                                </Link>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                {lead.phone ? (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-navy/90 hover:text-[#0532e6]"
                                  >
                                    <Icon name="phone" className="h-3 w-3 text-slate-400" />
                                    {lead.phone}
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">Chưa có SĐT</span>
                                )}
                                {lead.source && (
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    {getSourceLabel(lead.source)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span className="shrink-0 rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                              {formatDate(lead.created_at)}
                            </span>
                          </div>

                          {/* Interested Course */}
                          {lead.interested_course_name && (
                            <div className="mt-2.5">
                              <span className="inline-flex items-center gap-1.5 max-w-full truncate rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                <Icon name="book" className="h-3 w-3 shrink-0 text-sky-600" />
                                <span className="truncate">{lead.interested_course_name}</span>
                              </span>
                            </div>
                          )}

                          {/* Notes snippet */}
                          {lead.notes && (
                            <p className="mt-2 line-clamp-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 italic">
                              "{lead.notes}"
                            </p>
                          )}

                          {/* Card Footer: Assignee & Actions */}
                          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                            <div
                              className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate max-w-[140px]"
                              title={lead.assigned_to_email || "Chưa phân bổ"}
                            >
                              <Icon name="user" className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {lead.assigned_to_email
                                  ? lead.assigned_to_email.split("@")[0]
                                  : "Tự động phân bổ"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onSelectLead ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectLead(lead.id);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                                >
                                  Chi tiết
                                </button>
                              ) : (
                                <Link to={`/sale/leads/${lead.id}`}>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                                  >
                                    Chi tiết
                                  </button>
                                </Link>
                              )}
                              <Link to={`/sale/phieu-dang-ky?lead_id=${lead.id}`}>
                                <button
                                  type="button"
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs"
                                >
                                  Phiếu ĐK
                                </button>
                              </Link>
                            </div>
                          </div>

                          {/* Drag Hint Tag */}
                          <div className="mt-2 text-right">
                            <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 font-medium select-none">
                              Kéo thẻ sang ô bên phải để đổi trạng thái
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* VÙNG BÊN PHẢI: Bảng Chuyển Trạng Thái (Thon gọn chiều ngang, dính theo khi cuộn chuột) */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0">
          <div className="sticky top-4 lg:top-6 z-20 rounded-2xl border border-white/80 bg-white/75 backdrop-blur-md p-4 sm:p-5 shadow-lg shadow-navy/5">
            <div className="border-b border-slate-200/60 pb-3">
              <h4 className="text-sm font-bold text-navy uppercase tracking-wider">
                Giai đoạn xử lý Lead
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">Nhấp để xem • Kéo thẻ để chuyển bước</p>
            </div>

            {/* Danh sách các ô trạng thái: Tone màu nhẹ liquid glass, chữ rõ nét */}
            <div className="mt-4 space-y-3.5">
              {KANBAN_STAGES.map((stage) => {
                const isCurrent = stage.status === activeStatus;
                const isOver = dragOverTarget === stage.status;
                const isDraggingAny = draggedLead !== null;
                const count = leads.filter((l) => l.pipeline_status === stage.status).length;

                return (
                  <div
                    key={stage.status}
                    data-stage-status={stage.status}
                    onClick={() => handleSelectStage(stage.status)}
                    className={clsx(
                      "group relative flex flex-col justify-between rounded-xl border p-4 min-h-[96px] transition-all duration-300 select-none cursor-pointer",
                      isCurrent
                        ? clsx(
                            "border-2 shadow-xs",
                            stage.activeBorder,
                            stage.activeBg,
                            stage.activeRing,
                          )
                        : isOver
                          ? clsx(
                              "border-2 shadow-xl scale-[1.04] -translate-x-1 ring-4 ring-emerald-200",
                              stage.dragOverBorder,
                              stage.dragOverBg,
                            )
                          : isDraggingAny
                            ? "border-2 border-dashed border-indigo-400 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200/50 animate-pulse hover:bg-indigo-100/70"
                            : clsx(
                                stage.cardBg,
                                stage.cardBorder,
                                stage.cardHoverBg,
                                stage.cardHoverBorder,
                                "hover:shadow-xs",
                              ),
                    )}
                  >
                    {/* Hàng trên: Chấm màu + Tên trạng thái + Badge số lượng */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={clsx(
                            "h-3 w-3 rounded-full shrink-0 shadow-2xs transition-transform duration-200",
                            stage.dotColor,
                            isOver && "scale-125",
                          )}
                        />
                        <span
                          className={clsx(
                            "text-sm font-bold truncate transition-colors",
                            isCurrent
                              ? stage.activeText
                              : isOver
                                ? "text-emerald-900"
                                : stage.titleColor,
                          )}
                        >
                          {stage.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrent && (
                          <span className="rounded bg-navy/10 px-1.5 py-0.5 text-[9px] font-bold text-navy uppercase">
                            Đang xem
                          </span>
                        )}
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-xs font-bold shadow-2xs transition-all duration-200",
                            isOver
                              ? "scale-125 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-200"
                              : clsx(stage.badgeBg, stage.badgeText),
                          )}
                        >
                          {count}
                        </span>
                      </div>
                    </div>

                    {/* Hàng dưới: Mô tả trạng thái hoặc thông báo thả thẻ */}
                    <div className="mt-2.5">
                      {isOver ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 animate-pulse">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                          <span>Thả tay để chuyển sang {stage.title}</span>
                        </div>
                      ) : isDraggingAny && !isCurrent ? (
                        <p className="text-xs font-semibold text-indigo-700 leading-relaxed inline-flex items-center gap-1.5 animate-bounce">
                          <span>↓</span> Thả thẻ vào đây để chuyển bước
                        </p>
                      ) : (
                        <p
                          className={clsx(
                            "text-xs leading-relaxed truncate transition-colors",
                            isCurrent ? "text-slate-700 font-medium" : stage.descColor,
                          )}
                        >
                          {stage.shortDesc}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick summary footer */}
            <div className="mt-4 rounded-xl border border-white/60 bg-white/60 p-3 text-center text-xs text-slate-600 backdrop-blur-xs">
              Tổng số khách hàng: <strong className="text-navy font-bold">{leads.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* THẺ NGUYÊN VẸN 100% SẮC NÉT BAY THEO CON TRỎ CHUỘT KHI KÉO */}
      {draggedLead && (
        <div
          className="fixed pointer-events-none z-50 select-none shadow-2xl transition-transform duration-75"
          style={{
            left: `${pointerPos.x - dragOffset.x}px`,
            top: `${pointerPos.y - dragOffset.y}px`,
            width: `${dragCardWidth}px`,
            transform: "rotate(2deg) scale(1.02)",
          }}
        >
          <div className="rounded-xl border-2 border-[#0532e6] bg-white p-4 shadow-2xl ring-4 ring-[#0532e6]/25">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-navy">{draggedLead.full_name}</h4>
                <div className="mt-1 flex items-center gap-2">
                  {draggedLead.phone ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-navy/90">
                      <Icon name="phone" className="h-3 w-3 text-slate-400" />
                      {draggedLead.phone}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Chưa có SĐT</span>
                  )}
                  {draggedLead.source && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {getSourceLabel(draggedLead.source)}
                    </span>
                  )}
                </div>
              </div>

              <span className="shrink-0 rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {formatDate(draggedLead.created_at)}
              </span>
            </div>

            {draggedLead.interested_course_name && (
              <div className="mt-2.5">
                <span className="inline-flex items-center gap-1.5 max-w-full truncate rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  <Icon name="book" className="h-3 w-3 shrink-0 text-sky-600" />
                  <span className="truncate">{draggedLead.interested_course_name}</span>
                </span>
              </div>
            )}

            {draggedLead.notes && (
              <p className="mt-2 line-clamp-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 italic">
                "{draggedLead.notes}"
              </p>
            )}

            <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate max-w-[140px]">
                <Icon name="user" className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate">
                  {draggedLead.assigned_to_email
                    ? draggedLead.assigned_to_email.split("@")[0]
                    : "Tự động phân bổ"}
                </span>
              </div>

              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
                Đang di chuyển
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
