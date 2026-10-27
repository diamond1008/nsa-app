import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { useAuth } from "../auth/AuthContext";
import { ExecutiveSalesDashboard } from "./ExecutiveSalesDashboard";
import { PersonalSalesDashboard } from "./PersonalSalesDashboard";

export { PersonalSalesDashboard };
export const PersonalSaleDashboard = PersonalSalesDashboard;

export function SaleDashboardPage() {
  const { hasRole, user } = useAuth();
  const isSaleAdmin =
    hasRole("ADMIN", "SALE_ADMIN") ||
    user?.roles?.some((r) => r.toUpperCase().includes("ADMIN")) ||
    user?.email?.toLowerCase().includes("admin");

  const [viewMode, setViewMode] = useState<"executive" | "personal">("executive");
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlotEl(document.getElementById("app-top-header-slot"));
  }, []);

  if (!isSaleAdmin) {
    return <PersonalSalesDashboard />;
  }

  const switcherContent = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-1.5 shadow-2xs backdrop-blur-xl w-full">
      <div className="flex items-center gap-1 rounded-xl border border-white/60 bg-slate-100/60 p-0.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setViewMode("executive")}
          className={clsx(
            "rounded-lg px-3.5 py-1 text-sm font-bold transition-all",
            viewMode === "executive"
              ? "bg-white text-navy shadow-xs border border-white/80"
              : "text-slate-500 hover:text-navy",
          )}
        >
          <span>Toàn phòng</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("personal")}
          className={clsx(
            "rounded-lg px-3.5 py-1 text-sm font-bold transition-all",
            viewMode === "personal"
              ? "bg-white text-navy shadow-xs border border-white/80"
              : "text-slate-500 hover:text-navy",
          )}
        >
          <span>Cá nhân</span>
        </button>
      </div>

      <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span>
          Quản lý: <strong className="text-navy font-semibold">{user?.email}</strong>
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {slotEl ? createPortal(switcherContent, slotEl) : switcherContent}
      {viewMode === "executive" ? <ExecutiveSalesDashboard /> : <PersonalSalesDashboard />}
    </div>
  );
}
